import { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, clipboard, systemPreferences, screen, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { keyboard, Key } from '@nut-tree-fork/nut-js'
import { captureSmartContext, getSmartContextAccessStatus, type SmartContext } from './smartContext'
const logDir = path.join(os.homedir(), '.truhandsfree', 'logs')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
const electronLogStr = fs.createWriteStream(path.join(logDir, 'electron.log'), { flags: 'a' })

type RecordingMode = 'dictation' | 'smart_transform'
type BackendBootState = {
    phase: 'booting_backend' | 'ready' | 'error'
    label: string
    detail: string
    progress: number | null
}

type WidgetPresentationSource = 'tray' | 'hotkey' | 'idle'
type WidgetPresentationCommand = {
    visible: boolean
    source: WidgetPresentationSource
}

type CaptureMode = RecordingMode | 'mic_test'
type CaptureState = {
    is_recording: boolean
    is_testing: boolean
    mode: CaptureMode | null
    amplitude: number
    error: string | null
    active_device_id: string | null
    active_device_label: string | null
    fallback_to_default: boolean
    fallback_notice: string | null
}

type CaptureAudioConfig = {
    input_device: string | null
    input_device_id: string | null
    input_device_label: string | null
}

type CaptureStats = {
    duration_ms: number
    peak: number
    rms: number
    used_device_id: string | null
    used_device_label: string | null
    fallback_to_default: boolean
    fallback_notice: string | null
}

type CaptureStopResult = {
    status: 'success' | 'error'
    audio_base64?: string
    error?: string
    capture_stats?: CaptureStats
}

type ActiveCaptureSession =
    | {
        kind: 'recording'
        mode: RecordingMode
        context: SmartContext | null
        contextWarning: string | null
        requestedDeviceId: string | null
        requestedDeviceLabel: string | null
    }
    | {
        kind: 'mic_test'
        requestedDeviceId: string | null
        requestedDeviceLabel: string | null
    }

type LocalAppState = {
    onboardingDismissed: boolean
    onboardingCompleted: boolean
}

type LaunchContext = {
    is_packaged: boolean
    backend_base_url: string
    app_version: string
    install_location: 'applications' | 'disk_image' | 'other' | 'development'
    should_prompt_move_to_applications: boolean
    onboarding_completed: boolean
    onboarding_dismissed: boolean
    log_paths: {
        backend: string
        electron: string
    }
}

const WIDGET_TOP_OFFSET = 6
const WIDGET_HIDE_FALLBACK_MS = 260
const PRIVACY_SETTINGS_URLS = {
    microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
} as const

function logToFile(msg: string) {
    const ts = new Date().toISOString()
    electronLogStr.write(`[${ts}] ${msg}\n`)
    console.log(`[${ts}] ${msg}`)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let widgetWin: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let captureWin: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null
let tray: Tray | null = null
let widgetAutoShownForRecording = false
let backendProbeTimer: NodeJS.Timeout | null = null
let widgetHideFallbackTimer: NodeJS.Timeout | null = null
let backendPort: number | null = null
let backendBaseUrl = ''
let backendShutdownExpected = false
let appState: LocalAppState = {
    onboardingDismissed: false,
    onboardingCompleted: false,
}
let backendBootState: BackendBootState = {
    phase: 'booting_backend',
    label: 'Preparing TruHandsFree',
    detail: 'Checking the local engine.',
    progress: 12,
}
let captureHostReady = false
let captureReadyResolvers: Array<() => void> = []
const pendingCaptureRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: NodeJS.Timeout
}>()
let activeCaptureSession: ActiveCaptureSession | null = null
let captureState: CaptureState = {
    is_recording: false,
    is_testing: false,
    mode: null,
    amplitude: 0,
    error: null,
    active_device_id: null,
    active_device_label: null,
    fallback_to_default: false,
    fallback_notice: null,
}

function setBackendBootState(nextState: BackendBootState) {
    backendBootState = nextState
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('backend-boot-state', backendBootState)
    }
}

function broadcastCaptureState() {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
            win.webContents.send('capture-state', captureState)
        }
    }
}

function setCaptureState(patch: Partial<CaptureState>) {
    captureState = {
        ...captureState,
        ...patch,
    }
    broadcastCaptureState()
}

function getAppStateFile() {
    return path.join(app.getPath('userData'), 'app-state.json')
}

