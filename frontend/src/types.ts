export type RecordingMode = 'dictation' | 'smart_transform'

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
  id: number
  name: string
  channels: number
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
  context_warning: string | null
}
