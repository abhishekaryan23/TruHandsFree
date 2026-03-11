/// <reference types="vite/client" />

export interface IpcRenderer {
    on(channel: string, listener: (event: any, ...args: any[]) => void): this;
    off(channel: string, ...omit: any[]): this;
    send(channel: string, ...omit: any[]): void;
    invoke(channel: string, ...omit: any[]): Promise<any>;
}

export interface WindowControls {
    minimize: () => void;
    close: () => void;
    showSettings: () => void;
    getPlatform: () => Promise<string>;
    checkAccessibility: () => Promise<boolean>;
    promptAccessibility: () => void;
    simulatePaste: (text: string) => void;
    onPasteError: (callback: () => void) => void;
}

declare global {
    interface Window {
        ipcRenderer: IpcRenderer;
        windowControls: WindowControls;
    }
}