function loadAppState(): LocalAppState {
    try {
        const raw = fs.readFileSync(getAppStateFile(), 'utf-8')
        const parsed = JSON.parse(raw) as Partial<LocalAppState>
        return {
            onboardingDismissed: Boolean(parsed.onboardingDismissed),
            onboardingCompleted: Boolean(parsed.onboardingCompleted),
        }
    } catch {
        return {
            onboardingDismissed: false,
            onboardingCompleted: false,
        }
    }
}

function saveAppState(nextState: LocalAppState) {
    appState = nextState
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(getAppStateFile(), JSON.stringify(appState, null, 2))
}

function updateAppState(patch: Partial<LocalAppState>) {
    saveAppState({
        ...appState,
        ...patch,
    })
}

function getInstallLocation(): LaunchContext['install_location'] {
    if (!app.isPackaged) return 'development'

    const execPath = app.getPath('exe')
    if (execPath.startsWith('/Applications/')) return 'applications'
    if (execPath.startsWith('/Volumes/')) return 'disk_image'
    return 'other'
}

function getLaunchContext(): LaunchContext {
    return {
        is_packaged: app.isPackaged,
        backend_base_url: backendBaseUrl,
        app_version: app.getVersion(),
        install_location: getInstallLocation(),
        should_prompt_move_to_applications: app.isPackaged && getInstallLocation() !== 'applications',
        onboarding_completed: appState.onboardingCompleted,
        onboarding_dismissed: appState.onboardingDismissed,
        log_paths: {
            backend: path.join(os.homedir(), '.truhandsfree', 'logs', 'app.log'),
            electron: path.join(os.homedir(), '.truhandsfree', 'logs', 'electron.log'),
        },
    }
}

function getAboutPanelIconPath() {
    const candidates = app.isPackaged
        ? [
            path.join(process.resourcesPath, 'icon.icns'),
            path.join(process.resourcesPath, 'icon.png'),
        ]
        : (() => {
            const publicRoot = process.env.VITE_PUBLIC as string | undefined
            if (!publicRoot) return []
            return [
                path.join(publicRoot, 'brand-mark.svg'),
                path.join(publicRoot, 'icon.png'),
            ]
        })()

    return candidates.find((candidate) => fs.existsSync(candidate))
}

function openPrivacySettingsPane(pane: keyof typeof PRIVACY_SETTINGS_URLS) {
    if (process.platform !== 'darwin') return

    void shell.openExternal(PRIVACY_SETTINGS_URLS[pane]).catch(() => {
        void shell.openPath('/System/Applications/System Settings.app')
    })
}

function shouldAutoOpenPreferencesOnLaunch() {
    return app.isPackaged && !appState.onboardingCompleted && !appState.onboardingDismissed
}

function showPreferencesWindow() {
    if (!settingsWin) return
    settingsWin.center()
    settingsWin.show()
    settingsWin.focus()
}

function getBackendUrl(pathname = '') {
    return `${backendBaseUrl}${pathname}`
}

async function getBackendConfig() {
    const response = await fetch(getBackendUrl('/config'))
    if (!response.ok) {
        throw new Error(`Failed to read backend config (${response.status}).`)
    }
    return response.json() as Promise<{ audio: CaptureAudioConfig }>
}

async function getBackendStatus() {
    const response = await fetch(getBackendUrl('/status'))
    if (!response.ok) {
        throw new Error(`Failed to read backend status (${response.status}).`)
    }
    return response.json() as Promise<{ is_processing: boolean }>
}

async function ensureCaptureHostReady() {
    if (captureHostReady) return
    if (!captureWin) {
        throw new Error('The Electron capture host is unavailable.')
    }

    await new Promise<void>((resolve) => {
        captureReadyResolvers.push(resolve)
    })
}

function resolveCaptureHostReady() {
    captureHostReady = true
    const resolvers = captureReadyResolvers
    captureReadyResolvers = []
    resolvers.forEach((resolve) => resolve())
}

async function requestCaptureHost<T>(command: string, payload?: unknown): Promise<T> {
    if (!captureWin) {
        throw new Error('The Electron capture host is unavailable.')
    }

    await ensureCaptureHostReady()

    return new Promise<T>((resolve, reject) => {
        const requestId = randomUUID()
        const timer = setTimeout(() => {
            pendingCaptureRequests.delete(requestId)
            reject(new Error(`Timed out waiting for capture host command "${command}".`))
        }, 20000)

        pendingCaptureRequests.set(requestId, {
            resolve: (value) => resolve(value as T),
            reject,
            timer,
        })
        captureWin?.webContents.send('capture-command', {
            requestId,
            command,
            payload,
        })
    })
}

