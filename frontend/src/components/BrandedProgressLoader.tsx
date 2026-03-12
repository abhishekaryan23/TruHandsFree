import { BrandMark, SparkIcon } from './BrandIcons'

interface BrandedProgressLoaderProps {
  title: string
  subtitle?: string
  progress?: number | null
  compact?: boolean
  className?: string
}

export function BrandedProgressLoader({
  title,
  subtitle,
  progress = null,
  compact = false,
  className = '',
}: BrandedProgressLoaderProps) {
  const resolvedProgress = typeof progress === 'number'
    ? Math.max(6, Math.min(progress, 100))
    : null

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl border border-accent-primary/25 bg-accent-primary/10 text-accent-primary shadow-[0_0_24px_rgba(18,222,230,0.22)]">
          <BrandMark size={18} />
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle,_rgba(18,222,230,0.22),_transparent_70%)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-text-secondary">
            <SparkIcon size={12} />
            {title}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
            {resolvedProgress == null ? (
              <div className="h-full w-1/2 rounded-full bg-[linear-gradient(90deg,rgba(18,222,230,0.2),rgba(18,222,230,0.9),rgba(18,222,230,0.2))] animate-loader-sweep" />
            ) : (
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,rgba(18,222,230,0.7),rgba(129,243,246,1))] transition-[width] duration-500"
                style={{ width: `${resolvedProgress}%` }}
              />
            )}
          </div>
          {subtitle ? (
            <p className="mt-2 truncate text-xs text-text-muted">{subtitle}</p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-5 text-center ${className}`}>
      <div className="relative">
        <div className="absolute inset-[-16px] rounded-full bg-[radial-gradient(circle,_rgba(18,222,230,0.28),_transparent_70%)] blur-xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[28px] border border-accent-primary/20 bg-[linear-gradient(180deg,rgba(9,24,35,0.96),rgba(5,13,20,0.88))] text-accent-primary shadow-[0_0_36px_rgba(18,222,230,0.28)]">
          <BrandMark size={42} />
        </div>
      </div>
      <div className="max-w-sm">
        <div className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-text-secondary">
          <SparkIcon size={13} />
          TruHandsFree
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-text-primary">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm text-text-secondary">{subtitle}</p> : null}
      </div>
      <div className="w-full max-w-sm">
        <div className="h-2 overflow-hidden rounded-full border border-white/6 bg-white/6 shadow-inner shadow-black/20">
          {resolvedProgress == null ? (
            <div className="h-full w-2/5 rounded-full bg-[linear-gradient(90deg,rgba(18,222,230,0.1),rgba(18,222,230,0.95),rgba(129,243,246,0.2))] animate-loader-sweep" />
          ) : (
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,rgba(18,222,230,0.7),rgba(129,243,246,1))] shadow-[0_0_16px_rgba(18,222,230,0.4)] transition-[width] duration-500"
              style={{ width: `${resolvedProgress}%` }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
