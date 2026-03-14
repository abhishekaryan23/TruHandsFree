import { ipcRenderer, contextBridge } from 'electron'

// --------- Secure IPC Bridge ---------
// Only expose whitelisted channels to the renderer process.
// DO NOT expose raw ipcRenderer — that's a security anti-pattern.

contextBridge.exposeInMainWorld('windowControls', {
    minimize: () => ipcRenderer.send('window-minimize'),
    close: () => ipcRenderer.send('window-close'),
    showSettings: () => ipcRenderer.send('show-settings'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    getBackendBaseUrl: () => ipcRenderer.invoke('get-backend-base-url'),
    getLaunchContext: () => ipcRenderer.invoke('get-launch-context'),
    checkAccessibility: () => ipcRenderer.invoke('check-accessibility'),
    promptAccessibility: () => ipcRenderer.send('prompt-accessibility'),
    openPrivacySettings: (pane: 'microphone' | 'accessibility' | 'automation') => ipcRenderer.send('open-privacy-settings', pane),
    getCapturePermissionStatus: () => ipcRenderer.invoke('get-capture-permission-status'),
    requestCapturePermission: () => ipcRenderer.invoke('request-capture-permission'),
    getCaptureDevices: (refresh?: boolean) => ipcRenderer.invoke('get-capture-devices', refresh),
    getCaptureState: () => ipcRenderer.invoke('get-capture-state'),
    startMicTest: (deviceId?: string | null, deviceLabel?: string | null) => ipcRenderer.invoke('start-mic-test', { deviceId, deviceLabel }),
    stopMicTest: () => ipcRenderer.invoke('stop-mic-test'),
    checkSmartContextAccess: () => ipcRenderer.invoke('check-smart-context-access'),
    promptSmartContextAccess: () => ipcRenderer.invoke('prompt-smart-context-access'),
    restartBackend: () => ipcRenderer.invoke('restart-backend'),
    dismissPackagedOnboarding: () => ipcRenderer.invoke('dismiss-packaged-onboarding'),
    completePackagedOnboarding: () => ipcRenderer.invoke('complete-packaged-onboarding'),
    revealAppInFinder: () => ipcRenderer.send('reveal-app-in-finder'),
    openApplicationsFolder: () => ipcRenderer.send('open-applications-folder'),
    toggleRecording: (mode: 'dictation' | 'smart_transform') => ipcRenderer.invoke('toggle-recording', mode),
    getBackendBootState: () => ipcRenderer.invoke('get-backend-boot-state'),
    simulatePaste: (text: string) => ipcRenderer.send('simulate-paste', text),
    completeWidgetHide: (source: 'tray' | 'hotkey' | 'idle') => ipcRenderer.send('widget-hide-complete', source),
    onPasteError: (callback: () => void) => {
        const listener = () => callback()
        ipcRenderer.on('paste-error-tcc', listener)
        return () => ipcRenderer.off('paste-error-tcc', listener)
    },
    onBackendBootState: (callback: (state: unknown) => void) => {
        const listener = (_event: unknown, state: unknown) => callback(state)
        ipcRenderer.on('backend-boot-state', listener)
        return () => ipcRenderer.off('backend-boot-state', listener)
    },
    onCaptureState: (callback: (state: unknown) => void) => {
        const listener = (_event: unknown, state: unknown) => callback(state)
        ipcRenderer.on('capture-state', listener)
        return () => ipcRenderer.off('capture-state', listener)
    },
    onWidgetPresentationCommand: (callback: (command: unknown) => void) => {
        const listener = (_event: unknown, command: unknown) => callback(command)
        ipcRenderer.on('widget-presentation', listener)
        return () => ipcRenderer.off('widget-presentation', listener)
    }
})

contextBridge.exposeInMainWorld('captureBridge', {
    onCommand: (callback: (command: unknown) => void) => {
        const listener = (_event: unknown, command: unknown) => callback(command)
        ipcRenderer.on('capture-command', listener)
        return () => ipcRenderer.off('capture-command', listener)
    },
    sendResponse: (requestId: string, payload: unknown) => {
        ipcRenderer.send('capture-response', { requestId, payload })
    },
    sendState: (state: unknown) => {
        ipcRenderer.send('capture-state', state)
    },
    notifyReady: () => {
        ipcRenderer.send('capture-ready')
    },
})