async function getSelectedCaptureAudioConfig() {
    const config = await getBackendConfig()
    return config.audio
}

async function ensureCapturePermission() {
    const currentStatus = readCapturePermissionStatus()

    if (currentStatus === 'granted') return 'granted'
    if (currentStatus === 'denied' || currentStatus === 'restricted') return currentStatus

    if (process.platform === 'darwin') {
        const granted = await systemPreferences.askForMediaAccess('microphone')
        return granted ? 'granted' : systemPreferences.getMediaAccessStatus('microphone')
    }

    return 'granted'
}

function readCapturePermissionStatus() {
    if (process.platform === 'darwin') {
        return systemPreferences.getMediaAccessStatus('microphone')
    }
    return 'granted'
}

function allocateFreeLoopbackPort() {
    return new Promise<number>((resolve, reject) => {
        const server = net.createServer()
        server.unref()
        server.on('error', reject)
        server.listen(0, '127.0.0.1', () => {
            const address = server.address()
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('Failed to allocate a loopback port.')))
                return
            }

            const port = address.port
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve(port)
            })
        })
    })
}

async function ensureBackendPort() {
    if (backendPort !== null) return backendPort

    const requestedPort = Number.parseInt(process.env.TRUHANDSFREE_BACKEND_PORT || '', 10)
    backendPort = Number.isFinite(requestedPort) && requestedPort > 0
        ? requestedPort
        : await allocateFreeLoopbackPort()
    backendBaseUrl = `http://127.0.0.1:${backendPort}`
    return backendPort
}

function scheduleBackendReadyProbe(attempt = 0) {
    if (backendProbeTimer) clearTimeout(backendProbeTimer)
    backendProbeTimer = setTimeout(async () => {
        const alive = await isBackendAlive()
        if (alive) {
            setBackendBootState({
                phase: 'ready',
                label: 'Engine ready',
                detail: 'The local backend is ready for Dictation and Smart Mode.',
                progress: 100,
            })
            backendProbeTimer = null
            return
        }

        if (attempt >= 20) {
            setBackendBootState({
                phase: 'error',
                label: 'Engine unavailable',
                detail: 'The local backend did not finish starting. Open Setup for troubleshooting.',
                progress: null,
            })
            backendProbeTimer = null
            return
        }

        setBackendBootState({
            phase: 'booting_backend',
            label: 'Connecting to backend',
            detail: 'Waiting for the local engine to accept requests.',
            progress: Math.min(92, 62 + (attempt * 2)),
        })
        scheduleBackendReadyProbe(attempt + 1)
    }, attempt === 0 ? 250 : 700)
}

function clearWidgetHideFallback() {
    if (widgetHideFallbackTimer) {
        clearTimeout(widgetHideFallbackTimer)
        widgetHideFallbackTimer = null
    }
}

function sendWidgetPresentation(command: WidgetPresentationCommand) {
    widgetWin?.webContents.send('widget-presentation', command)
}

function positionWidgetAtTopCenter() {
    if (!widgetWin) return

    const targetDisplay = tray
        ? screen.getDisplayMatching(tray.getBounds())
        : screen.getPrimaryDisplay()

    const winBounds = widgetWin.getBounds()
    const x = Math.round(targetDisplay.bounds.x + ((targetDisplay.bounds.width - winBounds.width) / 2))
    const safeAreaTop = targetDisplay.workArea.y
    const y = Math.round(safeAreaTop + WIDGET_TOP_OFFSET)

    widgetWin.setPosition(x, y, false)
}

function requestWidgetOpen(source: WidgetPresentationSource) {
    if (!widgetWin) return

    clearWidgetHideFallback()
    positionWidgetAtTopCenter()

    if (!widgetWin.isVisible()) {
        widgetWin.showInactive()
    }

    sendWidgetPresentation({ visible: true, source })
}

function requestWidgetClose(source: WidgetPresentationSource, immediate = false) {
    if (!widgetWin || !widgetWin.isVisible()) return

    clearWidgetHideFallback()
    sendWidgetPresentation({ visible: false, source })

    if (immediate) {
        widgetWin.hide()
        return
    }

    widgetHideFallbackTimer = setTimeout(() => {
        widgetHideFallbackTimer = null
        widgetWin?.hide()
    }, WIDGET_HIDE_FALLBACK_MS)
}

