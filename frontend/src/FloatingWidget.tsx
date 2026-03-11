import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { VscSettingsGear } from 'react-icons/vsc'

const API_BASE = 'http://127.0.0.1:8055'

type WidgetState = 'disconnected' | 'idle' | 'recording' | 'processing' | 'booting' | 'error_nokey'
type ActiveMode = 'dictation' | 'smart_transform' | null

export const FloatingWidget = () => {
    const [state, setState] = useState<WidgetState>('booting')
    const [activeMode, setActiveMode] = useState<ActiveMode>(null)
    const [amplitude, setAmplitude] = useState(0)
    const [lastError, setLastError] = useState<string | null>(null)
    const [isAccessibilityTrusted, setIsAccessibilityTrusted] = useState(true)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const smoothedRef = useRef(0)
    const startupTimeRef = useRef(Date.now())
    const isFetchingRef = useRef(false)

    useEffect(() => {
        const checkTCC = async () => {
            if (window.windowControls?.checkAccessibility) {
                const trusted = await window.windowControls.checkAccessibility()
                setIsAccessibilityTrusted(trusted)
            }
        }
        checkTCC()
        const tccInterval = setInterval(checkTCC, 2000)

        if (window.windowControls?.onPasteError) {
            window.windowControls.onPasteError(() => {
                setLastError('⚠️ Paste Failed (TCC Sandbox). Manually Cmd+V to paste.')
            })
        }

        const pollStatus = async () => {
            if (isFetchingRef.current) return
            isFetchingRef.current = true

            try {
                const res = await axios.get(`${API_BASE}/status`, { timeout: 2000 })
                // Update error state
                setLastError(res.data.last_error || null)

                // Check for pending paste
                if (res.data.pending_paste_text) {
                    if (window.windowControls?.simulatePaste) {
                        window.windowControls.simulatePaste(res.data.pending_paste_text)
                    }
                    await axios.post(`${API_BASE}/status/clear_paste`)
                }

                if (res.data.missing_api_keys) {
                    setState('error_nokey')
                    setActiveMode(null)
                    setAmplitude(0)
                    smoothedRef.current = 0
                } else if (res.data.is_recording) {
                    setState('recording')
                    setActiveMode(res.data.active_mode || 'dictation')
                    // Smooth the amplitude for organic feel (exponential decay)
                    const raw = res.data.audio_amplitude || 0
                    smoothedRef.current = Math.max(raw, smoothedRef.current * 0.6)
                    setAmplitude(smoothedRef.current)
                } else if (res.data.is_processing) {
                    setState('processing')
                    setAmplitude(0)
                    smoothedRef.current = 0
                } else {
                    setState('idle')
                    setActiveMode(null)
                    setAmplitude(0)
                    smoothedRef.current = 0
                }
            } catch {
                if (Date.now() - startupTimeRef.current < 10000) {
                    setState('booting')
                } else {
                    setState('disconnected')
                }
            } finally {
                isFetchingRef.current = false
            }
        }
        pollStatus()
        intervalRef.current = setInterval(pollStatus, 250)  // Polling every 250ms is fine for VU + paste check
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            clearInterval(tccInterval)
        }
    }, [])

    const handleOpenSettings = () => {
        window.windowControls?.showSettings()
    }

    const handlePromptPermissions = () => {
        window.windowControls?.promptAccessibility()
    }

    const toggleRecording = async (mode: 'dictation' | 'smart_transform') => {
        try {
            await axios.post(`${API_BASE}/recording/toggle`, { mode })
            setLastError(null) // Optimistically clear error on new action
        } catch (e) {
            console.error('Failed to toggle recording:', e)
        }
    }


    const stateConfig: Record<WidgetState, { label: string, color: string, glow: string }> = {
        disconnected: { label: 'Offline', color: 'bg-white/30', glow: '' },
        idle: { label: 'Ready', color: 'bg-semantic-success', glow: 'shadow-[0_0_8px_rgba(34,197,94,0.4)]' },
        recording: { label: activeMode === 'smart_transform' ? 'Smart' : 'Dict', color: 'bg-semantic-error', glow: 'shadow-[0_0_12px_rgba(239,68,68,0.5)]' },
        processing: { label: 'Processing', color: 'bg-semantic-warning', glow: 'shadow-[0_0_8px_rgba(245,158,11,0.4)]' },
        booting: { label: 'Starting Engine...', color: 'bg-semantic-warning', glow: 'shadow-[0_0_8px_rgba(245,158,11,0.4)] animate-pulse' },
        error_nokey: { label: 'KEY REQUIRED', color: 'bg-semantic-error', glow: 'shadow-[0_0_12px_rgba(239,68,68,0.5)] animate-pulse' },
    }

    const cfg = stateConfig[state]
    const isRecording = state === 'recording'

    // Generate bar heights from amplitude — each bar gets a slightly different height for organic look
    const barMultipliers = [0.6, 0.9, 1.0, 0.85, 0.7]
    const minHeight = 3  // px, silence
    const maxHeight = 14 // px, max loudness

    return (
        <div className="relative w-full h-full">
            {/* macOS Accessibility Permission Warning */}
            {!isAccessibilityTrusted && (
                <div className="absolute bottom-full mb-2 w-full animate-slide-up titlebar-nodrag z-50">
                    <div
                        onClick={handlePromptPermissions}
                        className="mx-auto w-[95%] bg-semantic-error/95 backdrop-blur-md border border-semantic-error/50 text-white text-[10px] px-3 py-2 rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.5)] text-center cursor-pointer hover:bg-semantic-error transition-colors"
                    >
                        <div className="font-bold mb-0.5">⚠️ Action Required</div>
                        <div>Accessibility Permission missing. Click to open Settings.</div>
                    </div>
                </div>
            )}

            {/* Error Toast positioned above widget */}
            {lastError && isAccessibilityTrusted && (
                <div className="absolute bottom-full mb-2 w-full animate-slide-up">
                    <div className="mx-auto w-[90%] bg-semantic-error/90 backdrop-blur-md border border-semantic-error/30 text-white text-[10px] px-3 py-1.5 rounded-lg shadow-lg text-center truncate pointer-events-none">
                        ⚠️ {lastError}
                    </div>
                </div>
            )}

            <div className="w-full h-full flex items-center justify-between px-3 bg-bg-app-base/95 backdrop-blur-xl rounded-full titlebar-drag">
                {/* Status + VU Meter */}
                <div className="flex items-center gap-2 titlebar-nodrag">
                    {isRecording ? (
                        <div className="flex items-center gap-[2px] h-4">
                            {barMultipliers.map((mult, i) => {
                                const barHeight = minHeight + (maxHeight - minHeight) * Math.min(amplitude * 3, 1) * mult
                                return (
                                    <div
                                        key={i}
                                        className={`w-[3px] rounded-full ${activeMode === 'smart_transform' ? 'bg-accent-primary' : 'bg-semantic-error'}`}
                                        style={{
                                            height: `${barHeight}px`,
                                            transition: 'height 120ms ease-out',
                                            opacity: amplitude > 0.005 ? 1 : 0.3,
                                        }}
                                    />
                                )
                            })}
                        </div>
                    ) : (
                        <div className={`w-2 h-2 rounded-full transition-all duration-500 ${cfg.color} ${cfg.glow} ${state === 'processing' ? 'animate-subtle-pulse' : ''}`} />
                    )}
                    <span className="text-[11px] font-medium tracking-wide text-text-secondary">
                        {cfg.label}
                    </span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5 titlebar-nodrag">
                    {/* Dictation Button */}
                    <button
                        onClick={() => toggleRecording('dictation')}
                        disabled={state === 'disconnected' || state === 'processing' || (isRecording && activeMode !== 'dictation')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold tracking-wider uppercase transition-all duration-200 border
                            ${isRecording && activeMode === 'dictation'
                                ? 'bg-semantic-error/20 text-semantic-error border-semantic-error/40 animate-subtle-pulse'
                                : 'bg-white/5 text-text-muted border-white/8 hover:bg-white/10 hover:text-white disabled:opacity-30'
                            }`}
                        title="Pure dictation — Ctrl+D"
                    >
                        {isRecording && activeMode === 'dictation' ? '■ Stop' : '● Dict (^D)'}
                    </button>

                    {/* Smart Transform Button */}
                    <button
                        onClick={() => toggleRecording('smart_transform')}
                        disabled={state === 'disconnected' || state === 'processing' || (isRecording && activeMode !== 'smart_transform')}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold tracking-wider uppercase transition-all duration-200 border
                            ${isRecording && activeMode === 'smart_transform'
                                ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/40 animate-subtle-pulse'
                                : 'bg-white/5 text-text-muted border-white/8 hover:bg-white/10 hover:text-white disabled:opacity-30'
                            }`}
                        title="Smart transform — Ctrl+T"
                    >
                        {isRecording && activeMode === 'smart_transform' ? '■ Stop' : '✦ Smart (^T)'}
                    </button>

                    {/* Settings */}
                    <button
                        onClick={handleOpenSettings}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-text-muted hover:bg-white/10 hover:text-white transition-all duration-200"
                        title="Settings"
                    >
                        <VscSettingsGear size={12} />
                    </button>
                </div>
            </div>
        </div>
    )
}
