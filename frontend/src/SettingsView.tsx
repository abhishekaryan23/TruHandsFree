import { useCallback, useEffect, useState, type ReactNode } from 'react'
import axios from 'axios'
import { AnimatePresence, motion } from 'framer-motion'

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
import { apiGet, apiPost } from './lib/api'
import type {
  AppLaunchContext,
  AppConfig,
  AudioDevice,
  BackendBootState,
  BackendStatus,
  PrivacyPane,
  ProviderModels,
  ProviderOption,
  Skill,
  SmartContext,
  SmartContextAccessStatus,
} from './types'

type ConnectionState = 'connecting' | 'connected' | 'error'
type KeyStatusMap = Record<string, boolean>
type StepId = 'permissions' | 'voice' | 'smart' | 'advanced'
type OnboardingStepId = 'microphone' | 'accessibility' | 'context' | 'providers' | 'complete'
type PermissionSnapshot = {
  microphoneAccess: string
  accessibilityTrusted: boolean
  contextAccess: SmartContextAccessStatus
}

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

const STEP_DETAILS: Record<StepId, { title: string; description: string }> = {
  permissions: {
    title: 'Access and keys',
    description: 'Confirm permissions, store provider keys, and review what Smart Mode is allowed to read before you move deeper into setup.',
  },
  voice: {
    title: 'Capture pipeline',
    description: 'Choose the speech-to-text stack, input device, and run a mic check before you start dictating into other apps.',
  },
  smart: {
    title: 'Rewrite behavior',
    description: 'Pick the LLM and default skill, then verify exactly which destination context Smart Mode will use when it rewrites.',
  },
  advanced: {
    title: 'Recovery and debug',
    description: 'Use the same Debug STT tools, logs, and retry actions here when something drifts out of sync.',
  },
}

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

const STEP_MOTION = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
}

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data
    if (typeof detail === 'string' && detail.trim()) return detail
    if (detail && typeof detail === 'object') {
      const message = 'detail' in detail
        ? detail.detail
        : 'message' in detail
          ? detail.message
          : null
      if (typeof message === 'string' && message.trim()) return message
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
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
    <div className={`inline-flex max-w-full items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-medium leading-none ${surfaceTone(tone)}`}>
      <div className="h-1.5 w-1.5 rounded-full bg-current" />
      <span>{label}</span>
    </div>
  )
}

function resolveConfiguredDevice(audioConfig: AppConfig['audio'], devices: AudioDevice[]) {
  if (audioConfig.input_device_id) {
    const byId = devices.find((device) => device.id === audioConfig.input_device_id)
    if (byId) return byId
  }

  const fallbackLabel = audioConfig.input_device_label || audioConfig.input_device
  if (!fallbackLabel) return null

  return devices.find((device) => device.label === fallbackLabel) || null
}

function SidebarSectionButton({
  active,
  collapsed,
  icon,
  label,
  summary,
  onClick,
}: {
  active: boolean
  collapsed: boolean
  icon: ReactNode
  label: string
  summary: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      aria-pressed={active}
      aria-label={collapsed ? label : undefined}
      className={`settings-sidebar-item flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
        active
          ? 'settings-sidebar-item-active'
          : 'text-text-secondary hover:text-text-primary'
      } ${collapsed ? 'justify-center' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#091018]`}
    >
      <div
        className={`widget-control flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          active
            ? 'text-accent-primary'
            : 'text-text-muted'
        }`}
      >
        {icon}
      </div>
      {!collapsed ? (
        <div className="min-w-0">
          <div className={`truncate text-sm font-medium ${active ? 'text-text-primary' : 'text-text-primary'}`}>{label}</div>
          <div className="mt-1 truncate text-xs text-text-muted">{summary}</div>
        </div>
      ) : null}
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
          <div className="flex items-center gap-3 text-sm font-semibold text-text-primary">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] text-text-primary/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {icon}
            </div>
            <span>{title}</span>
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
    <div className="section-intro-panel rounded-2xl border border-white/6 p-4">
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
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.id)}
              className={`rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#091018] ${
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

function OptionalContextField({
  label,
  value,
  emptyLabel,
}: {
  label: string
  value: string | null | undefined
  emptyLabel: string
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
      <div className="text-[11px] uppercase tracking-[0.28em] text-text-muted">{label}</div>
      <div className="mt-2 break-all font-mono text-sm text-text-primary">{value || emptyLabel}</div>
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#091018] disabled:cursor-not-allowed disabled:opacity-45 ${classes}`}
    >
      {children}
    </button>
  )
}

function hasUsefulContext(context: SmartContext | null | undefined) {
  if (!context) return false
  return Boolean(
    (context.app_name && context.app_name !== 'Unknown')
    || context.window_title
    || context.page_title
    || context.url_host
  )
}

function formatQualityLabel(quality: BackendStatus['captured_context_quality']) {
  if (quality === 'full') return 'Full capture'
  if (quality === 'app_only') return 'App only'
  if (quality === 'transcript_only') return 'Transcript only'
  return 'Not captured yet'
}

