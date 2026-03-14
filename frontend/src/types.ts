export type RecordingMode = 'dictation' | 'smart_transform'
export type WidgetPresentationSource = 'tray' | 'hotkey' | 'idle'
export type PrivacyPane = 'microphone' | 'accessibility' | 'automation'
export type MicrophonePermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

export interface WidgetPresentationCommand {
  visible: boolean
  source: WidgetPresentationSource
}

export type BackendPhase =
  | 'booting_backend'
  | 'ready'
  | 'recording'
  | 'transcribing'
  | 'transforming'
  | 'preparing_paste'
  | 'error'

export interface SmartContext {
  app_name: string
  bundle_id: string | null
  window_title: string | null
  page_title: string | null
  url_host: string | null
}

export type CapturedContextQuality = 'full' | 'app_only' | 'transcript_only' | 'empty'

export interface SmartContextAccessStatus {
  status: 'full' | 'app-only' | 'unavailable'
  message: string
  context: SmartContext | null
}

export interface BackendBootState {
  phase: BackendPhase
  label: string
  detail: string
  progress: number | null
}

export interface AppLaunchContext {
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

export interface ProviderOption {
  id: string
  name: string
  desc: string
}

export interface ProviderModel {
  id: string
  name: string
}

export interface ProviderModels {
  llm: Record<string, ProviderModel[]>
  stt: Record<string, ProviderModel[]>
}

export interface AudioDevice {
  id: string
  label: string
  is_default: boolean
  group_id: string | null
}

export interface MicrophoneAccessInfo {
  status: MicrophonePermissionStatus
  source: 'electron'
}

export interface CaptureState {
  is_recording: boolean
  is_testing: boolean
  mode: RecordingMode | 'mic_test' | null
  amplitude: number
  error: string | null
  active_device_id: string | null
  active_device_label: string | null
  fallback_to_default: boolean
  fallback_notice: string | null
}

export interface CaptureStopResult {
  status: 'success' | 'error'
  audio_base64?: string
  error?: string
  capture_stats?: {
    duration_ms: number
    peak: number
    rms: number
    used_device_id: string | null
    used_device_label: string | null
    fallback_to_default: boolean
    fallback_notice: string | null
  }
}

export interface Skill {
  id: string
  name: string
  prompt: string
  description?: string
}

export interface AppConfig {
  stt: {
    provider: string
    model: string
    language: string
  }
  llm: {
    provider: string
    model: string
    temperature: number
  }
  hotkeys: {
    trigger_dictation: string
    trigger_smart_agent: string
    default_skill_id: string
  }
  audio: {
    input_device: string | null
    input_device_id: string | null
    input_device_label: string | null
  }
  debug: {
    log_sensitive_transcripts: boolean
    persist_recordings: boolean
  }
}

export interface BackendStatus {
  backend_ready: boolean
  is_recording: boolean
  is_processing: boolean
  active_mode: RecordingMode | null
  active_skill: string
  audio_amplitude: number
  last_error: string | null
  pending_paste_text: string | null
  missing_api_keys: boolean
  phase: BackendPhase
  phase_label: string
  captured_context: SmartContext
  captured_context_at: string | null
  captured_context_quality: CapturedContextQuality
  target_type: string | null
  context_warning: string | null
}
