import { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, clipboard, systemPreferences } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import { keyboard, Key } from '@nut-tree-fork/nut-js'
import { captureSmartContext, getSmartContextAccessStatus } from './smartContext'
const logDir = path.join(os.homedir(), '.truhandsfree', 'logs')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
const electronLogStr = fs.createWriteStream(path.join(logDir, 'electron.log'), { flags: 'a' })
const API_BASE = 'http://127.0.0.1:8055'

type RecordingMode = 'dictation' | 'smart_transform'
type BackendBootState = {
    phase: 'booting_backend' | 'ready' | 'error'
    label: string
    detail: string
    progress: number | null
}

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
let pythonProcess: ChildProcess | null = null
let tray: Tray | null = null
let backendProbeTimer: NodeJS.Timeout | null = null
let backendBootState: BackendBootState = {
    phase: 'booting_backend',
    label: 'Preparing TruHandsFree',
    detail: 'Checking the local engine.',
    progress: 12,
}

function setBackendBootState(nextState: BackendBootState) {
    backendBootState = nextState
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('backend-boot-state', backendBootState)
    }
}

function scheduleBackendReadyProbe(attempt = 0) {
    if (backendProbeTimer) clearTimeout(backendProbeTimer)
    backendProbeTimer = setTimeout(async () => {
        const alive = await isBackendAlive()
        if (alive) {
            setBackendBootState({
                phase: 'ready',
                label: 'Engine ready',
                detail: 'The local backend is ready for dictation and Smart Mode.',
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

function toggleWidget() {
    if (!widgetWin) return
    if (widgetWin.isVisible()) {
        widgetWin.hide()
    } else {
        if (tray) {
            const trayBounds = tray.getBounds()
            const winBounds = widgetWin.getBounds()
            // Position horizontally centered below the tray icon
            const x = Math.round(trayBounds.x + (trayBounds.width / 2) - (winBounds.width / 2))
            const y = Math.round(trayBounds.y + trayBounds.height + 4)
            widgetWin.setPosition(x, y, false)
        }
        widgetWin.showInactive() // Show without stealing keyboard focus from current app
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
        { label: 'Settings', click: () => { settingsWin?.show(); settingsWin?.focus() } },
        { type: 'separator' },
        { label: 'Quit TruHandsFree', click: () => { app.quit() } }
    ])
    tray.on('right-click', () => {
        tray?.popUpContextMenu(contextMenu)
    })
}

function createWindows() {
    widgetWin = new BrowserWindow({
        width: 380,
        height: 60,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        hasShadow: true,
        resizable: false,
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
        width: 800,
        height: 600,
        transparent: true,
        frame: false,
        vibrancy: 'sidebar',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    if (VITE_DEV_SERVER_URL) {
        widgetWin.loadURL(VITE_DEV_SERVER_URL + '#/widget')
        settingsWin.loadURL(VITE_DEV_SERVER_URL + '#/')
    } else {
        widgetWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: 'widget' })
        settingsWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: '' })
    }
}

/**
 * Check if the backend is already running by hitting /health.
 */
function isBackendAlive(): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:8055/health', (res) => {
            resolve(res.statusCode === 200)
        })
        req.on('error', () => resolve(false))
        req.setTimeout(1000, () => { req.destroy(); resolve(false) })
    })
}

async function startBackend() {
    console.log("Checking if backend is already running...")
    setBackendBootState({
        phase: 'booting_backend',
        label: 'Checking local engine',
        detail: 'Looking for an existing backend on port 8055.',
        progress: 18,
    })

    const alreadyRunning = await isBackendAlive()
    if (alreadyRunning) {
        console.log("Backend is already running on port 8055. Skipping spawn.")
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
        logToFile(`Packaged Mode: Spawning Engine from ${path.join(process.resourcesPath, 'truhandsfree-engine')}`)
        const executablePath = path.join(process.resourcesPath, 'truhandsfree-engine')
        pythonProcess = spawn(executablePath, [], {
            cwd: process.resourcesPath,
            stdio: 'pipe'
        })
    } else {
        const pythonPath = path.join(process.env.APP_ROOT as string, '..', 'backend', '.venv', 'bin', 'python3')
        const scriptPath = path.join(process.env.APP_ROOT as string, '..', 'backend', 'server.py')
        pythonProcess = spawn(pythonPath, [scriptPath], {
            cwd: path.join(process.env.APP_ROOT as string, '..', 'backend'),
            stdio: 'pipe'
        })
    }

    pythonProcess.stdout?.on('data', (d) => logToFile(`[Backend stdout] ${d.toString()}`))
    pythonProcess.stderr?.on('data', (d) => logToFile(`[Backend stderr] ${d.toString()}`))

    pythonProcess.on('error', (err) => {
        logToFile(`Failed to start python backend: ${err.message}`)
        setBackendBootState({
            phase: 'error',
            label: 'Engine unavailable',
            detail: 'The local backend could not be started. Open Setup for troubleshooting.',
            progress: null,
        })
    })

    pythonProcess.on('exit', (code) => {
        logToFile(`Python backend exited with code ${code}`)
        if (code !== 0) {
            setBackendBootState({
                phase: 'error',
                label: 'Engine stopped',
                detail: 'The local backend exited unexpectedly.',
                progress: null,
            })
        }
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
            pythonProcess.kill('SIGTERM')
            setTimeout(() => {
                if (pythonProcess && !pythonProcess.killed) {
                    try { pythonProcess.kill('SIGKILL') } catch (e) { }
                }
            }, 2000)
        } catch (e) {
            console.error("Failed to kill python process:", e)
        }
        pythonProcess = null
    }
}