function toggleWidget() {
    if (!widgetWin) return
    if (widgetWin.isVisible()) {
        widgetAutoShownForRecording = false
        requestWidgetClose('tray')
    } else {
        widgetAutoShownForRecording = false
        requestWidgetOpen('tray')
    }
}

function createTray() {
    const iconPath = path.join(process.env.VITE_PUBLIC as string, 'tray-iconTemplate.png')
    tray = new Tray(iconPath)
    tray.setToolTip('TruHandsFree')

    // On macOS, left click should toggle the widget, right click for quit menu
    tray.on('click', () => toggleWidget())

    // Create right-click context menu
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Open Preferences', click: () => { showPreferencesWindow() } },
        { label: 'About TruHandsFree', click: () => { app.showAboutPanel() } },
        { type: 'separator' },
        { label: 'Quit TruHandsFree', click: () => { app.quit() } }
    ])
    tray.on('right-click', () => {
        tray?.popUpContextMenu(contextMenu)
    })
}

function createApplicationMenu() {
    if (process.platform !== 'darwin') return

    app.setAboutPanelOptions({
        applicationName: 'TruHandsFree',
        applicationVersion: app.getVersion(),
        copyright: 'Copyright © TruHandsFree',
        iconPath: getAboutPanelIconPath(),
    })

    const template = [
        {
            label: 'TruHandsFree',
            submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                {
                    label: 'Preferences…',
                    accelerator: 'Command+,',
                    click: () => showPreferencesWindow(),
                },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
            ],
        },
        { role: 'editMenu' as const },
        { role: 'windowMenu' as const },
    ]

    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindows() {
    captureHostReady = false
    widgetWin = new BrowserWindow({
        width: 452,
        height: 80,
        transparent: true,
        backgroundColor: '#00000000',
        frame: false,
        alwaysOnTop: true,
        hasShadow: false,
        resizable: false,
        acceptFirstMouse: true,
        focusable: false, // CRITICAL: Prevent widget from stealing focus when clicked
        type: 'panel',    // CRITICAL: macOS NSPanel. Clicking it won't bring SettingsWin to the front.
        show: false,      // Start hidden until toggled by tray or hotkey
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    // Remove the bottom-left hardcode; it will be positioned below Tray when shown

    settingsWin = new BrowserWindow({
        icon: path.join(process.env.VITE_PUBLIC as string, 'tray-iconTemplate.png'),
        width: 1080,
        height: 760,
        minWidth: 940,
        minHeight: 680,
        title: 'TruHandsFree Preferences',
        acceptFirstMouse: true,
        transparent: process.platform === 'darwin' ? false : true,
        frame: process.platform === 'darwin',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
        vibrancy: process.platform === 'darwin' ? 'sidebar' : undefined,
        visualEffectState: process.platform === 'darwin' ? 'active' : undefined,
        backgroundColor: '#0b1117',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    captureWin = new BrowserWindow({
        show: false,
        width: 320,
        height: 240,
        transparent: true,
        frame: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
        },
    })

    if (VITE_DEV_SERVER_URL) {
        widgetWin.loadURL(VITE_DEV_SERVER_URL + '#/widget')
        settingsWin.loadURL(VITE_DEV_SERVER_URL + '#/')
        captureWin.loadURL(VITE_DEV_SERVER_URL + '#/capture')
    } else {
        widgetWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: 'widget' })
        settingsWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: '' })
        captureWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: 'capture' })
    }

    settingsWin.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.meta && input.key === ',') {
            event.preventDefault()
            showPreferencesWindow()
        }
    })

    captureWin.webContents.on('did-finish-load', () => {
        resolveCaptureHostReady()
    })
}

/**
 * Check if the backend is already running by hitting /health.
 */
function isBackendAlive(): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get(getBackendUrl('/health'), (res) => {
            resolve(res.statusCode === 200)
        })
        req.on('error', () => resolve(false))
        req.setTimeout(1000, () => { req.destroy(); resolve(false) })
    })
}