function formatQualityTone(quality: BackendStatus['captured_context_quality']) {
  if (quality === 'full') return 'good' as const
  if (quality === 'app_only') return 'warn' as const
  if (quality === 'transcript_only') return 'danger' as const
  return 'neutral' as const
}

function formatTargetType(targetType: string | null | undefined) {
  if (!targetType) return 'Generic'
  return targetType.replace(/_/g, ' ')
}

function formatCapturedAt(value: string | null | undefined) {
  if (!value) return 'Not captured yet'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export const SettingsView = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [retryCount, setRetryCount] = useState(0)
  const [bootState, setBootState] = useState<BackendBootState>(DEFAULT_BOOT_STATE)
  const [launchContext, setLaunchContext] = useState<AppLaunchContext | null>(null)

  const [remoteConfig, setRemoteConfig] = useState<AppConfig | null>(null)
  const [draftConfig, setDraftConfig] = useState<AppConfig | null>(null)
  const [providerModels, setProviderModels] = useState<ProviderModels | null>(null)
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [keysSet, setKeysSet] = useState<KeyStatusMap>({})
  const [status, setStatus] = useState<BackendStatus | null>(null)

  const [activeStep, setActiveStep] = useState<StepId>('permissions')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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
  const [contextOnboardingResolved, setContextOnboardingResolved] = useState(false)
  const [onboardingHint, setOnboardingHint] = useState<string | null>(null)

  const [refreshingDevices, setRefreshingDevices] = useState(false)
  const [testRecording, setTestRecording] = useState(false)
  const [testResult, setTestResult] = useState<{ transcript?: string; time?: number; error?: string; fallback_notice?: string | null } | null>(null)

  const loadPermissions = useCallback(async (promptContext = false): Promise<PermissionSnapshot> => {
    const [bundleMicStatus, accessibility, smartContext] = await Promise.all([
      window.windowControls?.getCapturePermissionStatus?.() ?? Promise.resolve('unknown'),
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

    setMicrophoneAccess(bundleMicStatus)
    setAccessibilityTrusted(accessibility)
    setContextAccess(smartContext)
    return {
      microphoneAccess: bundleMicStatus,
      accessibilityTrusted: accessibility,
      contextAccess: smartContext,
    }
  }, [])

  const fetchStatus = useCallback(async () => {
    const res = await apiGet<BackendStatus>('/status', { timeout: 3000 })
    setStatus(res.data)
    return res.data
  }, [])

  const fetchAll = useCallback(async (attempt = 0) => {
    setConnectionState('connecting')
    setSaveError(null)

    try {
      const [configRes, modelsRes, keysRes, devicesRes, skillsRes, statusRes] = await Promise.all([
        apiGet<AppConfig>('/config', { timeout: 30000 }),
        apiGet<ProviderModels>('/providers/models', { timeout: 30000 }),
        apiGet<KeyStatusMap>('/secrets/check', { timeout: 30000 }),
        window.windowControls?.getCaptureDevices?.() ?? Promise.resolve([]),
        apiGet<{ skills: Skill[] }>('/skills', { timeout: 30000 }),
        apiGet<BackendStatus>('/status', { timeout: 30000 }),
      ])

      setRemoteConfig(configRes.data)
      setDraftConfig(configRes.data)
      setProviderModels(modelsRes.data)
      setKeysSet(keysRes.data)
      setAudioDevices(devicesRes || [])
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
    window.windowControls?.getLaunchContext?.().then((context) => {
      if (mounted && context) setLaunchContext(context)
    })
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

  useEffect(() => {
    if (connectionState !== 'connected') return

    const refreshPermissions = () => {
      void loadPermissions()
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) refreshPermissions()
    }

    window.addEventListener('focus', refreshPermissions)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', refreshPermissions)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [connectionState, loadPermissions])

  useEffect(() => {
    if (connectionState !== 'connected') return
    const packagedOnboardingActive = Boolean(
      launchContext?.is_packaged
      && !launchContext.onboarding_completed
      && !launchContext.onboarding_dismissed
    )
    if (activeStep !== 'permissions' && !packagedOnboardingActive) return

    const interval = setInterval(() => {
      void loadPermissions()
    }, 2500)

    return () => clearInterval(interval)
  }, [activeStep, connectionState, launchContext, loadPermissions])

  const saveConfig = async () => {
    if (!draftConfig) return
    setSaving(true)
    setSaveError(null)

    try {
      const res = await apiPost<{ status: string; config: AppConfig }>('/config', draftConfig)
      setRemoteConfig(res.data.config)
      setDraftConfig(res.data.config)
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
      await fetchStatus()
    } catch (error: unknown) {
      setSaveError(getErrorMessage(error, 'Failed to apply the updated setup.'))
    } finally {
      setSaving(false)
    }
  }

  const saveApiKey = async () => {
    setKeyStatus('saving')
    try {
      await apiPost('/secrets', { provider: apiProvider, key: apiKey })
      setApiKey('')
      setKeysSet((prev) => ({ ...prev, [apiProvider]: true }))
      setKeyStatus('success')
      const modelsRes = await apiGet<ProviderModels>('/providers/models', { timeout: 10000 })
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
      const devices = await window.windowControls?.getCaptureDevices?.(true)
      setAudioDevices(devices || [])
    } finally {
      setRefreshingDevices(false)
    }
  }

  const startTestRecording = async () => {
    try {
      if (!draftConfig) return
      const selectedDevice = resolveConfiguredDevice(draftConfig.audio, audioDevices)
      await window.windowControls?.startMicTest?.(selectedDevice?.id ?? null, selectedDevice?.label ?? null)
      setTestRecording(true)
      setTestResult(null)
    } catch (error: unknown) {
      setTestResult({ error: getErrorMessage(error, 'Failed to start the microphone test.') })
    }
  }

  const stopTestRecording = async () => {
    setTestRecording(false)
    try {
      const res = await window.windowControls?.stopMicTest?.()
      if (res?.status === 'success') {
        setTestResult({ transcript: res.transcript, time: res.processing_time, fallback_notice: res.fallback_notice })
      } else {
        setTestResult({ error: res?.message || 'Failed to process the microphone test.', fallback_notice: res?.fallback_notice })
      }
    } catch (error: unknown) {
      setTestResult({ error: getErrorMessage(error, 'Failed to process the microphone test.') })
    }
  }

  const openPrivacySettings = (pane: PrivacyPane) => {
    window.windowControls?.openPrivacySettings?.(pane)
  }

  const requestMicrophone = async () => {
    const currentStatus = microphoneAccess
    if (currentStatus === 'denied' || currentStatus === 'restricted') {
      openPrivacySettings('microphone')
      await loadPermissions()
      return
    }

    const nextStatus = await window.windowControls?.requestCapturePermission?.() ?? 'unknown'
    const snapshot = await loadPermissions()

    if (nextStatus !== 'granted' || snapshot.microphoneAccess !== 'granted') {
      openPrivacySettings('microphone')
    }
  }

  const requestAccessibility = async () => {
    window.windowControls?.promptAccessibility?.()
    openPrivacySettings('accessibility')
    setTimeout(() => {
      void loadPermissions()
    }, 700)
  }

  const requestSmartContext = async () => {
    const snapshot = await loadPermissions(true)
    if (snapshot.contextAccess.status !== 'unavailable') {
      setContextOnboardingResolved(true)
      setOnboardingHint(null)
      return snapshot
    }

    setOnboardingHint('Browser context still needs Automation access. Open Privacy & Security → Automation, then retry with a supported browser frontmost.')
    openPrivacySettings('automation')
    return snapshot
  }

  const restartLocalEngine = async () => {
    setConnectionState('connecting')
    try {
      await window.windowControls?.restartBackend?.()
      await fetchAll(0)
    } catch (error: unknown) {
      setConnectionState('error')
      setSaveError(getErrorMessage(error, 'Failed to restart the local engine.'))
    }
  }

  const dismissPackagedOnboarding = async () => {
    const nextContext = await window.windowControls?.dismissPackagedOnboarding?.()
    if (nextContext) setLaunchContext(nextContext)
  }

  const completePackagedOnboarding = async () => {
    const nextContext = await window.windowControls?.completePackagedOnboarding?.()
    if (nextContext) setLaunchContext(nextContext)
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
  const packagedOnboardingVisible = Boolean(
    launchContext?.is_packaged
    && !launchContext.onboarding_completed
    && !launchContext.onboarding_dismissed
  )

  useEffect(() => {
    if (!packagedOnboardingVisible) {
      setContextOnboardingResolved(false)
      setOnboardingHint(null)
      return
    }

    if (activeStep !== 'permissions') {
      setActiveStep('permissions')
    }
  }, [activeStep, packagedOnboardingVisible])

  useEffect(() => {
    if (!packagedOnboardingVisible) return
    if (contextAccess.status !== 'unavailable') {
      setContextOnboardingResolved(true)
      setOnboardingHint(null)
    }
  }, [contextAccess.status, packagedOnboardingVisible])

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
            TruHandsFree could not reach the embedded backend at <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs text-accent-primary">{launchContext?.backend_base_url || 'the local loopback endpoint'}</code>.
            Check the local logs below, then retry from here.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.26em] text-text-muted">Backend log</div>
              <code className="mt-3 block break-all rounded-xl bg-black/35 px-3 py-2 text-xs text-text-primary">{launchContext?.log_paths.backend || '~/.truhandsfree/logs/app.log'}</code>
            </div>
            <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
              <div className="text-[11px] uppercase tracking-[0.26em] text-text-muted">Electron log</div>
              <code className="mt-3 block break-all rounded-xl bg-black/35 px-3 py-2 text-xs text-text-primary">{launchContext?.log_paths.electron || '~/.truhandsfree/logs/electron.log'}</code>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <FooterButton tone="secondary" onClick={restartLocalEngine}>Relaunch local engine</FooterButton>
            <FooterButton onClick={() => fetchAll(0)}>Retry setup</FooterButton>
          </div>
        </div>
      </div>
    )
  }

  const llmModels = providerModels.llm?.[draftConfig.llm.provider] || []
  const sttModels = providerModels.stt?.[draftConfig.stt.provider] || []
  const activeSkill = skills.find((skill) => skill.id === draftConfig.hotkeys.default_skill_id)
  const liveContextPreview = contextAccess.context || EMPTY_CONTEXT
  const hasLastCapture = Boolean(status?.captured_context_at)
  const lastCapturePreview = status?.captured_context || EMPTY_CONTEXT
  const activeStepDetail = STEP_DETAILS[activeStep]
  const configuredDevice = resolveConfiguredDevice(draftConfig.audio, audioDevices)
  const configuredDeviceLabel = configuredDevice?.label || draftConfig.audio.input_device_label || draftConfig.audio.input_device || null
  const configuredDeviceAvailable = configuredDeviceLabel ? Boolean(configuredDevice) : true
  const microphoneTone = microphoneAccess === 'granted'
    ? 'good'
    : microphoneAccess === 'denied' || microphoneAccess === 'restricted'
      ? 'danger'
      : 'warn'
  const contextTone = contextAccess.status === 'full' ? 'good' : contextAccess.status === 'app-only' ? 'warn' : 'danger'
  const backendTone = status?.phase === 'error' ? 'danger' : 'good'
  const showActionBar = dirty || saving || saved || Boolean(saveError)
  const currentSttKeyReady = Boolean(keysSet[draftConfig.stt.provider])
  const currentLlmKeyReady = Boolean(keysSet[draftConfig.llm.provider])
  const onboardingReady = microphoneAccess === 'granted' && accessibilityTrusted && currentSttKeyReady && currentLlmKeyReady
  const showPackagedOnboarding = packagedOnboardingVisible
  const onboardingStep: OnboardingStepId = microphoneAccess !== 'granted'
    ? 'microphone'
    : !accessibilityTrusted
      ? 'accessibility'
      : !contextOnboardingResolved
        ? 'context'
        : !currentSttKeyReady || !currentLlmKeyReady
          ? 'providers'
          : 'complete'
  const onboardingStepOrder: OnboardingStepId[] = ['microphone', 'accessibility', 'context', 'providers', 'complete']
  const onboardingStepIndex = onboardingStepOrder.indexOf(onboardingStep)
  const microphoneActionLabel = microphoneAccess === 'denied' || microphoneAccess === 'restricted'
    ? 'Open Microphone Settings'
    : 'Allow microphone'
  const contextActionLabel = contextAccess.status === 'unavailable'
    ? 'Check browser context access'
    : 'Refresh browser context access'
  const onboardingStepTitles: Record<OnboardingStepId, string> = {
    microphone: 'Allow microphone access',
    accessibility: 'Enable Accessibility access',
    context: 'Check Smart Mode browser context',
    providers: 'Add your first provider key',
    complete: 'Finish setup',
  }
  const onboardingStepDescriptions: Record<OnboardingStepId, string> = {
    microphone: 'TruHandsFree needs microphone access before Electron can capture dictation or run Smart Mode. If macOS has already denied it, this button takes you directly to the right Privacy pane.',
    accessibility: 'Accessibility keeps global shortcuts and paste handoff reliable. macOS may only show its prompt once, so this step also opens the Accessibility settings pane every time.',
    context: 'Smart Mode can use the frontmost app, window title, and supported browser tab metadata. Bring Safari, Chrome, Arc, Brave, or Edge frontmost before retrying if you want to trigger the browser-side prompt now.',
    providers: 'Add at least one provider key before daily use. Groq is the fastest path to a clean first run, but you can store OpenAI, Anthropic, or Deepgram keys later.',
    complete: 'The required permissions and provider setup are in place. You can finish onboarding now and use this section later as the recovery path if macOS permissions change.',
  }
  const microphoneDetail = 'This status now comes directly from the Electron app, which is the same runtime that owns permission and live capture in both dev and packaged builds.'
  const microphoneDeviceHint = configuredDeviceLabel && !configuredDeviceAvailable
    ? `The saved input device "${configuredDeviceLabel}" is not available right now. TruHandsFree will fall back to the system default microphone if the selected device stays silent.`
    : null
  const sectionSummaries: Record<StepId, string> = {
    permissions: `${microphoneAccess === 'granted' ? 'Permissions checked' : 'Permissions need review'}`,
    voice: `${draftConfig.stt.provider} • ${configuredDeviceLabel || 'System mic'}`,
    smart: `${draftConfig.llm.provider} • ${activeSkill?.name || 'No skill selected'}`,
    advanced: 'Shortcuts, logs, and Debug STT',
  }


  return (
    <motion.div
      className="relative flex h-full flex-col overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="soft-divider border-b px-6 py-3.5 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-text-muted">Settings</div>
            <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-text-primary">Preferences</h1>
            <p className="mt-1 max-w-xl text-[13px] leading-5 text-text-secondary">
              A familiar macOS-style preferences layout for permissions, providers, capture, and Smart Mode behavior.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((current) => !current)}
                className="settings-sidebar-toggle inline-flex items-center gap-2 rounded-full border border-white/8 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#091018]"
                title={sidebarCollapsed ? 'Show section list' : 'Hide section list'}
                aria-label={sidebarCollapsed ? 'Show section list' : 'Hide section list'}
              >
              <ArrowRightIcon
                size={14}
                className={`transition-transform ${sidebarCollapsed ? 'rotate-0' : 'rotate-180'}`}
              />
              {sidebarCollapsed ? 'Show sections' : 'Hide sections'}
            </button>
            <StatusBadge label={status?.phase_label || 'Ready'} tone={backendTone} />
            <StatusBadge label={status?.missing_api_keys ? 'Keys missing' : 'Providers ready'} tone={status?.missing_api_keys ? 'warn' : 'good'} />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-6 py-4 lg:px-8">
        <div className="mx-auto flex h-full max-w-7xl gap-4">
          <aside
            className={`settings-sidebar flex shrink-0 flex-col overflow-hidden rounded-[24px] border border-white/7 p-2.5 transition-[width] duration-200 ${
              sidebarCollapsed ? 'w-[82px]' : 'w-[254px]'
            }`}
          >
            <div className={`mb-2 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} gap-2 px-2`}>
              {!sidebarCollapsed ? (
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-text-muted">Sections</div>
                  <div className="mt-1 text-sm font-medium text-text-primary">Preferences</div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setSidebarCollapsed((current) => !current)}
                className="settings-sidebar-toggle flex h-9 w-9 items-center justify-center rounded-full border border-white/8 text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#091018]"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <ArrowRightIcon
                  size={14}
                  className={`transition-transform ${sidebarCollapsed ? 'rotate-0' : 'rotate-180'}`}
                />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-1.5">
              {STEPS.map((step) => (
                <SidebarSectionButton
                  key={step.id}
                  active={activeStep === step.id}
                  collapsed={sidebarCollapsed}
                  icon={
                    step.id === 'permissions' ? <ShieldIcon size={15} /> :
                    step.id === 'voice' ? <MicIcon size={15} /> :
                    step.id === 'smart' ? <SparkIcon size={15} /> :
                    <RefreshIcon size={15} />
                  }
                  label={step.label}
                  summary={sectionSummaries[step.id]}
                  onClick={() => setActiveStep(step.id)}
                />
              ))}
            </div>

            {!sidebarCollapsed ? (
              <div className="mt-3 rounded-2xl border border-white/7 bg-black/18 px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-[0.24em] text-text-muted">Current section</div>
                <div className="mt-1.5 text-sm font-medium text-text-primary">{activeStepDetail.title}</div>
                <p className="mt-1.5 text-xs leading-5 text-text-secondary">{activeStepDetail.description}</p>
              </div>
            ) : null}
          </aside>

          <div className="settings-content-shell min-w-0 flex-1 overflow-hidden rounded-[26px] border border-white/7">
            <div className={`h-full overflow-y-auto px-1 ${showActionBar ? 'pb-8' : 'pb-0'}`}>
              <div className="flex flex-col gap-4 px-4 py-3.5 lg:px-5">
                <section className="section-intro-panel rounded-[20px] border border-white/6 px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-text-muted">{STEPS.find((step) => step.id === activeStep)?.eyebrow}</div>
                      <div className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-text-primary">{activeStepDetail.title}</div>
                      <p className="mt-1 max-w-2xl text-[12px] leading-5 text-text-secondary">{activeStepDetail.description}</p>
                    </div>
                    <StatusBadge label={STEPS.find((step) => step.id === activeStep)?.label || 'Section'} tone="neutral" />
                  </div>
                </section>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activeStep}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={STEP_MOTION}
                    className="flex flex-col gap-5"
                  >
          {activeStep === 'permissions' ? (
            <>
              {showPackagedOnboarding ? (
                <SectionCard
                  title="First-time setup"
                  icon={<SetupIcon size={18} />}
                  description="This first launch flow handles the permissions and provider setup needed for daily use. Each step now has one primary action and a direct macOS recovery path if a prompt was already denied."
                  action={<StatusBadge label={onboardingReady ? 'Ready to finish' : `Step ${Math.min(onboardingStepIndex + 1, 4)} of 4`} tone={onboardingReady ? 'good' : 'warn'} />}
                >
                  <div className="grid gap-4 xl:grid-cols-[0.92fr_1.28fr]">
                    <div className="grid gap-3">
                      {(['microphone', 'accessibility', 'context', 'providers'] as OnboardingStepId[]).map((stepId, index) => {
                        const completed = onboardingStepOrder.indexOf(stepId) < onboardingStepIndex
                        const active = onboardingStep === stepId
                        const tone = completed ? 'good' : active ? 'warn' : 'neutral'
                        return (
                          <div
                            key={stepId}
                            className={`rounded-2xl border px-4 py-3 ${
                              active ? 'border-accent-primary/20 bg-accent-primary/10' : 'border-white/6 bg-white/[0.02]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.24em] text-text-muted">Step {index + 1}</div>
                                <div className="mt-1.5 text-sm font-medium text-text-primary">{onboardingStepTitles[stepId]}</div>
                              </div>
                              <StatusBadge label={completed ? 'Done' : active ? 'In progress' : 'Up next'} tone={tone} />
                            </div>
                          </div>
                        )
                      })}

                      <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-text-muted">Recovery path</div>
                        <p className="mt-2 text-sm leading-6 text-text-secondary">
                          If you deny a prompt, come back here later or open <span className="font-medium text-text-primary">System Settings → Privacy &amp; Security → Microphone / Accessibility / Automation</span>.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/7 bg-black/18 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.26em] text-text-muted">
                            {onboardingStep === 'complete' ? 'Ready to go' : `Current step • ${Math.min(onboardingStepIndex + 1, 4)} of 4`}
                          </div>
                          <h3 className="mt-2 text-lg font-semibold text-text-primary">{onboardingStepTitles[onboardingStep]}</h3>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{onboardingStepDescriptions[onboardingStep]}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge label={microphoneAccess === 'granted' ? 'Microphone ready' : 'Microphone pending'} tone={microphoneTone} />
                          <StatusBadge label={accessibilityTrusted ? 'Accessibility ready' : 'Accessibility pending'} tone={accessibilityTrusted ? 'good' : 'danger'} />
                          <StatusBadge label={currentSttKeyReady && currentLlmKeyReady ? 'Providers ready' : 'Keys still needed'} tone={currentSttKeyReady && currentLlmKeyReady ? 'good' : 'warn'} />
                        </div>
                      </div>

                      {launchContext?.should_prompt_move_to_applications ? (
                        <div className="mt-4 rounded-2xl border border-semantic-warning/20 bg-semantic-warning/8 p-4">
                          <div className="text-sm font-medium text-text-primary">Move the app to Applications before daily use</div>
                          <p className="mt-2 text-sm leading-6 text-text-secondary">
                            TruHandsFree is running from {launchContext.install_location === 'disk_image' ? 'the mounted DMG' : 'outside /Applications'}. Drag it into <span className="font-medium text-text-primary">Applications</span> so macOS permissions stay stable.
                          </p>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <FooterButton tone="secondary" onClick={() => window.windowControls?.revealAppInFinder?.()}>Reveal current app</FooterButton>
                            <FooterButton tone="secondary" onClick={() => window.windowControls?.openApplicationsFolder?.()}>Open Applications</FooterButton>
                          </div>
                        </div>
                      ) : null}

                      {onboardingStep === 'microphone' ? (
                        <div className="mt-5 space-y-4">
                          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                            <div className="text-sm font-medium text-text-primary">Microphone status</div>
                            <p className="mt-2 text-sm leading-6 text-text-secondary">
                              Current macOS status: <span className="font-medium text-text-primary">{microphoneAccess}</span>.
                            </p>
                            <p className="mt-2 text-sm leading-6 text-text-secondary">{microphoneDetail}</p>
                            {microphoneDeviceHint ? <p className="mt-2 text-sm leading-6 text-semantic-warning">{microphoneDeviceHint}</p> : null}
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <FooterButton onClick={requestMicrophone}>{microphoneActionLabel}</FooterButton>
                            <FooterButton tone="secondary" onClick={() => openPrivacySettings('microphone')}>Open Microphone Settings</FooterButton>
                          </div>
                        </div>
                      ) : null}

                      {onboardingStep === 'accessibility' ? (
                        <div className="mt-5 space-y-4">
                          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                            <div className="text-sm font-medium text-text-primary">Accessibility status</div>
                            <p className="mt-2 text-sm leading-6 text-text-secondary">
                              Accessibility is currently <span className="font-medium text-text-primary">{accessibilityTrusted ? 'enabled' : 'not enabled'}</span>. TruHandsFree uses it for global shortcuts and reliable paste handoff.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <FooterButton onClick={requestAccessibility}>Enable Accessibility</FooterButton>
                            <FooterButton tone="secondary" onClick={() => openPrivacySettings('accessibility')}>Open Accessibility Settings</FooterButton>
                          </div>
                        </div>
                      ) : null}

                      {onboardingStep === 'context' ? (
                        <div className="mt-5 space-y-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <ContextField label="Frontmost app" value={liveContextPreview.app_name} />
                            <OptionalContextField label="Detected browser host" value={liveContextPreview.url_host} emptyLabel="None yet" />
                          </div>
                          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4 text-sm leading-6 text-text-secondary">
                            {contextAccess.message}
                          </div>
                          {onboardingHint ? (
                            <div aria-live="polite" className="rounded-2xl border border-semantic-warning/20 bg-semantic-warning/8 p-4 text-sm leading-6 text-text-secondary">
                              {onboardingHint}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-3">
                            <FooterButton onClick={() => void requestSmartContext()}>{contextActionLabel}</FooterButton>
                            <FooterButton tone="secondary" onClick={() => openPrivacySettings('automation')}>Open Automation Settings</FooterButton>
                            <FooterButton tone="secondary" onClick={() => { setContextOnboardingResolved(true); setOnboardingHint('You can finish setup now and return here later if you want browser metadata for Smart Mode.') }}>
                              Continue for now
                            </FooterButton>
                          </div>
                        </div>
                      ) : null}

                      {onboardingStep === 'providers' ? (
                        <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                          <div className="grid gap-3 sm:grid-cols-2">
                            {['groq', 'openai', 'anthropic', 'deepgram'].map((provider) => {
                              const active = apiProvider === provider
                              return (
                                <button
                                  key={provider}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => setApiProvider(provider)}
                                  className={`rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#091018] ${
                                    active
                                      ? 'border-accent-primary/25 bg-accent-primary/12'
                                      : 'border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]'
                                  }`}
                                >
                                  <div className="flex flex-col items-start gap-2">
                                    <div className="text-sm font-medium text-text-primary">{provider.charAt(0).toUpperCase() + provider.slice(1)}</div>
                                    {provider === 'groq' ? <StatusBadge label="Recommended" tone="good" /> : null}
                                  </div>
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
                              className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
                            />
                            <div className="mt-4 flex items-center justify-between gap-3">
                              <div className="text-sm text-text-secondary">
                                {keysSet[apiProvider] ? 'Saving a new value will replace the existing secure entry.' : 'Save one key now. You can add the others later.'}
                              </div>
                              <FooterButton onClick={saveApiKey} disabled={!apiKey || keyStatus === 'saving'}>
                                {keyStatus === 'saving' ? 'Saving…' : keyStatus === 'success' ? 'Saved' : keyStatus === 'error' ? 'Try again' : 'Save key'}
                              </FooterButton>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {onboardingStep === 'complete' ? (
                        <div className="mt-5 space-y-4">
                          <div className="rounded-2xl border border-semantic-success/20 bg-semantic-success/8 p-4">
                            <div className="text-sm font-medium text-text-primary">Setup is ready</div>
                            <p className="mt-2 text-sm leading-6 text-text-secondary">
                              Dictation and Smart Mode can start immediately. If macOS permissions change later, this Permissions section remains the place to retry them.
                            </p>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-5 flex flex-wrap gap-3">
                        <FooterButton tone="secondary" onClick={dismissPackagedOnboarding}>Continue later</FooterButton>
                        <FooterButton onClick={completePackagedOnboarding} disabled={!onboardingReady}>
                          {onboardingReady ? 'Finish first-run setup' : 'Finish after permissions and keys'}
                        </FooterButton>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              ) : (
                <>
                  <SectionCard
                    title="Permission checks"
                    icon={<ShieldIcon size={18} />}
                    description="Smart Mode needs the right macOS permissions to read target context, transcribe your voice, and paste back into the focused app."
                  >
                    <div className="grid gap-4 lg:grid-cols-3">
                      <PermissionCard
                        title="Microphone"
                        subtitle={microphoneDeviceHint || 'Used for dictation, STT testing, and Smart Mode capture.'}
                        statusLabel={microphoneAccess === 'granted' ? 'Allowed' : microphoneAccess}
                        tone={microphoneTone}
                        action={microphoneAccess !== 'granted' ? <FooterButton onClick={requestMicrophone}>{microphoneActionLabel}</FooterButton> : undefined}
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
                        action={<FooterButton onClick={() => void requestSmartContext()}>{contextActionLabel}</FooterButton>}
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
                              type="button"
                              aria-pressed={active}
                              onClick={() => setApiProvider(provider)}
                              className={`rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#091018] ${
                                active
                                  ? 'border-accent-primary/25 bg-accent-primary/12'
                                  : 'border-white/6 bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]'
                              }`}
                            >
                              <div className="flex flex-col items-start gap-2">
                                <div className="text-sm font-medium text-text-primary">{provider.charAt(0).toUpperCase() + provider.slice(1)}</div>
                                {provider === 'groq' ? <StatusBadge label="Recommended" tone="good" /> : null}
                              </div>
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
                          className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
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
              )}
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
                    type="button"
                    onClick={refreshDevices}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#091018]"
                  >
                    <RefreshIcon size={14} className={refreshingDevices ? 'animate-spin' : ''} />
                    Refresh devices
                  </button>
                }
              >
                <select
                  className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
                  value={configuredDevice?.id || ''}
                  onChange={(event) => setDraftConfig({
                    ...draftConfig,
                    audio: {
                      ...draftConfig.audio,
                      input_device_id: event.target.value || null,
                      input_device_label: audioDevices.find((device) => device.id === event.target.value)?.label || null,
                      input_device: audioDevices.find((device) => device.id === event.target.value)?.label || null,
                    },
                  })}
                >
                  <option value="">System default microphone</option>
                  {audioDevices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}{device.is_default ? ' (Default)' : ''}
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
                      <div className="space-y-3">
                        <div className="text-sm text-semantic-error">{testResult.error}</div>
                        {testResult.fallback_notice ? (
                          <div className="text-sm text-semantic-warning">{testResult.fallback_notice}</div>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3 border-b border-white/6 pb-3 text-sm text-text-secondary">
                          <span>Latest transcript preview</span>
                          <span>{testResult.time}s</span>
                        </div>
                        {testResult.fallback_notice ? (
                          <div className="mt-4 rounded-2xl border border-semantic-warning/20 bg-semantic-warning/8 px-3 py-2 text-sm text-text-secondary">
                            {testResult.fallback_notice}
                          </div>
                        ) : null}
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
                description="Live access and the last recorded Smart Mode target are shown separately so you can tell whether access is available now or only the last capture is missing."
                action={<StatusBadge label={contextAccess.status === 'full' ? 'Context ready' : contextAccess.status === 'app-only' ? 'Partial context' : 'Transcript-only fallback'} tone={contextTone} />}
              >
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-text-primary">Live context access now</div>
                        <p className="mt-2 text-sm leading-6 text-text-secondary">
                          This is the current frontmost target reported directly by the local accessibility/browser access check.
                        </p>
                      </div>
                      <StatusBadge label={contextAccess.status === 'full' ? 'Live access ready' : contextAccess.status === 'app-only' ? 'App only' : 'Unavailable'} tone={contextTone} />
                    </div>

                    <div className="mt-4 grid gap-4">
                      <ContextField label="App name" value={liveContextPreview.app_name} />
                      <ContextField label="Window title" value={liveContextPreview.window_title} />
                      <ContextField label="Page title" value={liveContextPreview.page_title} />
                      <ContextField label="Site host" value={liveContextPreview.url_host} />
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/6 bg-black/20 px-4 py-3 text-sm leading-6 text-text-secondary">
                      {contextAccess.message}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-text-primary">Last Smart Mode capture</div>
                        <p className="mt-2 text-sm leading-6 text-text-secondary">
                          This is the last payload Smart Mode actually stored at recording start before the UI changed focus.
                        </p>
                      </div>
                      <StatusBadge
                        label={status ? formatQualityLabel(status.captured_context_quality) : 'Not captured yet'}
                        tone={status ? formatQualityTone(status.captured_context_quality) : 'neutral'}
                      />
                    </div>

                    <div className="mt-4 grid gap-4">
                      <OptionalContextField label="App name" value={lastCapturePreview.app_name} emptyLabel={hasLastCapture ? 'Unknown' : 'Not captured yet'} />
                      <OptionalContextField label="Window title" value={lastCapturePreview.window_title} emptyLabel={hasLastCapture ? 'Unknown' : 'Not captured yet'} />
                      <OptionalContextField label="Page title" value={lastCapturePreview.page_title} emptyLabel={hasLastCapture ? 'Unknown' : 'Not captured yet'} />
                      <OptionalContextField label="Site host" value={lastCapturePreview.url_host} emptyLabel={hasLastCapture ? 'Unknown' : 'Not captured yet'} />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <StatusBadge label={`Captured: ${formatCapturedAt(status?.captured_context_at)}`} tone="neutral" />
                      <StatusBadge label={`Target type: ${formatTargetType(status?.target_type)}`} tone="neutral" />
                    </div>

                    {!hasLastCapture ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-text-secondary">
                        Smart Mode has not recorded a target yet. Run one Smart Transform to populate this history card.
                      </div>
                    ) : null}

                    {!hasLastCapture && hasUsefulContext(liveContextPreview) ? (
                      <div className="mt-4 rounded-2xl border border-accent-primary/14 bg-accent-primary/8 px-4 py-3 text-sm leading-6 text-text-secondary">
                        Live access looks healthy right now. The missing values above mean “no Smart Mode capture has been stored yet,” not that the app is blind.
                      </div>
                    ) : null}
                  </div>
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
                    Browser enrichment is best-effort. If a supported browser blocks Automation access, Smart Mode degrades to app-only or transcript-only fallback instead of pretending the context is present.
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
                    <code className="mt-3 block break-all rounded-xl bg-black/35 px-3 py-2 text-xs text-text-primary">{launchContext?.log_paths.backend || '~/.truhandsfree/logs/app.log'}</code>
                  </div>
                  <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                    <div className="text-[11px] uppercase tracking-[0.26em] text-text-muted">Electron log</div>
                    <code className="mt-3 block break-all rounded-xl bg-black/35 px-3 py-2 text-xs text-text-primary">{launchContext?.log_paths.electron || '~/.truhandsfree/logs/electron.log'}</code>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Debug STT Mode"
                icon={<MicIcon size={18} />}
                description="Run the microphone and STT test here too, so recovery stays self-contained when you are troubleshooting."
              >
                <div className="flex flex-wrap items-center gap-3">
                  <FooterButton onClick={testRecording ? stopTestRecording : startTestRecording}>
                    {testRecording ? 'Stop and transcribe' : 'Start Debug STT test'}
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
                ) : (
                  <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-text-secondary">
                    Start a Debug STT test to inspect the raw transcript without triggering paste.
                  </div>
                )}
              </SectionCard>
            </>
          ) : null}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showActionBar ? (
        <div className="action-bar-shell soft-divider border-t px-6 py-4 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                {saved ? <CheckIcon size={16} className="text-semantic-success" /> : <ArrowRightIcon size={16} className={saveError ? 'text-semantic-error' : 'text-accent-primary'} />}
                {saved ? 'Setup applied' : saveError ? 'Could not apply setup' : 'Changes ready to apply'}
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {saveError || 'Apply once to restart the engine with your new providers, device, or skill selection.'}
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
      ) : null}
    </motion.div>
  )
}
