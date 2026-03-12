/// <reference types="vite/client" />

import type { BackendBootState, RecordingMode, SmartContextAccessStatus } from './types'

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
    getMicrophoneAccessStatus: () => Promise<string>;
    requestMicrophoneAccess: () => Promise<boolean>;
    checkSmartContextAccess: () => Promise<SmartContextAccessStatus>;
    promptSmartContextAccess: () => Promise<SmartContextAccessStatus>;
    toggleRecording: (mode: RecordingMode) => Promise<{ status: string; message: string }>;
    getBackendBootState: () => Promise<BackendBootState>;
    simulatePaste: (text: string) => void;
    onPasteError: (callback: () => void) => () => void;
    onBackendBootState: (callback: (state: BackendBootState) => void) => () => void;
}

declare global {
    interface Window {
        ipcRenderer: IpcRenderer;
        windowControls: WindowControls;
    }
}
