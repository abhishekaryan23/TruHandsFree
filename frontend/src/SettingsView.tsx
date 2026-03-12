import { useCallback, useEffect, useState, type ReactNode } from 'react'
import axios from 'axios'

import { BrandedProgressLoader } from './components/BrandedProgressLoader'
import {
  ArrowRightIcon,
  CheckIcon,
  ErrorIcon,
  KeyIcon,
  MicIcon,
  RefreshIcon,
  SetupIcon,
  ShieldIcon,
  SparkIcon,
  WarningIcon,
  WaveIcon,
} from './components/BrandIcons'
import type {
  AppConfig,
  AudioDevice,
  BackendBootState,
  BackendStatus,
  ProviderModels,
  ProviderOption,
  Skill,
  SmartContext,
  SmartContextAccessStatus,
} from './types'

const API_BASE = 'http://127.0.0.1:8055'

type ConnectionState = 'connecting' | 'connected' | 'error'
type KeyStatusMap = Record<string, boolean>
type StepId = 'permissions' | 'voice' | 'smart' | 'advanced'

const DEFAULT_BOOT_STATE: BackendBootState = {
  phase: 'booting_backend',
  label: 'Preparing TruHandsFree',
  detail: 'Checking the local engine.',
  progress: 16,
}

const EMPTY_CONTEXT: SmartContext = {
  app_name: 'Unknown',
  bundle_id: null,
  window_title: null,
  page_title: null,
  url_host: null,
}

const STEPS: Array<{ id: StepId; label: string; eyebrow: string }> = [
  { id: 'permissions', label: 'Permissions', eyebrow: 'Foundation' },
  { id: 'voice', label: 'Voice', eyebrow: 'Capture' },
  { id: 'smart', label: 'Smart Mode', eyebrow: 'Context' },
  { id: 'advanced', label: 'Advanced', eyebrow: 'Recovery' },
]

const PROVIDERS: { llm: ProviderOption[]; stt: ProviderOption[] } = {
  llm: [
    { id: 'groq', name: 'Groq', desc: 'Fastest response' },
    { id: 'openai', name: 'OpenAI', desc: 'GPT models' },
    { id: 'anthropic', name: 'Anthropic', desc: 'Claude models' },
  ],
  stt: [
    { id: 'groq', name: 'Groq', desc: 'Whisper on Groq' },
    { id: 'openai', name: 'OpenAI', desc: 'OpenAI Whisper' },
    { id: 'deepgram', name: 'Deepgram', desc: 'Nova models' },
  ],
}

function surfaceTone(tone: 'good' | 'warn' | 'danger' | 'neutral') {
  if (tone === 'good') {
    return 'border-semantic-success/20 bg-semantic-success/8 text-semantic-success'
  }
  if (tone === 'warn') {
    return 'border-semantic-warning/20 bg-semantic-warning/8 text-semantic-warning'
  }
  if (tone === 'danger') {
    return 'border-semantic-error/20 bg-semantic-error/10 text-semantic-error'
  }
  return 'border-white/8 bg-white/[0.03] text-text-secondary'
}

