import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { VscCheck, VscError, VscRefresh, VscShield, VscSettingsGear } from 'react-icons/vsc'

const API_BASE = 'http://127.0.0.1:8055'

type ConnectionState = 'connecting' | 'connected' | 'error'

interface ProviderModels {
    llm: Record<string, { id: string; name: string }[]>
    stt: Record<string, { id: string; name: string }[]>
}

type KeyStatusMap = Record<string, boolean>

const PROVIDERS = {
    llm: [
        { id: 'groq', name: 'Groq', desc: 'Fastest inference' },
        { id: 'openai', name: 'OpenAI', desc: 'GPT models' },
        { id: 'anthropic', name: 'Anthropic', desc: 'Claude models' },
    ],
    stt: [
        { id: 'groq', name: 'Groq', desc: 'Whisper on Groq' },
        { id: 'openai', name: 'OpenAI', desc: 'OpenAI Whisper' },
        { id: 'deepgram', name: 'Deepgram', desc: 'Nova models' },
    ]
}

export const SettingsView = () => {
    const [config, setConfig] = useState<any>(null)
    const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [retryCount, setRetryCount] = useState(0)
    const [providerModels, setProviderModels] = useState<ProviderModels | null>(null)
    const [audioDevices, setAudioDevices] = useState<{ id: number; name: string; channels: number }[]>([])

    const [apiKey, setApiKey] = useState('')
    const [apiProvider, setApiProvider] = useState('groq')
    const [keyStatus, setKeyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
    const [keysSet, setKeysSet] = useState<KeyStatusMap>({})

    // Debug Mode Test State
    const [testRecording, setTestRecording] = useState(false)
    const [testResult, setTestResult] = useState<{ transcript?: string; time?: number; error?: string } | null>(null)
    const [refreshingDevices, setRefreshingDevices] = useState(false)

    // Track if user has manually changed the model to prevent auto-sync overwriting
    const userModifiedRef = useRef(false)
    const initialLoadRef = useRef(true)
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const fetchConfig = useCallback(async (attempt = 0) => {
        setConnectionState('connecting')
        try {
            const [configRes, modelsRes, keysRes, devicesRes] = await Promise.all([
                axios.get(`${API_BASE}/config`, { timeout: 30000 }),
                axios.get(`${API_BASE}/providers/models`, { timeout: 30000 }),
                axios.get(`${API_BASE}/secrets/check`, { timeout: 30000 }),
                axios.get(`${API_BASE}/audio/devices`, { timeout: 30000 })
            ])
            setConfig(configRes.data)
            setProviderModels(modelsRes.data)
            setKeysSet(keysRes.data)
            setAudioDevices(devicesRes.data.devices || [])
            setConnectionState('connected')
            setRetryCount(0)
            userModifiedRef.current = false
        } catch {
            if (attempt < 5) {
                const delay = Math.pow(2, attempt) * 1000
                setTimeout(() => {
                    setRetryCount(attempt + 1)
                    fetchConfig(attempt + 1)
                }, delay)
            } else {
                setConnectionState('error')
            }
        }
    }, [])

    useEffect(() => { fetchConfig() }, [fetchConfig])

    const saveConfig = async (configToSave = config) => {
        setSaving(true)
        try {
            const res = await axios.post(`${API_BASE}/config`, configToSave)
            if (res.data?.config) {
                // By updating silently without triggering the effect again, we prevent infinite loops
                initialLoadRef.current = true
                setConfig(res.data.config)
                userModifiedRef.current = false
            }
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } catch (err) {
            console.error("Failed to save config:", err)
        } finally {
            setTimeout(() => setSaving(false), 400)
        }
    }

    // Auto-save debounce effect
    useEffect(() => {
        if (!config) return
        if (initialLoadRef.current) {
            initialLoadRef.current = false
            return
        }
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(() => {
            saveConfig(config)
        }, 1500)
    }, [config])

    const saveApiKey = async () => {
        setKeyStatus('saving')
        try {
            await axios.post(`${API_BASE}/secrets`, { provider: apiProvider, key: apiKey })
            setKeyStatus('success')
            setApiKey('')
            setKeysSet(prev => ({ ...prev, [apiProvider]: true }))
            // Refresh model lists since the new key may unlock live model discovery
            try {
                const modelsRes = await axios.get(`${API_BASE}/providers/models`, { timeout: 10000 })
                setProviderModels(modelsRes.data)
            } catch { /* ignore */ }
            setTimeout(() => setKeyStatus('idle'), 3000)
        } catch {
            setKeyStatus('error')
            setTimeout(() => setKeyStatus('idle'), 3000)
        }
    }

    const switchProvider = (section: 'llm' | 'stt', newProvider: string) => {
        const models = section === 'llm'
            ? providerModels?.llm?.[newProvider] || []
            : providerModels?.stt?.[newProvider] || []
        const firstModel = models[0]?.id || ''
        userModifiedRef.current = true
        if (section === 'llm') {
            setConfig({ ...config, llm: { ...config.llm, provider: newProvider, model: firstModel } })
        } else {
            setConfig({ ...config, stt: { ...config.stt, provider: newProvider, model: firstModel } })
        }
    }

    const refreshDevices = async () => {
        setRefreshingDevices(true)
        try {
            const res = await axios.get(`${API_BASE}/audio/devices?refresh=true`, { timeout: 3000 })
            setAudioDevices(res.data.devices || [])
        } catch (e) {
            console.error('Failed to refresh audio devices:', e)
        } finally {
            setTimeout(() => setRefreshingDevices(false), 400)
        }
    }

    const startTestRecording = async () => {
        try {
            await axios.post(`${API_BASE}/audio/test/start`)
            setTestRecording(true)
            setTestResult(null)
        } catch (e: any) {
            setTestResult({ error: e.response?.data?.message || 'Failed to start recording' })
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
        } catch (e: any) {
            setTestResult({ error: e.response?.data?.message || 'Failed to process audio' })
        }
    }

    // --- Connection States ---
    if (connectionState === 'connecting') {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-5">
                <div className="w-10 h-10 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin-smooth" />
                <div className="text-center">
                    <p className="text-text-primary text-sm font-medium">Connecting to Engine</p>
                    <p className="text-text-muted text-xs mt-1">
                        {retryCount > 0 ? `Attempt ${retryCount} of 5...` : 'Initializing backend...'}
                    </p>
                </div>
            </div>
        )
    }

    if (connectionState === 'error') {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-5">
                <div className="w-14 h-14 rounded-2xl bg-semantic-error/10 flex items-center justify-center">
                    <VscError size={28} className="text-semantic-error" />
                </div>
                <div className="text-center">
                    <p className="text-white font-semibold text-base">Backend Unreachable</p>
                    <p className="text-text-secondary text-sm mt-1 max-w-xs">
                        Could not connect to <code className="bg-white/5 px-1.5 py-0.5 rounded text-xs font-mono text-accent-primary">localhost:8055</code>
                    </p>
                </div>

                <div className="mt-2 bg-white/5 border border-white/10 p-4 rounded-xl text-left max-w-[300px] w-full">
                    <h3 className="text-white text-xs font-semibold mb-2 flex items-center gap-1.5">
                        <VscSettingsGear className="text-text-secondary" /> Troubleshooting
                    </h3>
                    <ul className="text-text-muted text-[11px] space-y-2 list-disc pl-4">
                        <li>Ensure port <b>8055</b> is available.</li>
                        <li>Check backend logs for errors:<br />
                            <code className="text-[10px] break-all bg-black/40 px-1 py-0.5 mt-1 block rounded font-mono select-all">~/.truhandsfree/logs/app.log</code>
                        </li>
                        <li>Check application logs for spawn errors:<br />
                            <code className="text-[10px] break-all bg-black/40 px-1 py-0.5 mt-1 block rounded font-mono select-all">~/.truhandsfree/logs/electron.log</code>
                        </li>
                    </ul>
                </div>

                <button
                    onClick={() => fetchConfig(0)}
                    className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 transition-all px-5 py-2.5 rounded-xl font-medium text-white text-sm mt-2"
                >
                    <VscRefresh size={14} /> Retry
                </button>
            </div>
        )
    }

    if (!config) return null

    const llmModels = providerModels?.llm?.[config.llm.provider] || []
    const sttModels = providerModels?.stt?.[config.stt.provider] || []

    // Get the model value to display — keep user's selection, only add it as an option if not in list
    const llmModelInList = llmModels.some((m: any) => m.id === config.llm.model)
    const sttModelInList = sttModels.some((m: any) => m.id === config.stt.model)

    return (
        <div className="p-8 pb-32 max-w-2xl animate-fade-in-up overflow-y-auto h-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
                    <p className="text-sm text-text-secondary mt-0.5">Configure your AI engine.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-semantic-success/10 border border-semantic-success/20">
                        <div className="w-1.5 h-1.5 bg-semantic-success rounded-full" />
                        <span className="text-[11px] font-medium text-semantic-success">Connected</span>
                    </div>
                    <button
                        onClick={saveConfig}
                        disabled={saving}
                        className={`relative px-5 py-2 rounded-xl font-medium text-sm text-white transition-all duration-300 min-w-[140px]
                            ${saved
                                ? 'bg-semantic-success/20 border border-semantic-success/30'
                                : 'bg-accent-primary hover:bg-accent-primary/80 shadow-lg shadow-accent-primary/20 hover:shadow-accent-primary/30 hover:-translate-y-0.5'
                            } disabled:opacity-50`}
                    >
                        {saved ? (
                            <span className="flex items-center justify-center gap-1.5">
                                <VscCheck size={16} className="text-semantic-success" /> Saved
                            </span>
                        ) : saving ? (
                            <span className="flex items-center justify-center gap-2">
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin-smooth" />
                                Saving
                            </span>
                        ) : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* --- API Keys --- */}
            <section className="mb-8 glass-card p-6 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
                <div className="flex items-center gap-2 mb-5">
                    <VscShield size={14} className="text-accent-primary" />
                    <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">API Keys</h2>
                    <span className="text-[10px] text-text-muted ml-auto flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="opacity-50"><path d="M8 1a5 5 0 0 0-5 5v2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2V6a5 5 0 0 0-5-5zm3 7H5V6a3 3 0 1 1 6 0v2z" fill="currentColor" /></svg>
                        macOS Keychain
                    </span>
                </div>

                {/* Premium key status grid */}
                <div className="grid grid-cols-4 gap-2 mb-5">
                    {['groq', 'openai', 'anthropic', 'deepgram'].map(p => (
                        <button
                            key={p}
                            onClick={() => setApiProvider(p)}
                            className={`relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all duration-200
                                ${apiProvider === p
                                    ? 'border-accent-primary/40 bg-accent-primary/5 shadow-sm shadow-accent-primary/10'
                                    : 'border-white/5 bg-white/[0.02] hover:bg-white/5'
                                }`}
                        >
                            <span className="text-xs font-medium text-white">{p.charAt(0).toUpperCase() + p.slice(1)}</span>
                            {keysSet[p] ? (
                                <span className="flex items-center gap-1 text-[10px] text-semantic-success font-medium">
                                    <VscCheck size={10} /> Active
                                </span>
                            ) : (
                                <span className="text-[10px] text-text-muted">Not set</span>
                            )}
                            {keysSet[p] && (
                                <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-semantic-success shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                            )}
                        </button>
                    ))}
                </div>

                <div className="flex gap-3 items-end">
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-text-muted mb-2">
                            {apiProvider.charAt(0).toUpperCase() + apiProvider.slice(1)} API Key
                        </label>
                        <div className="relative">
                            <input
                                type="password"
                                placeholder={keysSet[apiProvider] ? '••••••••••••••••••••' : 'Paste your API key'}
                                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/40 transition-all font-mono
                                    ${keysSet[apiProvider] && !apiKey
                                        ? 'bg-semantic-success/5 border-semantic-success/15'
                                        : 'bg-black/30 border-white/8'
                                    }`}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                            {keysSet[apiProvider] && !apiKey && (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-semantic-success/70 pointer-events-none">
                                    <VscCheck size={10} /> Stored
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={saveApiKey}
                        disabled={!apiKey || keyStatus === 'saving'}
                        className={`px-5 py-2.5 rounded-xl font-medium text-sm min-w-[100px] transition-all duration-300
                            ${keyStatus === 'success'
                                ? 'bg-semantic-success/20 border border-semantic-success/30 text-semantic-success'
                                : keyStatus === 'error'
                                    ? 'bg-semantic-error/20 border border-semantic-error/30 text-semantic-error'
                                    : keyStatus === 'saving'
                                        ? 'bg-white/5 border border-white/10 text-text-muted'
                                        : 'bg-accent-primary/10 border border-accent-primary/30 text-accent-primary hover:bg-accent-primary/20 disabled:opacity-30'
                            }`}
                    >
                        {keyStatus === 'success' ? <span className="flex items-center justify-center gap-1"><VscCheck size={14} /> Saved</span> :
                            keyStatus === 'error' ? <VscError size={18} /> :
                                keyStatus === 'saving' ? <div className="w-4 h-4 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin-smooth mx-auto" /> :
                                    keysSet[apiProvider] ? 'Update' : 'Save'}
                    </button>
                </div>
            </section>

            {/* --- Intelligence Engine --- */}
            <section className="mb-8 glass-card p-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-5">Intelligence Engine</h2>

                <div className="space-y-5">
                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-2">AI Provider</label>
                        <div className="flex bg-black/30 rounded-xl p-1 border border-white/5">
                            {PROVIDERS.llm.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => switchProvider('llm', p.id)}
                                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 relative
                                        ${config.llm.provider === p.id
                                            ? 'bg-white/10 text-white shadow-sm'
                                            : 'text-text-muted hover:text-text-secondary'
                                        }`}
                                >
                                    <div className="flex items-center justify-center gap-1.5">
                                        {p.name}
                                        {keysSet[p.id] && <div className="w-1.5 h-1.5 rounded-full bg-semantic-success" />}
                                    </div>
                                    <div className="text-[10px] opacity-60 mt-0.5">{p.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-2">Model</label>
                        <select
                            className="w-full bg-black/30 border border-white/8 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/40 focus:border-accent-primary/40 transition-all font-mono"
                            value={config.llm.model}
                            onChange={(e) => {
                                userModifiedRef.current = true
                                setConfig({ ...config, llm: { ...config.llm, model: e.target.value } })
                            }}
                        >
                            {!llmModelInList && config.llm.model && (
                                <option value={config.llm.model}>{config.llm.model} (current)</option>
                            )}
                            {llmModels.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>
                </div>
            </section>

            {/* --- Speech Recognition --- */}
            <section className="mb-8 glass-card p-6 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-5">Speech Recognition</h2>

                <div className="space-y-5">
                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-2">STT Provider</label>
                        <div className="flex bg-black/30 rounded-xl p-1 border border-white/5">
                            {PROVIDERS.stt.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => switchProvider('stt', p.id)}
                                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 relative
                                        ${config.stt.provider === p.id
                                            ? 'bg-white/10 text-white shadow-sm'
                                            : 'text-text-muted hover:text-text-secondary'
                                        }`}
                                >
                                    <div className="flex items-center justify-center gap-1.5">
                                        {p.name}
                                        {keysSet[p.id] && <div className="w-1.5 h-1.5 rounded-full bg-semantic-success" />}
                                    </div>
                                    <div className="text-[10px] opacity-60 mt-0.5">{p.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-2">Model</label>
                        <select
                            className="w-full bg-black/30 border border-white/8 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/40 focus:border-accent-primary/40 transition-all font-mono"
                            value={config.stt.model}
                            onChange={(e) => {
                                userModifiedRef.current = true
                                setConfig({ ...config, stt: { ...config.stt, model: e.target.value } })
                            }}
                        >
                            {!sttModelInList && config.stt.model && (
                                <option value={config.stt.model}>{config.stt.model} (current)</option>
                            )}
                            {sttModels.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-text-muted">Input Device</label>
                            <button
                                onClick={refreshDevices}
                                className={`flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-primary transition-all px-2 py-0.5 rounded-md hover:bg-white/5 ${refreshingDevices ? 'animate-spin-smooth pointer-events-none' : ''}`}
                                title="Refresh device list (connect a new mic first)"
                            >
                                <VscRefresh size={12} className={refreshingDevices ? 'animate-spin' : ''} />
                                {!refreshingDevices && 'Refresh'}
                            </button>
                        </div>
                        <select
                            className="w-full bg-black/30 border border-white/8 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/40 focus:border-accent-primary/40 transition-all font-mono"
                            value={config.audio?.input_device || ""}
                            onChange={(e) => {
                                const val = e.target.value === "" ? null : e.target.value
                                setConfig({ ...config, audio: { ...config.audio, input_device: val } })
                            }}
                        >
                            <option value="">System Default</option>
                            {audioDevices.map(d => (
                                <option key={d.name} value={d.name}>{d.name} ({d.channels} channels)</option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>

            {/* --- Hotkeys --- */}
            <section className="glass-card p-6 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-5">Hotkeys</h2>
                <div className="space-y-5">
                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-2">Pure Dictation</label>
                        <input
                            type="text"
                            className="w-full max-w-xs bg-black/30 border border-white/8 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/40 transition-all font-mono"
                            value={config.hotkeys.trigger_dictation}
                            onChange={(e) => setConfig({ ...config, hotkeys: { ...config.hotkeys, trigger_dictation: e.target.value } })}
                        />
                        <p className="text-xs text-text-muted mt-1.5">
                            <kbd className="bg-black/30 px-1.5 py-0.5 rounded text-semantic-error/80 font-mono text-[11px]">^D</kbd> — Records speech and pastes raw transcript. No LLM processing.
                        </p>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-text-muted mb-2">Smart Transform</label>
                        <input
                            type="text"
                            className="w-full max-w-xs bg-black/30 border border-white/8 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/40 transition-all font-mono"
                            value={config.hotkeys.trigger_smart_agent}
                            onChange={(e) => setConfig({ ...config, hotkeys: { ...config.hotkeys, trigger_smart_agent: e.target.value } })}
                        />
                        <p className="text-xs text-text-muted mt-1.5">
                            <kbd className="bg-black/30 px-1.5 py-0.5 rounded text-accent-primary/80 font-mono text-[11px]">^T</kbd> — Records speech, processes via LLM agent with context awareness, then pastes.
                        </p>
                    </div>
                    <p className="text-[11px] text-text-muted/60 border-t border-white/5 pt-3">
                        Requires <strong className="text-text-secondary">Accessibility</strong> permission in System Settings → Privacy & Security.
                    </p>
                </div>
            </section>

            {/* --- Debug Mode --- */}
            <section className="glass-card p-6 border-accent-tertiary/20 animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-sm font-semibold text-accent-tertiary uppercase tracking-wider">Debug STT Mode</h2>
                </div>
                <div className="space-y-4">
                    <p className="text-xs text-text-muted">
                        Test your microphone and STT model without triggering the OS paste pipeline.
                    </p>

                    <button
                        onClick={testRecording ? stopTestRecording : startTestRecording}
                        className={`w-full py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center justify-center gap-2
                            ${testRecording
                                ? 'bg-semantic-error/20 text-semantic-error border border-semantic-error/30 animate-pulse'
                                : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'}`}
                    >
                        {testRecording ? (
                            <>
                                <div className="w-2 h-2 rounded-full bg-semantic-error" />
                                Stop & Transcribe
                            </>
                        ) : 'Start Test Recording'}
                    </button>

                    {testResult && (
                        <div className="mt-4 bg-black/40 border border-white/5 rounded-xl p-4 font-mono text-[11px] overflow-x-auto">
                            {testResult.error ? (
                                <div className="text-semantic-error whitespace-pre-wrap">Error: {testResult.error}</div>
                            ) : (
                                <div className="space-y-2 text-text-secondary">
                                    <div className="flex justify-between text-text-muted border-b border-white/5 pb-2 mb-2">
                                        <span>Result</span>
                                        <span>{testResult.time}s processing</span>
                                    </div>
                                    <div className="whitespace-pre-wrap text-white/90">
                                        {testResult.transcript || '<empty transcript>'}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>
        </div>
    )
}
