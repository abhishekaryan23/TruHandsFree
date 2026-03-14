import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Variants } from 'framer-motion'

import { BrandedProgressLoader } from './components/BrandedProgressLoader'
import { CheckIcon, ErrorIcon, MicIcon, SetupIcon, SparkIcon, WarningIcon } from './components/BrandIcons'
import { apiGet, apiPost } from './lib/api'
import type {
  BackendBootState,
  BackendStatus,
  CaptureState,
  RecordingMode,
  WidgetPresentationSource,
} from './types'

type WidgetState =
  | 'disconnected'
  | 'idle'
  | 'recording'
  | 'processing'
  | 'booting'
  | 'error_nokey'
type PresentationState = 'hidden' | 'entering' | 'visible' | 'exiting'

const DEFAULT_BOOT_STATE: BackendBootState = {
  phase: 'booting_backend',
  label: 'Preparing TruHandsFree',
  detail: 'Checking the local engine.',
  progress: 20,
}

const DEFAULT_CAPTURE_STATE: CaptureState = {
  is_recording: false,
  is_testing: false,
  mode: null,
  amplitude: 0,
  error: null,
  active_device_id: null,
  active_device_label: null,
  fallback_to_default: false,
  fallback_notice: null,
}

const SHELL_VARIANTS = {
  hidden: { y: -18, opacity: 0, scale: 0.985, filter: 'blur(4px)' },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      type: 'spring' as const,
      stiffness: 360,
      damping: 32,
      mass: 0.76,
    },
  },
  exit: {
    y: -10,
    opacity: 0,
    scale: 0.992,
    filter: 'blur(3px)',
    transition: {
      duration: 0.2,
      ease: [0.32, 0.72, 0, 1] as const,
    },
  },
} satisfies Variants

const CONTENT_VARIANTS = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.18,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: 0.14,
      ease: [0.4, 0, 1, 1] as const,
    },
  },
} satisfies Variants

function compactHost(host?: string | null) {
  return host ? host.replace(/^www\./, '') : null
}

function getProcessingTitle(status: BackendStatus | null, bootState: BackendBootState, widgetState: WidgetState) {
  if (widgetState === 'booting') {
    if (bootState.phase === 'error') return 'Engine unavailable'
    if (bootState.detail.toLowerCase().includes('providers')) return 'Loading providers'
    if (bootState.detail.toLowerCase().includes('connect')) return 'Connecting engine'
    return 'Starting engine'
  }

  switch (status?.phase) {
    case 'transcribing':
      return 'Transcribing'
    case 'transforming':
      return 'Smart rewrite'
    case 'preparing_paste':
      return 'Preparing paste'
    default:
      return status?.phase_label || 'Processing'
  }
}

function getProcessingSubtitle(status: BackendStatus | null, bootState: BackendBootState, widgetState: WidgetState) {
  if (widgetState === 'booting') {
    if (bootState.detail.toLowerCase().includes('providers')) return 'Local models and providers'
    if (bootState.detail.toLowerCase().includes('connect')) return 'Waiting for local engine'
    return 'Local backend'
  }

  const host = compactHost(status?.captured_context?.url_host)
  const app = status?.captured_context?.app_name && status.captured_context.app_name !== 'Unknown'
    ? status.captured_context.app_name
    : null

  switch (status?.phase) {
    case 'transcribing':
      return host || app || 'Speech to text'
    case 'transforming':
      return host || app || 'Applying Smart Mode'
    case 'preparing_paste':
      return host || app || 'Sending text back'
    default:
      return host || app || bootState.detail
  }
}