async function startBackend() {
    const port = await ensureBackendPort()

    console.log("Checking if backend is already running...")
    setBackendBootState({
        phase: 'booting_backend',
        label: 'Checking local engine',
        detail: 'Reserving a private loopback port for the local engine.',
        progress: 18,
    })

    const alreadyRunning = await isBackendAlive()
    if (alreadyRunning) {
        console.log(`Backend is already running on ${backendBaseUrl}. Skipping spawn.`)
        setBackendBootState({
            phase: 'ready',
            label: 'Engine ready',
            detail: 'Connected to the existing local backend.',
            progress: 100,
        })
        return
    }

    logToFile("Starting/Checking Python backend...")
    setBackendBootState({
        phase: 'booting_backend',
        label: 'Starting local engine',
        detail: 'Launching the Python backend and loading providers.',
        progress: 42,
    })

    if (app.isPackaged) {
        const backendDir = path.join(process.resourcesPath, 'truhandsfree-engine')
        const executablePath = path.join(backendDir, 'truhandsfree-engine')
        logToFile(`Packaged Mode: Spawning engine from ${executablePath} on ${backendBaseUrl}`)
        pythonProcess = spawn(executablePath, ['--port', String(port)], {
            cwd: backendDir,
            env: {
                ...process.env,
                TRUHANDSFREE_BACKEND_PORT: String(port),
            },
            stdio: 'pipe'
        })
    } else {
        const pythonPath = path.join(process.env.APP_ROOT as string, '..', 'backend', '.venv', 'bin', 'python3')
        const scriptPath = path.join(process.env.APP_ROOT as string, '..', 'backend', 'server.py')
        logToFile(`Dev Mode: Spawning backend from ${scriptPath} on ${backendBaseUrl}`)
        pythonProcess = spawn(pythonPath, [scriptPath, '--port', String(port)], {
            cwd: path.join(process.env.APP_ROOT as string, '..', 'backend'),
            env: {
                ...process.env,
                TRUHANDSFREE_BACKEND_PORT: String(port),
            },
            stdio: 'pipe'
        })
    }

    backendShutdownExpected = false

    const child = pythonProcess

    child.stdout?.on('data', (d) => logToFile(`[Backend stdout] ${d.toString()}`))
    child.stderr?.on('data', (d) => logToFile(`[Backend stderr] ${d.toString()}`))

    child.on('error', (err) => {
        logToFile(`Failed to start python backend: ${err.message}`)
        setBackendBootState({
            phase: 'error',
            label: 'Engine unavailable',
            detail: 'The local backend could not be started. Open Setup for troubleshooting.',
            progress: null,
        })
    })

    child.on('exit', (code) => {
        logToFile(`Python backend exited with code ${code}`)
        if (child !== pythonProcess) {
            return
        }

        if (!backendShutdownExpected && code !== 0) {
            setBackendBootState({
                phase: 'error',
                label: 'Engine stopped',
                detail: 'The local backend exited unexpectedly.',
                progress: null,
            })
        }
        pythonProcess = null
    })

    setBackendBootState({
        phase: 'booting_backend',
        label: 'Connecting to backend',
        detail: 'Waiting for the local engine to accept requests.',
        progress: 64,
    })
    scheduleBackendReadyProbe()
}

function stopBackend() {
    if (pythonProcess) {
        console.log("Stopping Python backend...")
        try {
            backendShutdownExpected = true
            pythonProcess.kill('SIGTERM')
            setTimeout(() => {
                if (pythonProcess && !pythonProcess.killed) {
                    try { pythonProcess.kill('SIGKILL') } catch {
                        logToFile('SIGKILL fallback failed while stopping the backend.')
                    }
                }
            }, 2000)
        } catch (e) {
            console.error("Failed to kill python process:", e)
        }
        pythonProcess = null
    }
}