function StatusBadge({ label, tone }: { label: string; tone: 'good' | 'warn' | 'danger' | 'neutral' }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium ${surfaceTone(tone)}`}>
      <div className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </div>
  )
}

function StepButton({
  active,
  eyebrow,
  label,
  onClick,
}: {
  active: boolean
  eyebrow: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition-all ${
        active
          ? 'border-accent-primary/25 bg-accent-primary/12 shadow-[0_0_24px_rgba(18,222,230,0.12)]'
          : 'border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]'
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.28em] text-text-muted">{eyebrow}</div>
      <div className={`mt-1 text-sm font-medium ${active ? 'text-accent-primary' : 'text-text-primary'}`}>{label}</div>
    </button>
  )
}

function SectionCard({
  title,
  icon,
  children,
  description,
  action,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  description?: string
  action?: ReactNode
}) {
  return (
    <section className="glass-card p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <div className="text-accent-primary">{icon}</div>
            {title}
          </div>
          {description ? <p className="mt-2 max-w-2xl text-sm text-text-secondary">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function PermissionCard({
  title,
  subtitle,
  statusLabel,
  tone,
  action,
}: {
  title: string
  subtitle: string
  statusLabel: string
  tone: 'good' | 'warn' | 'danger' | 'neutral'
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{subtitle}</p>
        </div>
        <StatusBadge label={statusLabel} tone={tone} />
      </div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

function ProviderPicker({
  label,
  value,
  options,
  availableKeys,
  onChange,
}: {
  label: string
  value: string
  options: ProviderOption[]
  availableKeys: KeyStatusMap
  onChange: (provider: string) => void
}) {
  return (
    <div>
      <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">{label}</label>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((option) => {
          const active = option.id === value
          return (
            <button
              key={option.id}
              onClick={() => onChange(option.id)}
              className={`rounded-2xl border p-4 text-left transition-all ${
                active
                  ? 'border-accent-primary/25 bg-accent-primary/12 shadow-[0_0_20px_rgba(18,222,230,0.1)]'
                  : 'border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className={`text-sm font-medium ${active ? 'text-accent-primary' : 'text-text-primary'}`}>{option.name}</div>
                {availableKeys[option.id] ? <StatusBadge label="Key ready" tone="good" /> : <StatusBadge label="No key" tone="neutral" />}
              </div>
              <p className="mt-3 text-sm text-text-secondary">{option.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ContextField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
      <div className="text-[11px] uppercase tracking-[0.28em] text-text-muted">{label}</div>
      <div className="mt-2 break-all font-mono text-sm text-text-primary">{value || 'Unknown'}</div>
    </div>
  )
}

function ReadOnlyShortcut({
  title,
  shortcut,
  description,
}: {
  title: string
  shortcut: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        <kbd className="rounded-xl border border-accent-primary/20 bg-accent-primary/10 px-2.5 py-1 font-mono text-xs text-accent-primary">
          {shortcut}
        </kbd>
      </div>
      <p className="mt-3 text-sm leading-6 text-text-secondary">{description}</p>
    </div>
  )
}

function FooterButton({
  children,
  tone = 'primary',
  disabled,
  onClick,
}: {
  children: ReactNode
  tone?: 'primary' | 'secondary'
  disabled?: boolean
  onClick: () => void
}) {
  const classes = tone === 'primary'
    ? 'border-accent-primary/20 bg-accent-primary text-[#021318] hover:bg-[#46f0f4]'
    : 'border-white/8 bg-white/[0.03] text-text-primary hover:bg-white/[0.06]'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-45 ${classes}`}
    >
      {children}
    </button>
  )
}

export const SettingsView = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [retryCount, setRetryCount] = useState(0)
  const [bootState, setBootState] = useState<BackendBootState>(DEFAULT_BOOT_STATE)

  const [remoteConfig, setRemoteConfig] = useState<AppConfig | null>(null)
  const [draftConfig, setDraftConfig] = useState<AppConfig | null>(null)
  const [providerModels, setProviderModels] = useState<ProviderModels | null>(null)
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [keysSet, setKeysSet] = useState<KeyStatusMap>({})
  const [status, setStatus] = useState<BackendStatus | null>(null)

  const [activeStep, setActiveStep] = useState<StepId>('permissions')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [apiKey, setApiKey] = useState('')
  const [apiProvider, setApiProvider] = useState('groq')
  const [keyStatus, setKeyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')

  const [microphoneAccess, setMicrophoneAccess] = useState('unknown')
  const [accessibilityTrusted, setAccessibilityTrusted] = useState(false)
  const [contextAccess, setContextAccess] = useState<SmartContextAccessStatus>({
    status: 'unavailable',
    message: 'Checking Smart Mode context access…',
    context: null,
  })

  const [refreshingDevices, setRefreshingDevices] = useState(false)
  const [testRecording, setTestRecording] = useState(false)
  const [testResult, setTestResult] = useState<{ transcript?: string; time?: number; error?: string } | null>(null)

  const loadPermissions = useCallback(async (promptContext = false) => {
    const [micStatus, accessibility, smartContext] = await Promise.all([
      window.windowControls?.getMicrophoneAccessStatus?.() ?? Promise.resolve('unknown'),
      window.windowControls?.checkAccessibility?.() ?? Promise.resolve(false),
      promptContext
        ? window.windowControls?.promptSmartContextAccess?.() ?? Promise.resolve({
            status: 'unavailable',
            message: 'Smart Mode context access is unavailable.',
            context: null,
          })
        : window.windowControls?.checkSmartContextAccess?.() ?? Promise.resolve({
            status: 'unavailable',
            message: 'Smart Mode context access is unavailable.',
            context: null,
          }),
    ])

    setMicrophoneAccess(micStatus)
    setAccessibilityTrusted(accessibility)
    setContextAccess(smartContext)
  }, [])

  const fetchStatus = useCallback(async () => {
    const res = await axios.get<BackendStatus>(`${API_BASE}/status`, { timeout: 3000 })
    setStatus(res.data)
    return res.data
  }, [])

  const fetchAll = useCallback(async (attempt = 0) => {
    setConnectionState('connecting')
    setSaveError(null)

    try {
      const [configRes, modelsRes, keysRes, devicesRes, skillsRes, statusRes] = await Promise.all([
        axios.get<AppConfig>(`${API_BASE}/config`, { timeout: 30000 }),
        axios.get<ProviderModels>(`${API_BASE}/providers/models`, { timeout: 30000 }),
        axios.get<KeyStatusMap>(`${API_BASE}/secrets/check`, { timeout: 30000 }),
        axios.get<{ devices: AudioDevice[] }>(`${API_BASE}/audio/devices`, { timeout: 30000 }),
        axios.get<{ skills: Skill[] }>(`${API_BASE}/skills`, { timeout: 30000 }),
        axios.get<BackendStatus>(`${API_BASE}/status`, { timeout: 30000 }),
      ])

      setRemoteConfig(configRes.data)
      setDraftConfig(configRes.data)
      setProviderModels(modelsRes.data)
      setKeysSet(keysRes.data)
      setAudioDevices(devicesRes.data.devices || [])
      setSkills(skillsRes.data.skills || [])
      setStatus(statusRes.data)
      setConnectionState('connected')
      setRetryCount(0)
      await loadPermissions()
    } catch {
      if (attempt < 5) {
        const delay = Math.pow(2, attempt) * 700
        setTimeout(() => {
          setRetryCount(attempt + 1)
          fetchAll(attempt + 1)
        }, delay)
      } else {
        setConnectionState('error')
      }
    }
  }, [loadPermissions])

  useEffect(() => {
    let mounted = true
    window.windowControls?.getBackendBootState?.().then((state) => {
      if (mounted && state) setBootState(state)
    })
    const dispose = window.windowControls?.onBackendBootState?.((state) => {
      if (mounted) setBootState(state)
    })
    return () => {
      mounted = false
      dispose?.()
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    if (connectionState !== 'connected') return

    const interval = setInterval(async () => {
      try {
        await fetchStatus()
      } catch {
        setConnectionState('error')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [connectionState, fetchStatus])

  const saveConfig = async () => {
    if (!draftConfig) return
    setSaving(true)
    setSaveError(null)

    try {
      const res = await axios.post<{ status: string; config: AppConfig }>(`${API_BASE}/config`, draftConfig)
      setRemoteConfig(res.data.config)
      setDraftConfig(res.data.config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
      await fetchStatus()
    } catch (error: any) {
      setSaveError(error?.response?.data?.detail || 'Failed to apply the updated setup.')
    } finally {
      setSaving(false)
    }
  }

  const saveApiKey = async () => {
    setKeyStatus('saving')
    try {
      await axios.post(`${API_BASE}/secrets`, { provider: apiProvider, key: apiKey })
      setApiKey('')
      setKeysSet((prev) => ({ ...prev, [apiProvider]: true }))
      setKeyStatus('success')
      const modelsRes = await axios.get<ProviderModels>(`${API_BASE}/providers/models`, { timeout: 10000 })
      setProviderModels(modelsRes.data)
      setTimeout(() => setKeyStatus('idle'), 3000)
    } catch {
      setKeyStatus('error')
      setTimeout(() => setKeyStatus('idle'), 3000)
    }
  }

  const refreshDevices = async () => {
    setRefreshingDevices(true)
    try {
      const res = await axios.get<{ devices: AudioDevice[] }>(`${API_BASE}/audio/devices?refresh=true`, { timeout: 5000 })
      setAudioDevices(res.data.devices || [])
    } finally {
      setRefreshingDevices(false)
    }
  }

  const startTestRecording = async () => {
    try {
      await axios.post(`${API_BASE}/audio/test/start`)
      setTestRecording(true)
      setTestResult(null)
    } catch (error: any) {
      setTestResult({ error: error.response?.data?.message || 'Failed to start the microphone test.' })
    }
  }

  const stopTestRecording = async () => {
    setTestRecording(false)
    try {
      const res = await axios.post(`${API_BASE}/audio/test/stop`)
      if (res.data.status === 'success') {
        setTestResult({ transcript: res.data.transcript, time: res.data.processing_time })
      } else {
        setTestResult({ error: res.data.message })
      }
    } catch (error: any) {
      setTestResult({ error: error.response?.data?.message || 'Failed to process the microphone test.' })
    }
  }

  const requestMicrophone = async () => {
    await window.windowControls?.requestMicrophoneAccess?.()
    await loadPermissions()
  }

  const requestAccessibility = async () => {
    window.windowControls?.promptAccessibility?.()
    setTimeout(() => {
      void loadPermissions()
    }, 500)
  }

  const requestSmartContext = async () => {
    await loadPermissions(true)
  }

  const updateProvider = (section: 'llm' | 'stt', newProvider: string) => {
    if (!draftConfig || !providerModels) return
    const models = section === 'llm'
      ? providerModels.llm?.[newProvider] || []
      : providerModels.stt?.[newProvider] || []
    const nextModel = models[0]?.id || ''

    setDraftConfig({
      ...draftConfig,
      [section]: {
        ...draftConfig[section],
        provider: newProvider,
        model: nextModel,
      },
    })
  }

  const dirty = remoteConfig && draftConfig
    ? JSON.stringify(remoteConfig) !== JSON.stringify(draftConfig)
    : false

  if (connectionState === 'connecting') {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <BrandedProgressLoader
          title={bootState.label}
          subtitle={retryCount > 0 ? `${bootState.detail} Retry ${retryCount} of 5.` : bootState.detail}
          progress={bootState.progress}
        />
      </div>
    )
  }

  if (connectionState === 'error' || !draftConfig || !remoteConfig || !providerModels) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <div className="w-full max-w-xl rounded-[28px] border border-semantic-error/20 bg-[linear-gradient(180deg,rgba(42,11,18,0.75),rgba(11,8,12,0.9))] p-8 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-3 text-semantic-error">
            <ErrorIcon size={22} />
            <h1 className="text-lg font-semibold text-text-primary">Setup is waiting on the local engine</h1>
          </div>
          <p className="mt-4 text-sm leading-7 text-text-secondary">
            TruHandsFree could not load the backend on <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs text-accent-primary">127.0.0.1:8055</code>.
            Check the local logs below, then retry from here.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.26em] text-text-muted">Backend log</div>
              <code className="mt-3 block break-all rounded-xl bg-black/35 px-3 py-2 text-xs text-text-primary">~/.truhandsfree/logs/app.log</code>
            </div>
            <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.26em] text-text-muted">Electron log</div>
              <code className="mt-3 block break-all rounded-xl bg-black/35 px-3 py-2 text-xs text-text-primary">~/.truhandsfree/logs/electron.log</code>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <FooterButton onClick={() => fetchAll(0)}>Retry setup</FooterButton>
          </div>
        </div>
      </div>
    )
  }

  const llmModels = providerModels.llm?.[draftConfig.llm.provider] || []
  const sttModels = providerModels.stt?.[draftConfig.stt.provider] || []
  const activeSkill = skills.find((skill) => skill.id === draftConfig.hotkeys.default_skill_id)
  const contextPreview = status?.captured_context || contextAccess.context || EMPTY_CONTEXT
  const microphoneTone = microphoneAccess === 'granted' ? 'good' : microphoneAccess === 'unknown' ? 'warn' : 'danger'
  const contextTone = contextAccess.status === 'full' ? 'good' : contextAccess.status === 'app-only' ? 'warn' : 'danger'
  const backendTone = status?.phase === 'error' ? 'danger' : 'good'

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="border-b border-white/6 px-8 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-text-muted">Guided setup</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">Polish the way TruHandsFree starts, listens, and transforms.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-text-secondary">
              This setup flow keeps the existing engine behavior intact while making Smart Mode honest about what context it can see and when it falls back.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={status?.phase_label || 'Ready'} tone={backendTone} />
            <StatusBadge label={status?.missing_api_keys ? 'Keys missing' : 'Providers ready'} tone={status?.missing_api_keys ? 'warn' : 'good'} />
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-4">
          {STEPS.map((step) => (
            <StepButton
              key={step.id}
              active={activeStep === step.id}
              eyebrow={step.eyebrow}
              label={step.label}
              onClick={() => setActiveStep(step.id)}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-28">
          {activeStep === 'permissions' ? (
            <>
              <SectionCard
                title="Permission checks"
                icon={<ShieldIcon size={18} />}
                description="Smart Mode needs the right macOS permissions to read target context, transcribe your voice, and paste back into the focused app."
              >
                <div className="grid gap-4 lg:grid-cols-3">
                  <PermissionCard
                    title="Microphone"
                    subtitle="Used for dictation, STT testing, and Smart Mode capture."
                    statusLabel={microphoneAccess === 'granted' ? 'Allowed' : microphoneAccess}
                    tone={microphoneTone}
                    action={microphoneAccess !== 'granted' ? <FooterButton onClick={requestMicrophone}>Allow microphone</FooterButton> : undefined}
                  />
                  <PermissionCard
                    title="Accessibility"
                    subtitle="Needed for global shortcuts and native paste handoff."
                    statusLabel={accessibilityTrusted ? 'Allowed' : 'Needs access'}
                    tone={accessibilityTrusted ? 'good' : 'danger'}
                    action={!accessibilityTrusted ? <FooterButton onClick={requestAccessibility}>Enable accessibility</FooterButton> : undefined}
                  />
                  <PermissionCard
                    title="Smart Mode context"
                    subtitle="Reads the frontmost app, window title, and supported browser tab metadata."
                    statusLabel={contextAccess.status === 'full' ? 'Full context' : contextAccess.status === 'app-only' ? 'App only' : 'Unavailable'}
                    tone={contextTone}
                    action={<FooterButton onClick={requestSmartContext}>{contextAccess.status === 'unavailable' ? 'Check context access' : 'Refresh context access'}</FooterButton>}
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="API keys"
                icon={<KeyIcon size={18} />}
                description="Keys are saved immediately so model discovery and live provider checks can update without waiting for a full Apply."
              >
                <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {['groq', 'openai', 'anthropic', 'deepgram'].map((provider) => {
                      const active = apiProvider === provider
                      return (
                        <button
                          key={provider}
                          onClick={() => setApiProvider(provider)}
                          className={`rounded-2xl border p-4 text-left transition-all ${
                            active
                              ? 'border-accent-primary/25 bg-accent-primary/12'
                              : 'border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="text-sm font-medium text-text-primary">{provider.charAt(0).toUpperCase() + provider.slice(1)}</div>
                          <div className="mt-2 text-sm text-text-secondary">{keysSet[provider] ? 'Stored securely' : 'No key saved yet'}</div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                    <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
                      {apiProvider.charAt(0).toUpperCase() + apiProvider.slice(1)} API key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={keysSet[apiProvider] ? 'Stored securely. Paste a new key to replace it.' : 'Paste your API key'}
                      className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-text-primary outline-none transition-all placeholder:text-text-muted focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
                    />
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-sm text-text-secondary">
                        {keysSet[apiProvider] ? 'Saving a new value will replace the existing secure entry.' : 'This provider will light up once the key is stored.'}
                      </div>
                      <FooterButton onClick={saveApiKey} disabled={!apiKey || keyStatus === 'saving'}>
                        {keyStatus === 'saving' ? 'Saving…' : keyStatus === 'success' ? 'Saved' : keyStatus === 'error' ? 'Try again' : 'Save key'}
                      </FooterButton>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Privacy notes"
                icon={<WarningIcon size={18} />}
                description="Smart Mode uses only the smallest context needed to tailor the rewrite."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4 text-sm leading-7 text-text-secondary">
                    Smart Mode sends the frontmost app name, window title, active browser tab title, and site hostname when they are available.
                  </div>
                  <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4 text-sm leading-7 text-text-secondary">
                    TruHandsFree does not send full page content and does not need the full URL to adapt formatting for the destination.
                  </div>
                </div>
              </SectionCard>
            </>
          ) : null}

          {activeStep === 'voice' ? (
            <>
              <SectionCard
                title="Speech-to-text engine"
                icon={<WaveIcon size={18} />}
                description="Choose the provider and model that power raw dictation and the transcription step of Smart Mode."
              >
                <div className="grid gap-5">
                  <ProviderPicker
                    label="STT provider"
                    value={draftConfig.stt.provider}
                    options={PROVIDERS.stt}
                    availableKeys={keysSet}
                    onChange={(provider) => updateProvider('stt', provider)}
                  />

                  <div>
                    <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">STT model</label>
                    <select
                      className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
                      value={draftConfig.stt.model}
                      onChange={(event) => setDraftConfig({ ...draftConfig, stt: { ...draftConfig.stt, model: event.target.value } })}
                    >
                      {sttModels.map((model) => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Microphone source"
                icon={<MicIcon size={18} />}
                description="Pick the default input device for dictation and Smart Mode. Refresh after plugging in a new microphone."
                action={
                  <button
                    onClick={refreshDevices}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-text-secondary transition-all hover:bg-white/[0.06] hover:text-text-primary"
                  >
                    <RefreshIcon size={14} className={refreshingDevices ? 'animate-spin' : ''} />
                    Refresh devices
                  </button>
                }
              >
                <select
                  className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
                  value={draftConfig.audio.input_device || ''}
                  onChange={(event) => setDraftConfig({
                    ...draftConfig,
                    audio: { ...draftConfig.audio, input_device: event.target.value || null },
                  })}
                >
                  <option value="">System default microphone</option>
                  {audioDevices.map((device) => (
                    <option key={device.name} value={device.name}>
                      {device.name} ({device.channels} channels)
                    </option>
                  ))}
                </select>
              </SectionCard>

              <SectionCard
                title="Microphone check"
                icon={<CheckIcon size={18} />}
                description="Run a quick transcription test without triggering paste so you can confirm your STT model and microphone setup."
              >
                <div className="flex flex-wrap items-center gap-3">
                  <FooterButton onClick={testRecording ? stopTestRecording : startTestRecording}>
                    {testRecording ? 'Stop and transcribe' : 'Start microphone check'}
                  </FooterButton>
                  <StatusBadge label={testRecording ? 'Listening now' : 'Idle'} tone={testRecording ? 'warn' : 'neutral'} />
                </div>

                {testResult ? (
                  <div className="mt-5 rounded-2xl border border-white/6 bg-black/30 p-4">
                    {testResult.error ? (
                      <div className="text-sm text-semantic-error">{testResult.error}</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3 border-b border-white/6 pb-3 text-sm text-text-secondary">
                          <span>Latest transcript preview</span>
                          <span>{testResult.time}s</span>
                        </div>
                        <pre className="mt-4 whitespace-pre-wrap text-sm leading-7 text-text-primary">{testResult.transcript || '<empty transcript>'}</pre>
                      </>
                    )}
                  </div>
                ) : null}
              </SectionCard>
            </>
          ) : null}

          {activeStep === 'smart' ? (
            <>
              <SectionCard
                title="Language model"
                icon={<SparkIcon size={18} />}
                description="Smart Mode uses the selected LLM after transcription. The chosen default skill shapes how the rewrite behaves."
              >
                <div className="grid gap-5">
                  <ProviderPicker
                    label="LLM provider"
                    value={draftConfig.llm.provider}
                    options={PROVIDERS.llm}
                    availableKeys={keysSet}
                    onChange={(provider) => updateProvider('llm', provider)}
                  />

                  <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                    <div>
                      <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">LLM model</label>
                      <select
                        className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
                        value={draftConfig.llm.model}
                        onChange={(event) => setDraftConfig({ ...draftConfig, llm: { ...draftConfig.llm, model: event.target.value } })}
                      >
                        {llmModels.map((model) => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Default skill</label>
                      <select
                        className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
                        value={draftConfig.hotkeys.default_skill_id}
                        onChange={(event) => setDraftConfig({
                          ...draftConfig,
                          hotkeys: { ...draftConfig.hotkeys, default_skill_id: event.target.value },
                        })}
                      >
                        {skills.map((skill) => (
                          <option key={skill.id} value={skill.id}>{skill.name}</option>
                        ))}
                      </select>
                      {activeSkill ? <p className="mt-3 text-sm leading-6 text-text-secondary">{activeSkill.description || 'This skill shapes how Smart Mode rewrites your transcript.'}</p> : null}
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Smart Mode will see"
                icon={<SetupIcon size={18} />}
                description="This preview mirrors the context payload the backend stores for the latest Smart Mode capture."
                action={<StatusBadge label={contextAccess.status === 'full' ? 'Context ready' : contextAccess.status === 'app-only' ? 'Partial context' : 'Transcript-only fallback'} tone={contextTone} />}
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <ContextField label="App name" value={contextPreview.app_name} />
                  <ContextField label="Window title" value={contextPreview.window_title} />
                  <ContextField label="Page title" value={contextPreview.page_title} />
                  <ContextField label="Site host" value={contextPreview.url_host} />
                </div>

                {status?.context_warning ? (
                  <div className="mt-5 rounded-2xl border border-semantic-warning/20 bg-semantic-warning/8 p-4">
                    <div className="flex items-start gap-3">
                      <WarningIcon size={18} className="mt-0.5 text-semantic-warning" />
                      <div>
                        <div className="text-sm font-medium text-text-primary">Smart Mode fallback active</div>
                        <p className="mt-2 text-sm leading-6 text-text-secondary">{status.context_warning}</p>
                        <div className="mt-4">
                          <FooterButton onClick={requestSmartContext}>Retry context access</FooterButton>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4 text-sm leading-7 text-text-secondary">
                    Smart Mode captures the frontmost app and window at the moment recording starts, so the rewrite matches the destination you intended before any UI focus changes.
                  </div>
                  <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4 text-sm leading-7 text-text-secondary">
                    Browser enrichment is best-effort. If a supported browser blocks Automation access, the transcript still processes with app and window context when possible.
                  </div>
                </div>
              </SectionCard>
            </>
          ) : null}

          {activeStep === 'advanced' ? (
            <>
              <SectionCard
                title="Shortcuts"
                icon={<WaveIcon size={18} />}
                description="These shortcuts are currently read-only in Setup because Electron still registers the live global shortcuts directly."
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <ReadOnlyShortcut
                    title="Pure Dictation"
                    shortcut="^D / ⌘D"
                    description="Starts and stops raw transcription, then pastes the transcript into the focused app without running the LLM."
                  />
                  <ReadOnlyShortcut
                    title="Smart Transform"
                    shortcut="^T / ⌘T"
                    description="Captures transcript plus Smart Mode context, rewrites with the selected skill, and pastes the final result back into the focused app."
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Recovery and logs"
                icon={<RefreshIcon size={18} />}
                description="Use these paths and actions if setup or startup drifts out of sync."
                action={<FooterButton onClick={() => fetchAll(0)}>Retry setup sync</FooterButton>}
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                    <div className="text-[11px] uppercase tracking-[0.26em] text-text-muted">Backend log</div>
                    <code className="mt-3 block break-all rounded-xl bg-black/35 px-3 py-2 text-xs text-text-primary">~/.truhandsfree/logs/app.log</code>
                  </div>
                  <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                    <div className="text-[11px] uppercase tracking-[0.26em] text-text-muted">Electron log</div>
                    <code className="mt-3 block break-all rounded-xl bg-black/35 px-3 py-2 text-xs text-text-primary">~/.truhandsfree/logs/electron.log</code>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Latest debug transcript"
                icon={<MicIcon size={18} />}
                description="The microphone check from the Voice step surfaces here too, so recovery stays in one place."
              >
                {testResult ? (
                  <div className="rounded-2xl border border-white/6 bg-black/30 p-4">
                    {testResult.error ? (
                      <div className="text-sm text-semantic-error">{testResult.error}</div>
                    ) : (
                      <>
                        <div className="text-[11px] uppercase tracking-[0.28em] text-text-muted">Transcript</div>
                        <pre className="mt-3 whitespace-pre-wrap text-sm leading-7 text-text-primary">{testResult.transcript || '<empty transcript>'}</pre>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-text-secondary">
                    Run a microphone check in the Voice step to inspect the raw STT output here.
                  </div>
                )}
              </SectionCard>
            </>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-8 pb-6">
        <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(7,18,28,0.92),rgba(4,10,16,0.92))] px-5 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
              {saved ? <CheckIcon size={16} className="text-semantic-success" /> : <ArrowRightIcon size={16} className="text-accent-primary" />}
              {saved ? 'Setup applied' : dirty ? 'Changes ready to apply' : 'Setup in sync'}
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              {saveError
                ? saveError
                : dirty
                  ? 'Apply once to restart the engine with your new providers, device, or skill selection.'
                  : 'API keys save immediately. Provider, device, and skill changes stay local until you apply them.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <FooterButton tone="secondary" onClick={() => setDraftConfig(remoteConfig)} disabled={!dirty || saving}>
              Reset
            </FooterButton>
            <FooterButton onClick={saveConfig} disabled={!dirty || saving}>
              {saving ? 'Applying…' : 'Apply changes'}
            </FooterButton>
          </div>
        </div>
      </div>
    </div>
  )
}