export const FloatingWidget = () => {
  const [widgetState, setWidgetState] = useState<WidgetState>('booting')
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null)
  const [captureState, setCaptureState] = useState<CaptureState>(DEFAULT_CAPTURE_STATE)
  const [bootState, setBootState] = useState<BackendBootState>(DEFAULT_BOOT_STATE)
  const [amplitude, setAmplitude] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [isAccessibilityTrusted, setIsAccessibilityTrusted] = useState(true)
  const [presentationState, setPresentationState] = useState<PresentationState>('hidden')
  const [isHovered, setIsHovered] = useState(false)
  const [sheenCycle, setSheenCycle] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoRetractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bootStateRef = useRef<BackendBootState>(DEFAULT_BOOT_STATE)
  const captureStateRef = useRef<CaptureState>(DEFAULT_CAPTURE_STATE)
  const hideSourceRef = useRef<WidgetPresentationSource>('tray')
  const smoothedRef = useRef(0)
  const startupTimeRef = useRef(Date.now())
  const isFetchingRef = useRef(false)

  useEffect(() => {
    document.documentElement.dataset.surface = 'widget'
    document.body.dataset.surface = 'widget'

    return () => {
      delete document.documentElement.dataset.surface
      delete document.body.dataset.surface
    }
  }, [])

  const clearAutoRetractTimer = useCallback(() => {
    if (autoRetractTimerRef.current) {
      clearTimeout(autoRetractTimerRef.current)
      autoRetractTimerRef.current = null
    }
  }, [])

  const engageWidget = useCallback(() => {
    clearAutoRetractTimer()
  }, [clearAutoRetractTimer])

  const revealWidget = useCallback((source: WidgetPresentationSource) => {
    hideSourceRef.current = source
    clearAutoRetractTimer()
    setIsHovered(false)
    setSheenCycle((current) => current + 1)
    setPresentationState((current) => (
      current === 'hidden' || current === 'exiting'
        ? 'entering'
        : 'visible'
    ))
  }, [clearAutoRetractTimer])

  const beginHide = useCallback((source: WidgetPresentationSource) => {
    hideSourceRef.current = source
    clearAutoRetractTimer()
    setPresentationState((current) => (current === 'hidden' ? current : 'exiting'))
  }, [clearAutoRetractTimer])

  useEffect(() => {
    let mounted = true

    window.windowControls?.getBackendBootState?.().then((state) => {
      if (mounted && state) {
        bootStateRef.current = state
        setBootState(state)
      }
    })
    window.windowControls?.getCaptureState?.().then((state) => {
      if (mounted && state) {
        captureStateRef.current = state
        setCaptureState(state)
        if (state.is_recording) {
          smoothedRef.current = state.amplitude || 0
          setAmplitude(state.amplitude || 0)
        }
      }
    })
    const disposeBoot = window.windowControls?.onBackendBootState?.((state) => {
      if (mounted) {
        bootStateRef.current = state
        setBootState(state)
      }
    })
    const disposeCapture = window.windowControls?.onCaptureState?.((state) => {
      if (!mounted) return
      captureStateRef.current = state
      setCaptureState(state)

      if (state.is_recording) {
        smoothedRef.current = Math.max(state.amplitude || 0, smoothedRef.current * 0.6)
        setAmplitude(smoothedRef.current)
      } else {
        smoothedRef.current = 0
        setAmplitude(0)
      }

      if (state.error) {
        setLastError(state.error)
      }
    })

    const checkTCC = async () => {
      const trusted = await window.windowControls?.checkAccessibility?.()
      setIsAccessibilityTrusted(Boolean(trusted))
    }

    checkTCC()
    const tccInterval = setInterval(checkTCC, 2000)

    const disposePaste = window.windowControls?.onPasteError?.(() => {
      setLastError('Paste failed. Open Setup to confirm Accessibility is still allowed.')
    })

    const pollStatus = async () => {
      if (isFetchingRef.current) return
      isFetchingRef.current = true

      try {
        const res = await apiGet<BackendStatus>('/status', { timeout: 2000 })
        const status = res.data
        setBackendStatus(status)
        setLastError(status.last_error || null)

        if (status.pending_paste_text) {
          if (window.windowControls?.simulatePaste) {
            window.windowControls.simulatePaste(status.pending_paste_text)
          }
          await apiPost('/status/clear_paste')
        }

        const liveCaptureState = captureStateRef.current

        if (liveCaptureState.is_recording) {
          setWidgetState('recording')
          setLastError(liveCaptureState.error || null)
        } else if (status.missing_api_keys) {
          setWidgetState('error_nokey')
          setAmplitude(0)
          smoothedRef.current = 0
        } else if (
          status.phase === 'transcribing'
          || status.phase === 'transforming'
          || status.phase === 'preparing_paste'
        ) {
          setWidgetState('processing')
          setAmplitude(0)
          smoothedRef.current = 0
        } else {
          setWidgetState('idle')
          setAmplitude(0)
          smoothedRef.current = 0
        }
      } catch {
        setBackendStatus(null)
        if (Date.now() - startupTimeRef.current < 12000 || bootStateRef.current.phase === 'booting_backend') {
          setWidgetState('booting')
        } else {
          setWidgetState('disconnected')
        }
      } finally {
        isFetchingRef.current = false
      }
    }

    pollStatus()
    intervalRef.current = setInterval(pollStatus, 300)

    return () => {
      mounted = false
      if (intervalRef.current) clearInterval(intervalRef.current)
      clearInterval(tccInterval)
      disposeBoot?.()
      disposeCapture?.()
      disposePaste?.()
    }
  }, [clearAutoRetractTimer])

  useEffect(() => {
    const disposePresentation = window.windowControls?.onWidgetPresentationCommand?.((command) => {
      if (command.visible) {
        revealWidget(command.source)
      } else {
        beginHide(command.source)
      }
    })

    return () => {
      disposePresentation?.()
      clearAutoRetractTimer()
    }
  }, [beginHide, clearAutoRetractTimer, revealWidget])

  const triggerRecording = async (mode: RecordingMode) => {
    engageWidget()
    try {
      await window.windowControls?.toggleRecording?.(mode)
      setLastError(null)
    } catch {
      setLastError('Unable to reach the local backend. Open Setup and retry.')
    }
  }

  const showSettings = () => {
    engageWidget()
    window.windowControls?.showSettings?.()
  }

  const handleWidgetAction = (action: () => void, disabled = false) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return
    event.preventDefault()
    engageWidget()
    action()
  }

  const compactProcessingTitle = getProcessingTitle(backendStatus, bootState, widgetState)
  const compactProcessingSubtitle = getProcessingSubtitle(backendStatus, bootState, widgetState)
  const targetLabel = compactHost(backendStatus?.captured_context?.url_host)
    || (backendStatus?.captured_context?.app_name && backendStatus.captured_context.app_name !== 'Unknown'
      ? backendStatus.captured_context.app_name
      : null)

  const isRecording = widgetState === 'recording'
  const activeMode = isRecording
    ? captureState.mode === 'smart_transform' ? 'smart_transform' : 'dictation'
    : backendStatus?.active_mode
  const stateTone = widgetState === 'error_nokey'
    ? 'text-semantic-warning'
    : widgetState === 'disconnected'
      ? 'text-semantic-error'
      : 'text-accent-primary'

  const barMultipliers = [0.55, 0.85, 1, 0.82, 0.62]
  const minHeight = 3
  const maxHeight = 14
  const shouldRenderShell = presentationState !== 'hidden'
  const hasActiveContextWarning = Boolean(
    backendStatus?.context_warning && backendStatus?.active_mode === 'smart_transform'
  )
  const canAutoRetract = presentationState === 'visible'
    && widgetState === 'idle'
    && !isHovered
    && !lastError
    && isAccessibilityTrusted
    && !hasActiveContextWarning
  const contentKey = widgetState === 'recording'
    ? `recording-${activeMode || 'dictation'}`
    : widgetState === 'processing'
      ? `processing-${backendStatus?.phase || 'processing'}`
      : widgetState

  useEffect(() => {
    clearAutoRetractTimer()

    if (!canAutoRetract) return

    autoRetractTimerRef.current = setTimeout(() => {
      beginHide('idle')
    }, 2200)

    return clearAutoRetractTimer
  }, [beginHide, canAutoRetract, clearAutoRetractTimer])

  return (
    <div className="relative h-full w-full">
      {!isAccessibilityTrusted ? (
        <div className="absolute bottom-full mb-2 w-full">
          <button
            onClick={showSettings}
            className="titlebar-nodrag mx-auto flex w-[95%] items-start gap-3 rounded-2xl border border-semantic-warning/20 bg-[rgba(63,42,8,0.92)] px-3 py-3 text-left shadow-[0_12px_26px_rgba(0,0,0,0.25)]"
          >
            <WarningIcon size={16} className="mt-0.5 text-semantic-warning" />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-text-primary">Accessibility needed</div>
              <div className="mt-1 text-[11px] leading-5 text-text-secondary">Open Setup to finish Accessibility access so paste and hotkeys keep working.</div>
            </div>
          </button>
        </div>
      ) : null}

      {hasActiveContextWarning && widgetState !== 'recording' ? (
        <div className="absolute bottom-full mb-2 w-full">
          <button
            onClick={showSettings}
            className="titlebar-nodrag mx-auto flex w-[95%] items-start gap-3 rounded-2xl border border-semantic-warning/20 bg-[rgba(63,42,8,0.92)] px-3 py-3 text-left shadow-[0_12px_26px_rgba(0,0,0,0.25)]"
          >
            <WarningIcon size={16} className="mt-0.5 text-semantic-warning" />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-text-primary">Smart Mode fallback</div>
              <div className="mt-1 text-[11px] leading-5 text-text-secondary">{backendStatus?.context_warning}</div>
            </div>
          </button>
        </div>
      ) : null}

      {lastError && isAccessibilityTrusted ? (
        <div className="absolute bottom-full mb-2 w-full">
          <div className="mx-auto flex w-[90%] items-start gap-3 rounded-2xl border border-semantic-error/20 bg-[rgba(55,14,22,0.94)] px-3 py-2.5 text-left shadow-lg">
            <ErrorIcon size={16} className="mt-0.5 text-semantic-error" />
            <div className="truncate text-[11px] leading-5 text-text-secondary">{lastError}</div>
          </div>
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {shouldRenderShell ? (
          <motion.div
            className="titlebar-drag widget-shell relative flex h-full items-center justify-between overflow-hidden rounded-full px-3.5"
            initial="hidden"
            animate={presentationState === 'exiting' ? 'exit' : 'visible'}
            variants={SHELL_VARIANTS}
            style={{ transformOrigin: 'top center' }}
            onAnimationComplete={(definition) => {
              if (definition === 'visible' && presentationState === 'entering') {
                setPresentationState('visible')
              }

              if (definition === 'exit' && presentationState === 'exiting') {
                setPresentationState('hidden')
                window.windowControls?.completeWidgetHide?.(hideSourceRef.current)
              }
            }}
            onMouseEnter={() => {
              setIsHovered(true)
              engageWidget()
            }}
            onMouseLeave={() => setIsHovered(false)}
            onPointerDown={engageWidget}
          >
            <motion.div
              key={`sheen-${sheenCycle}`}
              className="pointer-events-none absolute inset-y-1 left-0 w-24 rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.14),transparent)] blur-sm"
              initial={{ x: '-140%', opacity: 0 }}
              animate={{ x: '480%', opacity: [0, 0.55, 0] }}
              transition={{ duration: 0.78, ease: 'easeOut', delay: 0.05 }}
            />
            <div className="pointer-events-none absolute inset-x-10 top-0 h-[30%] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.01),transparent)] opacity-55" />
            <div className="pointer-events-none absolute bottom-1 left-16 h-6 w-20 rounded-full bg-[radial-gradient(circle,rgba(18,222,230,0.05),transparent_72%)] blur-xl" />

            <div className="titlebar-nodrag min-w-0 flex-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={contentKey}
                  variants={CONTENT_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="min-w-0"
                >
                  {widgetState === 'booting' ? (
                    <BrandedProgressLoader
                      compact
                      title={compactProcessingTitle}
                      subtitle={compactProcessingSubtitle}
                      progress={bootState.progress}
                    />
                  ) : widgetState === 'processing' ? (
                    <BrandedProgressLoader
                      compact
                      title={compactProcessingTitle}
                      subtitle={compactProcessingSubtitle}
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      {isRecording ? (
                        <div className="flex h-4 items-center gap-[3px]">
                          {barMultipliers.map((multiplier, index) => {
                            const barHeight = minHeight + (maxHeight - minHeight) * Math.min(amplitude * 3, 1) * multiplier
                            return (
                              <div
                                key={index}
                                className={`w-[3px] rounded-full transition-[height] duration-150 ${
                                  activeMode === 'smart_transform' ? 'bg-accent-primary shadow-[0_0_8px_rgba(18,222,230,0.35)]' : 'bg-semantic-success'
                                }`}
                                style={{
                                  height: `${barHeight}px`,
                                  opacity: amplitude > 0.005 ? 1 : 0.35,
                                }}
                              />
                            )
                          })}
                        </div>
                      ) : (
                        <div className={`widget-control flex h-10 w-10 items-center justify-center rounded-full ${stateTone}`}>
                          {widgetState === 'error_nokey' ? <WarningIcon size={16} /> : widgetState === 'disconnected' ? <ErrorIcon size={16} /> : <CheckIcon size={16} />}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-medium tracking-[-0.01em] text-text-secondary">
                          {widgetState === 'error_nokey'
                            ? 'Keys required'
                            : widgetState === 'disconnected'
                              ? 'Offline'
                              : isRecording
                                ? activeMode === 'smart_transform'
                                  ? 'Smart Mode listening'
                                  : 'Dictation listening'
                                : 'Ready to dictate'}
                        </div>
                        <div className="truncate text-[13px] font-medium tracking-[-0.01em] text-text-primary">
                          {widgetState === 'error_nokey'
                            ? 'Add the required provider keys in Setup.'
                            : widgetState === 'disconnected'
                              ? 'The local engine is unavailable.'
                              : isRecording
                                ? targetLabel || 'Listening for speech'
                                : targetLabel
                                  ? `Target: ${targetLabel}`
                                  : 'Press Dict or Smart'}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="titlebar-nodrag relative z-10 ml-3 flex items-center gap-2">
              <button
                onPointerDown={handleWidgetAction(() => {
                  void triggerRecording('dictation')
                }, widgetState === 'disconnected' || widgetState === 'processing' || (isRecording && activeMode !== 'dictation'))}
                disabled={widgetState === 'disconnected' || widgetState === 'processing' || (isRecording && activeMode !== 'dictation')}
                className={`widget-pill inline-flex h-10 min-w-[88px] cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  isRecording && activeMode === 'dictation'
                    ? 'bg-[linear-gradient(180deg,rgba(27,145,87,0.28),rgba(14,72,43,0.18))] text-semantic-success'
                    : 'text-text-muted hover:bg-white/[0.09] hover:text-text-primary'
                }`}
                title="Pure Dictation — Ctrl+D / Cmd+D"
              >
                <MicIcon size={12} />
                {isRecording && activeMode === 'dictation' ? 'Stop' : 'Dict'}
              </button>

              <button
                onPointerDown={handleWidgetAction(() => {
                  void triggerRecording('smart_transform')
                }, widgetState === 'disconnected' || widgetState === 'processing' || (isRecording && activeMode !== 'smart_transform'))}
                disabled={widgetState === 'disconnected' || widgetState === 'processing' || (isRecording && activeMode !== 'smart_transform')}
                className={`widget-pill inline-flex h-10 min-w-[100px] cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  isRecording && activeMode === 'smart_transform'
                    ? 'bg-[linear-gradient(180deg,rgba(18,222,230,0.26),rgba(5,70,83,0.18))] text-accent-primary'
                    : 'text-text-muted hover:bg-white/[0.09] hover:text-text-primary'
                }`}
                title="Smart Transform — Ctrl+T / Cmd+T"
              >
                <SparkIcon size={12} />
                {isRecording && activeMode === 'smart_transform' ? 'Stop' : 'Smart'}
              </button>

              <button
                onPointerDown={handleWidgetAction(showSettings)}
                className="widget-icon-button flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-text-muted hover:bg-white/[0.08] hover:text-text-primary"
                title="Open Setup"
              >
                <SetupIcon size={13} />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