function registerHotkeys() {
    const triggerBackendMode = async (mode: RecordingMode) => {
        try {
            await toggleRecording(mode)
            if (widgetWin && !widgetWin.isVisible()) {
                widgetAutoShownForRecording = true
                requestWidgetOpen('hotkey')
            } else {
                widgetAutoShownForRecording = false
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            logToFile(`Hotkey fetch failed: ${message}`)
        }
    }

    globalShortcut.register('CommandOrControl+D', () => {
        logToFile("Hotkey registered: Cmd+D pressed (Dictation)")
        triggerBackendMode('dictation')
    })

    globalShortcut.register('Control+D', () => {
        logToFile("Hotkey registered: Ctrl+D pressed (Dictation)")
        triggerBackendMode('dictation')
    })

    globalShortcut.register('CommandOrControl+T', () => {
        logToFile("Hotkey registered: Cmd+T pressed (Smart Transform)")
        triggerBackendMode('smart_transform')
    })

    globalShortcut.register('Control+T', () => {
        logToFile("Hotkey registered: Ctrl+T pressed (Smart Transform)")
        triggerBackendMode('smart_transform')
    })

}

async function startRecording(mode: RecordingMode) {
    const processingStatus = await getBackendStatus()
    if (processingStatus.is_processing) {
        throw new Error('The local engine is still processing the previous recording.')
    }

    const permissionStatus = await ensureCapturePermission()
    if (permissionStatus !== 'granted') {
        showPreferencesWindow()
        throw new Error('Microphone access is required before recording can start.')
    }

    let contextPayload: SmartContext | null = null
    let contextWarning: string | null = null
    if (mode === 'smart_transform') {
        const captured = await captureSmartContext()
        contextPayload = captured.context
        contextWarning = captured.warning
    }

    const audioConfig = await getSelectedCaptureAudioConfig()
    const requestedDeviceId = audioConfig.input_device_id || null
    const requestedDeviceLabel = audioConfig.input_device_label || audioConfig.input_device || null

    setCaptureState({
        error: null,
        fallback_notice: null,
        fallback_to_default: false,
    })

    const response = await requestCaptureHost<{ status: string; message?: string }>('start-recording', {
        mode,
        deviceId: requestedDeviceId,
        deviceLabel: requestedDeviceLabel,
    })

    activeCaptureSession = {
        kind: 'recording',
        mode,
        context: contextPayload,
        contextWarning,
        requestedDeviceId,
        requestedDeviceLabel,
    }

    return {
        status: response.status || 'started',
        message: response.message || `Started ${mode} recording`,
    }
}

async function stopRecording() {
    if (!activeCaptureSession || activeCaptureSession.kind !== 'recording') {
        throw new Error('There is no active recording to stop.')
    }

    const session = activeCaptureSession
    activeCaptureSession = null

    const stopResult = await requestCaptureHost<CaptureStopResult>('stop-recording')
    if (stopResult.status !== 'success' || !stopResult.audio_base64 || !stopResult.capture_stats) {
        const errorMessage = stopResult.error || 'No usable audio was captured.'
        setCaptureState({
            error: errorMessage,
        })
        throw new Error(errorMessage)
    }

    const response = await fetch(getBackendUrl('/recording/process'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mode: session.mode,
            context: session.context,
            context_warning: session.contextWarning,
            audio_base64: stopResult.audio_base64,
            capture_stats: stopResult.capture_stats,
        })
    })

    if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `Recording processing failed with ${response.status}`)
    }

    return response.json()
}

async function toggleRecording(mode: RecordingMode) {
    if (activeCaptureSession?.kind === 'mic_test') {
        throw new Error('Finish the microphone check before starting dictation.')
    }

    if (captureState.is_recording) {
        return stopRecording()
    }

    return startRecording(mode)
}

async function startMicTest(deviceId?: string | null, deviceLabel?: string | null) {
    if (captureState.is_recording || activeCaptureSession) {
        throw new Error('Finish the current recording before starting a microphone check.')
    }

    const processingStatus = await getBackendStatus()
    if (processingStatus.is_processing) {
        throw new Error('The local engine is still processing the previous recording.')
    }

    const permissionStatus = await ensureCapturePermission()
    if (permissionStatus !== 'granted') {
        showPreferencesWindow()
        throw new Error('Microphone access is required before the microphone check can start.')
    }

    const audioConfig = await getSelectedCaptureAudioConfig()
    const requestedDeviceId = deviceId ?? audioConfig.input_device_id ?? null
    const requestedDeviceLabel = deviceLabel ?? audioConfig.input_device_label ?? audioConfig.input_device ?? null

    setCaptureState({
        error: null,
        fallback_notice: null,
        fallback_to_default: false,
    })

    const response = await requestCaptureHost<{ status: string; message?: string }>('start-mic-test', {
        deviceId: requestedDeviceId,
        deviceLabel: requestedDeviceLabel,
    })

    activeCaptureSession = {
        kind: 'mic_test',
        requestedDeviceId,
        requestedDeviceLabel,
    }

    return {
        status: response.status || 'started',
        message: response.message || 'Microphone check started',
    }
}

