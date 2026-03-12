import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

import { BrandedProgressLoader } from './components/BrandedProgressLoader'
import { CheckIcon, ErrorIcon, MicIcon, SetupIcon, SparkIcon, WarningIcon } from './components/BrandIcons'
import type { BackendBootState, BackendStatus, RecordingMode } from './types'

const API_BASE = 'http://127.0.0.1:8055'

type WidgetState = 'disconnected' | 'idle' | 'recording' | 'processing' | 'booting' | 'error_nokey'

const DEFAULT_BOOT_STATE: BackendBootState = {
  phase: 'booting_backend',
  label: 'Preparing TruHandsFree',
  detail: 'Checking the local engine.',
  progress: 20,
}

export const FloatingWidget = () => {
  const [widgetState, setWidgetState] = useState<WidgetState>('booting')
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null)
  const [bootState, setBootState] = useState<BackendBootState>(DEFAULT_BOOT_STATE)
  const [amplitude, setAmplitude] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [isAccessibilityTrusted, setIsAccessibilityTrusted] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bootStateRef = useRef<BackendBootState>(DEFAULT_BOOT_STATE)
  const smoothedRef = useRef(0)
  const startupTimeRef = useRef(Date.now())
  const isFetchingRef = useRef(false)

  useEffect(() => {
    let mounted = true

    window.windowControls?.getBackendBootState?.().then((state) => {
      if (mounted && state) {
        bootStateRef.current = state
        setBootState(state)
      }
    })
    const disposeBoot = window.windowControls?.onBackendBootState?.((state) => {
      if (mounted) {
        bootStateRef.current = state
        setBootState(state)
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
        const res = await axios.get<BackendStatus>(`${API_BASE}/status`, { timeout: 2000 })
        const status = res.data
        setBackendStatus(status)
        setLastError(status.last_error || null)

        if (status.pending_paste_text) {
          if (window.windowControls?.simulatePaste) {
            window.windowControls.simulatePaste(status.pending_paste_text)
          }
          await axios.post(`${API_BASE}/status/clear_paste`)
        }

        if (status.missing_api_keys) {
          setWidgetState('error_nokey')
          setAmplitude(0)
          smoothedRef.current = 0
        } else if (status.is_recording) {
          setWidgetState('recording')
          const raw = status.audio_amplitude || 0
          smoothedRef.current = Math.max(raw, smoothedRef.current * 0.6)
          setAmplitude(smoothedRef.current)
        } else if (status.phase === 'transcribing' || status.phase === 'transforming' || status.phase === 'preparing_paste') {
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
      disposePaste?.()
    }
  }, [])

  const toggleRecording = async (mode: RecordingMode) => {
    try {
      await window.windowControls?.toggleRecording?.(mode)
      setLastError(null)
    } catch {
      setLastError('Unable to reach the local backend. Open Setup and retry.')
    }
  }

  const contextSubtitle = backendStatus?.captured_context?.url_host
    ? `${backendStatus.captured_context.app_name} • ${backendStatus.captured_context.url_host}`
    : backendStatus?.captured_context?.app_name && backendStatus.captured_context.app_name !== 'Unknown'
      ? backendStatus.captured_context.app_name
      : bootState.detail

  const isRecording = widgetState === 'recording'
  const activeMode = backendStatus?.active_mode
  const stateTone = widgetState === 'error_nokey'
    ? 'text-semantic-warning'
    : widgetState === 'disconnected'
      ? 'text-semantic-error'
      : 'text-accent-primary'

  const barMultipliers = [0.55, 0.85, 1, 0.82, 0.62]
  const minHeight = 3
  const maxHeight = 14

  return (
    <div className="relative h-full w-full">
      {!isAccessibilityTrusted ? (
        <div className="absolute bottom-full mb-2 w-full">
          <button
            onClick={() => window.windowControls?.showSettings?.()}
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

      {backendStatus?.context_warning && widgetState !== 'recording' ? (
        <div className="absolute bottom-full mb-2 w-full">
          <button
            onClick={() => window.windowControls?.showSettings?.()}
            className="titlebar-nodrag mx-auto flex w-[95%] items-start gap-3 rounded-2xl border border-semantic-warning/20 bg-[rgba(63,42,8,0.92)] px-3 py-3 text-left shadow-[0_12px_26px_rgba(0,0,0,0.25)]"
          >
            <WarningIcon size={16} className="mt-0.5 text-semantic-warning" />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-text-primary">Smart Mode fallback</div>
              <div className="mt-1 text-[11px] leading-5 text-text-secondary">{backendStatus.context_warning}</div>
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

      <div className="titlebar-drag flex h-full items-center justify-between rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(7,20,31,0.96),rgba(3,11,18,0.94))] px-3 shadow-[0_18px_40px_rgba(0,0,0,0.32)]">
        <div className="titlebar-nodrag min-w-0 flex-1">
          {widgetState === 'booting' ? (
            <BrandedProgressLoader
              compact
              title={bootState.label}
              subtitle={bootState.detail}
              progress={bootState.progress}
            />
          ) : widgetState === 'processing' ? (
            <BrandedProgressLoader
              compact
              title={backendStatus?.phase_label || 'Preparing Smart Mode'}
              subtitle={contextSubtitle}
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
                <div className={`flex h-9 w-9 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] ${stateTone}`}>
                  {widgetState === 'error_nokey' ? <WarningIcon size={16} /> : widgetState === 'disconnected' ? <ErrorIcon size={16} /> : <CheckIcon size={16} />}
                </div>
              )}

              <div className="min-w-0">
                <div className="truncate text-xs font-semibold uppercase tracking-[0.26em] text-text-secondary">
                  {widgetState === 'error_nokey'
                    ? 'Keys required'
                    : widgetState === 'disconnected'
                      ? 'Offline'
                      : isRecording
                        ? activeMode === 'smart_transform'
                          ? 'Smart Mode listening'
                          : 'Dictation listening'
                        : 'Ready'}
                </div>
                <div className="truncate text-sm text-text-primary">
                  {widgetState === 'error_nokey'
                    ? 'Add the required provider keys in Setup.'
                    : widgetState === 'disconnected'
                      ? 'The local engine is unavailable.'
                      : isRecording
                        ? contextSubtitle
                        : backendStatus?.captured_context?.app_name && backendStatus.captured_context.app_name !== 'Unknown'
                          ? `Target: ${backendStatus.captured_context.app_name}`
                          : 'Trigger dictation or Smart Mode from anywhere.'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="titlebar-nodrag ml-3 flex items-center gap-1.5">
          <button
            onClick={() => toggleRecording('dictation')}
            disabled={widgetState === 'disconnected' || widgetState === 'processing' || (isRecording && activeMode !== 'dictation')}
            className={`inline-flex items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
              isRecording && activeMode === 'dictation'
                ? 'border-semantic-success/20 bg-semantic-success/12 text-semantic-success'
                : 'border-white/8 bg-white/[0.03] text-text-muted hover:bg-white/[0.06] hover:text-text-primary'
            }`}
            title="Pure Dictation — Ctrl+D / Cmd+D"
          >
            <MicIcon size={12} />
            {isRecording && activeMode === 'dictation' ? 'Stop' : 'Dict'}
          </button>

          <button
            onClick={() => toggleRecording('smart_transform')}
            disabled={widgetState === 'disconnected' || widgetState === 'processing' || (isRecording && activeMode !== 'smart_transform')}
            className={`inline-flex items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
              isRecording && activeMode === 'smart_transform'
                ? 'border-accent-primary/20 bg-accent-primary/12 text-accent-primary'
                : 'border-white/8 bg-white/[0.03] text-text-muted hover:bg-white/[0.06] hover:text-text-primary'
            }`}
            title="Smart Transform — Ctrl+T / Cmd+T"
          >
            <SparkIcon size={12} />
            {isRecording && activeMode === 'smart_transform' ? 'Stop' : 'Smart'}
          </button>

          <button
            onClick={() => window.windowControls?.showSettings?.()}
            className="flex h-8 w-8 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-text-muted transition-all hover:bg-white/[0.06] hover:text-text-primary"
            title="Open Setup"
          >
            <SetupIcon size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
