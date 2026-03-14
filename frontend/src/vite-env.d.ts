/// <reference types="vite/client" />

import type {
    AudioDevice,
    AppLaunchContext,
    BackendBootState,
    CaptureState,
    PrivacyPane,
    RecordingMode,
    SmartContextAccessStatus,
    WidgetPresentationCommand,
    WidgetPresentationSource,
} from './types'

export interface IpcRenderer {
    on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): this;
    off(channel: string, ...omit: unknown[]): this;
    send(channel: string, ...omit: unknown[]): void;
    invoke(channel: string, ...omit: unknown[]): Promise<unknown>;
}

export interface WindowControls {
    minimize: () => void;
    close: () => void;
    showSettings: () => void;
    getPlatform: () => Promise<string>;
    getBackendBaseUrl: () => Promise<string>;
    getLaunchContext: () => Promise<AppLaunchContext>;
    checkAccessibility: () => Promise<boolean>;
    promptAccessibility: () => void;
    openPrivacySettings: (pane: PrivacyPane) => void;
    getCapturePermissionStatus: () => Promise<string>;
    requestCapturePermission: () => Promise<string>;
    getCaptureDevices: (refresh?: boolean) => Promise<AudioDevice[]>;
    getCaptureState: () => Promise<CaptureState>;
    startMicTest: (deviceId?: string | null, deviceLabel?: string | null) => Promise<{ status: string; message: string }>;
    stopMicTest: () => Promise<{ status: string; transcript?: string; processing_time?: number; audio_file?: string | null; message?: string; fallback_notice?: string | null }>;
    checkSmartContextAccess: () => Promise<SmartContextAccessStatus>;
    promptSmartContextAccess: () => Promise<SmartContextAccessStatus>;
    restartBackend: () => Promise<{ status: string }>;
    dismissPackagedOnboarding: () => Promise<AppLaunchContext>;
    completePackagedOnboarding: () => Promise<AppLaunchContext>;
    revealAppInFinder: () => void;
    openApplicationsFolder: () => void;
    toggleRecording: (mode: RecordingMode) => Promise<{ status: string; message: string }>;
    getBackendBootState: () => Promise<BackendBootState>;
    simulatePaste: (text: string) => void;
    completeWidgetHide: (source: WidgetPresentationSource) => void;
    onPasteError: (callback: () => void) => () => void;
    onBackendBootState: (callback: (state: BackendBootState) => void) => () => void;
    onCaptureState: (callback: (state: CaptureState) => void) => () => void;
    onWidgetPresentationCommand: (callback: (command: WidgetPresentationCommand) => void) => () => void;
}

export interface CaptureBridge {
    onCommand: (callback: (command: unknown) => void) => () => void;
    sendResponse: (requestId: string, payload: unknown) => void;
    sendState: (state: CaptureState) => void;
    notifyReady: () => void;
}

declare global {
    interface Window {
        ipcRenderer: IpcRenderer;
        windowControls: WindowControls;
        captureBridge?: CaptureBridge;
    }
}
