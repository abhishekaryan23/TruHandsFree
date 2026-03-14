import { useEffect, useState } from 'react'
import axios from 'axios'

import { BrandedProgressLoader } from './components/BrandedProgressLoader'
import { CheckIcon, ErrorIcon, KeyIcon, SkillsIcon, SparkIcon, WarningIcon, WindowCloseIcon } from './components/BrandIcons'
import { apiDelete, apiGet, apiPost } from './lib/api'
import type { Skill } from './types'

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

function Banner({
  tone,
  message,
}: {
  tone: 'success' | 'error'
  message: string
}) {
  const toneClass = tone === 'success'
    ? 'border-semantic-success/20 bg-semantic-success/10 text-semantic-success'
    : 'border-semantic-error/20 bg-semantic-error/10 text-semantic-error'

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>
      {message}
    </div>
  )
}

export const SkillsManager = () => {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newId, setNewId] = useState('')
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Skill | null>(null)

  useEffect(() => {
    fetchSkills()
  }, [])

  const fetchSkills = async () => {
    setLoading(true)
    try {
      const res = await apiGet<{ skills: Skill[] }>('/skills')
      setSkills(res.data.skills || [])
    } catch {
      setBanner({ tone: 'error', message: 'Failed to load the current skill library.' })
    } finally {
      setLoading(false)
    }
  }

  const saveNewSkill = async () => {
    if (!newId || !newName || !newPrompt) return

    try {
      await apiPost('/skills', {
        id: newId,
        name: newName,
        prompt: newPrompt,
      })
      setIsCreating(false)
      setNewId('')
      setNewName('')
      setNewPrompt('')
      setBanner({ tone: 'success', message: `Saved "${newName}" for Smart Mode.` })
      await fetchSkills()
    } catch (error: unknown) {
      setBanner({ tone: 'error', message: getErrorMessage(error, 'Failed to save the skill. Choose a unique ID and try again.') })
    }
  }

  const deleteSkill = async () => {
    if (!pendingDelete) return

    try {
      await apiDelete(`/skills/${pendingDelete.id}`)
      setBanner({ tone: 'success', message: `Deleted "${pendingDelete.name}".` })
      setPendingDelete(null)
      await fetchSkills()
    } catch (error: unknown) {
      setBanner({ tone: 'error', message: getErrorMessage(error, 'Failed to delete that skill.') })
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <BrandedProgressLoader
          title="Loading skill library"
          subtitle="Pulling the current Smart Mode prompts and system defaults."
        />
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-6xl pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-text-muted">Skill library</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">Shape how Smart Mode rewrites the transcript.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-text-secondary">
              Each skill is combined with the transcript plus the captured frontmost context: app name, window title,
              and for supported browsers, the active tab title and site hostname.
            </p>
          </div>

          {!isCreating ? (
            <button
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-accent-primary/20 bg-accent-primary px-4 py-2.5 text-sm font-medium text-[#021318] transition-all hover:bg-[#46f0f4]"
            >
              <SparkIcon size={16} />
              Add custom skill
            </button>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <SkillsIcon size={18} className="text-accent-primary" />
              Context contract
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-text-muted">Always included</div>
                <div className="mt-3 flex items-center gap-2 text-sm text-text-primary"><CheckIcon size={14} className="text-semantic-success" /> App name</div>
                <div className="mt-2 flex items-center gap-2 text-sm text-text-primary"><CheckIcon size={14} className="text-semantic-success" /> Window title</div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-4">
                <div className="text-[11px] uppercase tracking-[0.28em] text-text-muted">Browser enrichment</div>
                <div className="mt-3 flex items-center gap-2 text-sm text-text-primary"><KeyIcon size={14} className="text-accent-primary" /> Tab title</div>
                <div className="mt-2 flex items-center gap-2 text-sm text-text-primary"><KeyIcon size={14} className="text-accent-primary" /> Site hostname</div>
              </div>
            </div>
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <WarningIcon size={18} className="text-semantic-warning" />
              Prompting guidance
            </div>
            <p className="mt-4 text-sm leading-7 text-text-secondary">
              Write instructions for how the transcript should be transformed when that context matches. Keep prompts focused on
              output style and formatting, not on fetching external data.
            </p>
          </div>
        </div>

        {banner ? <div className="mt-6"><Banner tone={banner.tone} message={banner.message} /></div> : null}

        {isCreating ? (
          <section className="mt-6 rounded-[28px] border border-accent-primary/18 bg-[linear-gradient(180deg,rgba(9,27,38,0.82),rgba(4,13,20,0.92))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.26)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-text-muted">New custom skill</div>
                <h2 className="mt-2 text-xl font-semibold text-text-primary">Author a Smart Mode prompt</h2>
              </div>
              <button
                onClick={() => setIsCreating(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-text-muted transition-all hover:bg-white/[0.06] hover:text-text-primary"
                title="Close"
              >
                <WindowCloseIcon size={14} />
              </button>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div>
                <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Unique ID</label>
                <input
                  type="text"
                  value={newId}
                  onChange={(event) => setNewId(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. browser_brief"
                  className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
                />
              </div>
              <div>
                <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Display name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="e.g. Browser Brief"
                  className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
                />
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Prompt instructions</label>
              <textarea
                rows={7}
                value={newPrompt}
                onChange={(event) => setNewPrompt(event.target.value)}
                placeholder="When the target app is Slack, rewrite the transcript into a concise teammate update. Use bullets when multiple actions are mentioned."
                className="w-full resize-none rounded-[24px] border border-white/8 bg-black/30 px-4 py-4 font-mono text-sm leading-7 text-text-primary outline-none placeholder:text-text-muted focus:border-accent-primary/30 focus:ring-2 focus:ring-accent-primary/20"
              />
            </div>

            <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-4 text-sm leading-7 text-text-secondary">
              TruHandsFree injects the transcript plus the captured context automatically. You only need to describe how the final output should read.
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={saveNewSkill}
                disabled={!newId || !newName || !newPrompt}
                className="inline-flex items-center gap-2 rounded-2xl border border-accent-primary/20 bg-accent-primary px-5 py-2.5 text-sm font-medium text-[#021318] transition-all hover:bg-[#46f0f4] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <SparkIcon size={16} />
                Save skill
              </button>
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {skills.map((skill) => {
            const isSystem = skill.id.startsWith('system_')
            return (
              <article
                key={skill.id}
                className="group glass-card relative overflow-hidden p-5 transition-all hover:border-accent-primary/14 hover:shadow-[0_16px_36px_rgba(0,0,0,0.2)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-text-primary">{skill.name}</h3>
                      {isSystem ? <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-text-muted">System</span> : null}
                    </div>
                    <p className="mt-2 font-mono text-xs text-text-muted">{skill.id}</p>
                  </div>

                  {!isSystem ? (
                    <button
                      onClick={() => setPendingDelete(skill)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-text-muted opacity-0 transition-all hover:border-semantic-error/20 hover:bg-semantic-error/12 hover:text-semantic-error group-hover:opacity-100"
                      title={`Delete ${skill.name}`}
                    >
                      <ErrorIcon size={14} />
                    </button>
                  ) : null}
                </div>

                {skill.description ? <p className="mt-4 text-sm leading-7 text-text-secondary">{skill.description}</p> : null}

                <div className="mt-4 rounded-2xl border border-white/6 bg-black/30 p-4">
                  <pre className="whitespace-pre-wrap text-sm leading-7 text-text-secondary">{skill.prompt}</pre>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      {pendingDelete ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(2,8,12,0.7)] px-6 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[28px] border border-semantic-error/20 bg-[linear-gradient(180deg,rgba(27,11,16,0.94),rgba(8,8,11,0.98))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3 text-semantic-error">
              <ErrorIcon size={18} />
              <h2 className="text-lg font-semibold text-text-primary">Delete custom skill?</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-text-secondary">
              <strong className="text-text-primary">{pendingDelete.name}</strong> will be removed from the Smart Mode library. System skills cannot be restored from here.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                onClick={deleteSkill}
                className="rounded-2xl border border-semantic-error/20 bg-semantic-error px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#ff6d7a]"
              >
                Delete skill
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
