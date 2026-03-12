import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

function BaseIcon({ size = 18, className, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function BrandMark({ size = 28, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 32h8l6-7 7 18 7-28 8 34 6-18 6 10h8" />
        <rect x="24" y="18" width="16" height="24" rx="8" />
        <path d="M32 42v10" />
        <path d="M22 36a10 10 0 0 0 20 0" />
      </g>
    </svg>
  )
}

export function SetupIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.75v2.5" />
      <path d="M12 18.75v2.5" />
      <path d="m5.57 5.57 1.77 1.77" />
      <path d="m16.66 16.66 1.77 1.77" />
      <path d="M2.75 12h2.5" />
      <path d="M18.75 12h2.5" />
      <path d="m5.57 18.43 1.77-1.77" />
      <path d="m16.66 7.34 1.77-1.77" />
    </BaseIcon>
  )
}

export function SkillsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
      <path d="M4.5 6.5 6 8l-1.5 1.5" />
      <path d="m18 15 1.25 2.5L22 18.5l-2 1.5.75 2.75L18 21.25l-2.75 1.5.75-2.75-2-1.5 2.75-1Z" />
    </BaseIcon>
  )
}

export function ShieldIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3.5 5.5 6v5.5c0 4.1 2.5 7.9 6.5 9.5 4-1.6 6.5-5.4 6.5-9.5V6Z" />
      <path d="m9.5 12 1.75 1.75L15 10" />
    </BaseIcon>
  )
}

export function WaveIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M2.5 12h3l1.75-4 2.5 8 3-12 2.5 16 2.25-8h4.5" />
    </BaseIcon>
  )
}

export function SparkIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m12 2.75 1.8 5.45L19.25 10l-5.45 1.8L12 17.25l-1.8-5.45L4.75 10l5.45-1.8Z" />
      <path d="m18.5 3.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
    </BaseIcon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m5 12.5 4.25 4.25L19 7" />
    </BaseIcon>
  )
}

export function WarningIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4 3.75 19h16.5Z" />
      <path d="M12 9v4.25" />
      <circle cx="12" cy="16.75" r="0.8" fill="currentColor" stroke="none" />
    </BaseIcon>
  )
}

export function ErrorIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9 9 6 6" />
      <path d="m15 9-6 6" />
    </BaseIcon>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 6v5h-5" />
      <path d="M4 18v-5h5" />
      <path d="M18 11a6.5 6.5 0 0 0-11.03-3.9L4 11" />
      <path d="M6 13a6.5 6.5 0 0 0 11.03 3.9L20 13" />
    </BaseIcon>
  )
}

export function KeyIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="8.25" cy="12" r="3.25" />
      <path d="M11.5 12H21" />
      <path d="M17 12v3" />
      <path d="M14.5 12v2" />
    </BaseIcon>
  )
}

export function MicIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="8.5" y="4" width="7" height="11" rx="3.5" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
      <path d="M12 17v3.5" />
      <path d="M9.25 20.5h5.5" />
    </BaseIcon>
  )
}

export function WindowCloseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m7 7 10 10" />
      <path d="M17 7 7 17" />
    </BaseIcon>
  )
}

export function WindowMinimizeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 12.5h12" />
    </BaseIcon>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </BaseIcon>
  )
}