async function stopMicTest() {
    if (!activeCaptureSession || activeCaptureSession.kind !== 'mic_test') {
        throw new Error('There is no active microphone check to stop.')
    }

    activeCaptureSession = null

    const stopResult = await requestCaptureHost<CaptureStopResult>('stop-mic-test')
    if (stopResult.status !== 'success' || !stopResult.audio_base64 || !stopResult.capture_stats) {
        const errorMessage = stopResult.error || 'No usable audio was captured.'
        setCaptureState({
            error: errorMessage,
        })
        return {
            status: 'error',
            message: errorMessage,
            fallback_notice: stopResult.capture_stats?.fallback_notice ?? null,
        }
    }

    const response = await fetch(getBackendUrl('/audio/test/process'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            audio_base64: stopResult.audio_base64,
            capture_stats: stopResult.capture_stats,
        })
    })

    const data = await response.json() as Record<string, unknown>
    if (!response.ok) {
        throw new Error(
            typeof data?.detail === 'string'
                ? data.detail
                : typeof data?.message === 'string'
                    ? data.message
                    : `Microphone test failed with ${response.status}`,
        )
    }

    return {
        ...data,
        fallback_notice: stopResult.capture_stats.fallback_notice,
    }
}

app.on('will-quit', () => {
    if (app.isReady()) {
        globalShortcut.unregisterAll()
    }
    for (const pending of pendingCaptureRequests.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error('The application is shutting down.'))
    }
    pendingCaptureRequests.clear()
    stopBackend()
})

app.on('window-all-closed', () => {
    // macOS Tray apps usually stay alive even if settings window is closed
    if (process.platform !== 'darwin') {
        app.quit()
        widgetWin = null
        settingsWin = null
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindows()
    }
})

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', () => {
        if (settingsWin?.isMinimized()) settingsWin.restore()
        showPreferencesWindow()
    })

    // Hide dock icon before ready so it acts like an LSUIElement app (menu bar agent).
    // This allows pasting without stealing focus!
    if (process.platform === 'darwin' && app.dock) {
        app.dock.hide()
    }

    app.whenReady().then(async () => {
        appState = loadAppState()

        // Automatically prompt for Mic permissions on launch natively in Electron
        if (process.platform === 'darwin') {
            systemPreferences.askForMediaAccess('microphone')
            // True prompts the user immediately if accessibility is not granted
            systemPreferences.isTrustedAccessibilityClient(true)
        }

        await startBackend()
        createApplicationMenu()
        createTray()
        createWindows()
        registerHotkeys()

        if (shouldAutoOpenPreferencesOnLaunch()) {
            showPreferencesWindow()
        }
    })
}

// IPC Handlers
ipcMain.on('window-minimize', (event) => {
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)
    win?.minimize()
})

ipcMain.on('window-close', (event) => {
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)
    if (win === settingsWin) {
        win?.hide()
    } else if (win === widgetWin) {
        requestWidgetClose('tray')
    } else {
        app.quit()
    }
})

ipcMain.on('show-settings', () => {
    showPreferencesWindow()
})

ipcMain.handle('get-platform', () => {
    return process.platform
})

ipcMain.handle('get-backend-base-url', () => {
    return backendBaseUrl
})

ipcMain.handle('get-launch-context', () => {
    return getLaunchContext()
})

ipcMain.handle('check-accessibility', () => {
    if (process.platform === 'darwin') {
        return systemPreferences.isTrustedAccessibilityClient(false)
    }
    return true
})

ipcMain.handle('get-capture-permission-status', async () => {
    return readCapturePermissionStatus()
})

ipcMain.handle('request-capture-permission', async () => {
    return ensureCapturePermission()
})

ipcMain.handle('get-capture-devices', async (_event, refresh?: boolean) => {
    return requestCaptureHost('get-devices', { refresh })
})

ipcMain.handle('get-capture-state', () => {
    return captureState
})

ipcMain.on('prompt-accessibility', () => {
    if (process.platform === 'darwin') {
        systemPreferences.isTrustedAccessibilityClient(true) // true triggers the system dialog
    }
})

ipcMain.on('open-privacy-settings', (_event, pane: keyof typeof PRIVACY_SETTINGS_URLS) => {
    openPrivacySettingsPane(pane)
})

ipcMain.handle('check-smart-context-access', async () => {
    return getSmartContextAccessStatus()
})

ipcMain.handle('prompt-smart-context-access', async () => {
    return getSmartContextAccessStatus()
})

ipcMain.handle('restart-backend', async () => {
    stopBackend()
    await startBackend()
    return { status: 'restarted' }
})