function registerHotkeys() {
    // Read hotkeys from config via frontend API, or use defaults
    // Since we just started the backend, we can just hardcode the defaults for now,
    // or fetch from backend API. For reliability, we hardcode defaults and allow UI override later.

    const triggerBackendMode = async (mode: RecordingMode) => {
        try {
            await sendRecordingToggle(mode)
            if (widgetWin && !widgetWin.isVisible()) toggleWidget()
        } catch (err: any) {
            logToFile(`Hotkey fetch failed: ${err.message}`)
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

async function sendRecordingToggle(mode: RecordingMode) {
    let contextPayload: Record<string, unknown> | null = null
    let contextWarning: string | null = null

    if (mode === 'smart_transform') {
        const captured = await captureSmartContext()
        contextPayload = captured.context
        contextWarning = captured.warning
    }

    const response = await fetch(`${API_BASE}/recording/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mode,
            context: contextPayload,
            context_warning: contextWarning,
        })
    })

    if (!response.ok) {
        throw new Error(`Recording toggle failed with ${response.status}`)
    }

    return response.json()
}

app.on('will-quit', () => {
    globalShortcut.unregisterAll()
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
        if (settingsWin) {
            if (settingsWin.isMinimized()) settingsWin.restore()
            settingsWin.show()
            settingsWin.focus()
        }
    })

    // Hide dock icon before ready so it acts like an LSUIElement app (menu bar agent).
    // This allows pasting without stealing focus!
    if (process.platform === 'darwin' && app.dock) {
        app.dock.hide()
    }

    app.whenReady().then(async () => {
        // Automatically prompt for Mic permissions on launch natively in Electron
        if (process.platform === 'darwin') {
            systemPreferences.askForMediaAccess('microphone')
            // True prompts the user immediately if accessibility is not granted
            systemPreferences.isTrustedAccessibilityClient(true)
        }

        await startBackend()
        createTray()
        createWindows()
        registerHotkeys()
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
        win?.hide()
    } else {
        app.quit()
    }
})

ipcMain.on('show-settings', () => {
    settingsWin?.show()
    settingsWin?.focus()
})

ipcMain.handle('get-platform', () => {
    return process.platform
})

ipcMain.handle('check-accessibility', () => {
    if (process.platform === 'darwin') {
        return systemPreferences.isTrustedAccessibilityClient(false)
    }
    return true
})

ipcMain.handle('get-microphone-access-status', () => {
    if (process.platform === 'darwin') {
        return systemPreferences.getMediaAccessStatus('microphone')
    }
    return 'granted'
})

ipcMain.handle('request-microphone-access', async () => {
    if (process.platform === 'darwin') {
        return systemPreferences.askForMediaAccess('microphone')
    }
    return true
})

ipcMain.on('prompt-accessibility', () => {
    if (process.platform === 'darwin') {
        systemPreferences.isTrustedAccessibilityClient(true) // true triggers the system dialog
    }
})

ipcMain.handle('check-smart-context-access', async () => {
    return getSmartContextAccessStatus()
})

ipcMain.handle('prompt-smart-context-access', async () => {
    return getSmartContextAccessStatus()
})

ipcMain.handle('toggle-recording', async (_event, mode: RecordingMode) => {
    return sendRecordingToggle(mode)
})

ipcMain.handle('get-backend-boot-state', () => {
    return backendBootState
})

ipcMain.on('simulate-paste', (_event, text) => {
    logToFile(`Pasting ${text.length} characters to active window natively`)

    // Save the user's prior clipboard so we don't destructively overwrite what they were doing
    const oldClipboard = clipboard.readText() || ''
    // Write text to clipboard natively
    clipboard.writeText(text)

    // Hide our widget if it's visible, so that macOS automatically returns focus
    // to the prior active application (like Chrome or Google Docs).
    if (widgetWin && widgetWin.isVisible()) {
        widgetWin.hide()
    }
    app.hide() // Ensure the entire Electron app gives up focus

    // Wait ~50ms for focus transition to complete, then execute paste keystroke
    setTimeout(() => {
        if (process.platform === 'darwin') {
            // We do NOT need to tell System Events which app is active anymore! 
            // Because app.hide() successfully returned focus to whatever the user was using.
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
                    } catch (e: any) {
                        logToFile(`Failed to inject via nut-js: ${e.message}`);
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
                setTimeout(() => {
                    if (widgetWin) widgetWin.showInactive()
                }, 400)
            })
        }
    }, 80)
})
