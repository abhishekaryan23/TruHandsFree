import { useState, useEffect } from 'react'
import axios from 'axios'
import { VscAdd, VscSave, VscTrash } from 'react-icons/vsc'

const API_BASE = 'http://127.0.0.1:8055'

export const SkillsManager = () => {
    const [skills, setSkills] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // New Skill Form State
    const [isCreating, setIsCreating] = useState(false)
    const [newId, setNewId] = useState('')
    const [newName, setNewName] = useState('')
    const [newPrompt, setNewPrompt] = useState('')

    useEffect(() => {
        fetchSkills()
    }, [])

    const fetchSkills = async () => {
        try {
            const res = await axios.get(`${API_BASE}/skills`)
            setSkills(res.data.skills)
        } catch (err) {
            console.error("Failed to load skills:", err)
        } finally {
            setLoading(false)
        }
    }

    const saveNewSkill = async () => {
        if (!newId || !newName || !newPrompt) return

        try {
            await axios.post(`${API_BASE}/skills`, {
                id: newId,
                name: newName,
                prompt: newPrompt
            })
            setIsCreating(false)
            setNewId('')
            setNewName('')
            setNewPrompt('')
            fetchSkills() // Refresh list
        } catch (err) {
            console.error("Failed to add skill:", err)
            alert("Failed to add skill. ID might already exist.")
        }
    }

    const deleteSkill = async (skillId: string, skillName: string) => {
        if (!confirm(`Delete skill "${skillName}"?`)) return
        try {
            await axios.delete(`${API_BASE}/skills/${skillId}`)
            fetchSkills()
        } catch (err) {
            console.error("Failed to delete skill:", err)
            alert("Failed to delete skill.")
        }
    }

    if (loading) return <div className="p-8 text-text-muted">Loading skills...</div>

    return (
        <div className="p-8 pb-32 max-w-4xl">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-semibold mb-1 tracking-tight text-white">Skills Registry</h1>
                    <p className="text-sm text-text-secondary">Manage the dynamic system prompts backing your application.</p>
                </div>
                {!isCreating && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 transition-all px-4 py-2 rounded-lg font-medium text-white shadow-lg"
                    >
                        <VscAdd /> Add Custom Skill
                    </button>
                )}
            </div>

            {/* --- Create Skill Form --- */}
            {isCreating && (
                <section className="mb-8 glass-card border border-accent-primary/50 !bg-accent-primary/5 p-6 animate-in slide-in-from-top-4 fade-in duration-200">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-medium text-white">New Skill</h2>
                        <button onClick={() => setIsCreating(false)} className="text-text-muted hover:text-white transition-colors">Cancel</button>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Unique ID</label>
                            <input
                                type="text"
                                placeholder="e.g., git_commit_gen"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/50 font-mono"
                                value={newId}
                                onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Display Name</label>
                            <input
                                type="text"
                                placeholder="e.g., Git Commit Generator"
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">System Instructions (Prompt)</label>
                        <textarea
                            rows={5}
                            placeholder="You are an expert developer. The user will dictate code changes..."
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/50 font-mono resize-none leading-relaxed"
                            value={newPrompt}
                            onChange={(e) => setNewPrompt(e.target.value)}
                        />
                        <p className="text-xs text-text-muted mt-2">
                            The Engine will automatically append contextual windows and the <code>{'{transcript}'}</code> to your prompt. Provide instructions on *how* to format the response.
                        </p>
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={saveNewSkill}
                            disabled={!newId || !newName || !newPrompt}
                            className="flex items-center gap-2 bg-accent-primary hover:bg-accent-primary/80 transition-all px-6 py-2 rounded-lg font-medium shadow-accent-primary/20 shadow-lg text-white disabled:opacity-50"
                        >
                            <VscSave /> Save Skill
                        </button>
                    </div>
                </section>
            )}

            {/* --- Existing Skills Grid --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {skills.map((skill, i) => (
                    <div key={i} className="glass-card p-5 group flex flex-col relative overflow-hidden">
                        {/* System Immutable Badge */}
                        {skill.id.startsWith('system_') && (
                            <div className="absolute top-0 right-0 bg-white/10 text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-bl-lg text-text-muted">
                                System Default
                            </div>
                        )}

                        <h3 className="text-lg font-bold text-white mb-1 flex items-center pr-24">
                            {skill.name}
                        </h3>
                        <p className="text-xs text-text-muted font-mono mb-4">{skill.id}</p>

                        <div className="flex-1 bg-black/40 rounded-lg p-3 overflow-y-auto max-h-[150px] custom-scrollbar border border-white/5">
                            <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed">
                                {skill.prompt}
                            </pre>
                        </div>

                        {/* Delete button for custom skills */}
                        {!skill.id.startsWith('system_') && (
                            <button
                                onClick={() => deleteSkill(skill.id, skill.name)}
                                className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/5 hover:bg-semantic-error/20 text-text-muted hover:text-semantic-error transition-all opacity-0 group-hover:opacity-100"
                                title={`Delete ${skill.name}`}
                            >
                                <VscTrash size={14} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

        </div>
    )
}
