import { ipcRenderer, contextBridge } from 'electron'

// --------- Secure IPC Bridge ---------
// Only expose whitelisted channels to the renderer process.
// DO NOT expose raw ipcRenderer — that's a security anti-pattern.

contextBridge.exposeInMainWorld('windowControls', {
    minimize: () => ipcRenderer.send('window-minimize'),
    close: () => ipcRenderer.send('window-close'),
    showSettings: () => ipcRenderer.send('show-settings'),
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    checkAccessibility: () => ipcRenderer.invoke('check-accessibility'),
    promptAccessibility: () => ipcRenderer.send('prompt-accessibility'),
    getMicrophoneAccessStatus: () => ipcRenderer.invoke('get-microphone-access-status'),
    requestMicrophoneAccess: () => ipcRenderer.invoke('request-microphone-access'),
    checkSmartContextAccess: () => ipcRenderer.invoke('check-smart-context-access'),
    promptSmartContextAccess: () => ipcRenderer.invoke('prompt-smart-context-access'),
    toggleRecording: (mode: 'dictation' | 'smart_transform') => ipcRenderer.invoke('toggle-recording', mode),
    getBackendBootState: () => ipcRenderer.invoke('get-backend-boot-state'),
    simulatePaste: (text: string) => ipcRenderer.send('simulate-paste', text),
    onPasteError: (callback: () => void) => {
        const listener = () => callback()
        ipcRenderer.on('paste-error-tcc', listener)
        return () => ipcRenderer.off('paste-error-tcc', listener)
    },
    onBackendBootState: (callback: (state: unknown) => void) => {
        const listener = (_event: unknown, state: unknown) => callback(state)
        ipcRenderer.on('backend-boot-state', listener)
        return () => ipcRenderer.off('backend-boot-state', listener)
    }
})