ipcMain.handle('dismiss-packaged-onboarding', () => {
    updateAppState({ onboardingDismissed: true })
    return getLaunchContext()
})

ipcMain.handle('complete-packaged-onboarding', () => {
    updateAppState({
        onboardingCompleted: true,
        onboardingDismissed: true,
    })
    return getLaunchContext()
})

ipcMain.on('reveal-app-in-finder', () => {
    shell.showItemInFolder(app.getPath('exe'))
})

ipcMain.on('open-applications-folder', () => {
    void shell.openPath('/Applications')
})

ipcMain.handle('toggle-recording', async (_event, mode: RecordingMode) => {
    try {
        return await toggleRecording(mode)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setCaptureState({ error: message })
        throw error
    }
})

ipcMain.handle('start-mic-test', async (_event, payload?: { deviceId?: string | null; deviceLabel?: string | null }) => {
    try {
        return await startMicTest(payload?.deviceId ?? null, payload?.deviceLabel ?? null)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setCaptureState({ error: message })
        throw error
    }
})

ipcMain.handle('stop-mic-test', async () => {
    try {
        return await stopMicTest()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setCaptureState({ error: message })
        throw error
    }
})

ipcMain.handle('get-backend-boot-state', () => {
    return backendBootState
})

ipcMain.on('capture-ready', () => {
    resolveCaptureHostReady()
})

ipcMain.on('capture-response', (_event, payload: { requestId: string; payload: unknown }) => {
    const pending = pendingCaptureRequests.get(payload.requestId)
    if (!pending) return

    clearTimeout(pending.timer)
    pendingCaptureRequests.delete(payload.requestId)
    pending.resolve(payload.payload)
})

ipcMain.on('capture-state', (_event, nextState: CaptureState) => {
    captureState = nextState
    broadcastCaptureState()
})

ipcMain.on('widget-hide-complete', () => {
    clearWidgetHideFallback()
    widgetWin?.hide()
})

ipcMain.on('simulate-paste', (_event, text) => {
    logToFile(`Pasting ${text.length} characters to active window natively`)
    const restoreWidgetAfterPaste = Boolean(widgetWin?.isVisible()) && !widgetAutoShownForRecording

    // Save the user's prior clipboard so we don't destructively overwrite what they were doing
    const oldClipboard = clipboard.readText() || ''
    // Write text to clipboard natively
    clipboard.writeText(text)

    // Hide our widget if it's visible, so that macOS automatically returns focus
    // to the prior active application (like Chrome or Google Docs).
    if (widgetWin && widgetWin.isVisible()) {
        requestWidgetClose('idle', true)
    }

    // Wait ~50ms for focus transition to complete, then execute paste keystroke
    setTimeout(() => {
        if (process.platform === 'darwin') {
            // We do NOT need to tell System Events which app is active anymore.
            // Hiding the floating widget is enough to hand focus back to the prior app.
            const injectTextCmdV = async () => {
                let attempt = 0;
                const maxRetries = 3;
                while (attempt < maxRetries) {
                    try {
                        logToFile(`Attempting OS paste injection (Cmd+V) - Attempt ${attempt + 1}...`);
                        await keyboard.pressKey(Key.LeftSuper);
                        await keyboard.pressKey(Key.V);
                        await keyboard.releaseKey(Key.V);
                        await keyboard.releaseKey(Key.LeftSuper);
                        await new Promise(resolve => setTimeout(resolve, 150));
                        logToFile('Paste injection sequence executed successfully.');
                        return true;
                    } catch (e: unknown) {
                        const message = e instanceof Error ? e.message : String(e)
                        logToFile(`Failed to inject via nut-js: ${message}`);
                        attempt++;
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } finally {
                        await keyboard.releaseKey(Key.LeftSuper).catch(() => { });
                        await keyboard.releaseKey(Key.V).catch(() => { });
                    }
                }
                return false;
            }

            injectTextCmdV().then((success) => {
                // Give the OS and target application ~500ms to read the clipboard 
                // for the Cmd+V keystroke before we revert it back to the original backup.
                setTimeout(() => {
                    clipboard.writeText(oldClipboard)
                }, 500)

                if (!success) {
                    _event.sender.send('paste-error-tcc')
                }
                widgetAutoShownForRecording = false
                if (restoreWidgetAfterPaste) {
                    setTimeout(() => {
                        requestWidgetOpen('tray')
                    }, 400)
                }
            })
        }
    }, 80)
})
