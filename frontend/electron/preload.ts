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
    simulatePaste: (text: string) => ipcRenderer.send('simulate-paste', text),
    onPasteError: (callback: () => void) => ipcRenderer.on('paste-error-tcc', () => callback())
})
