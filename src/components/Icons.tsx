import type { ReactNode } from 'react'

type IconProps = { size?: number }

function Svg({ size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  )
}

export function IconChart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </Svg>
  )
}

export function IconPaw(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="8" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="17" cy="8" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="13.5" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="13.5" r="1.8" fill="currentColor" stroke="none" />
      <path d="M12 21c3.2 0 5.2-2.4 5.2-4.6 0-2.4-2.2-3.6-5.2-3.6s-5.2 1.2-5.2 3.6C6.8 18.6 8.8 21 12 21z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconBell(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </Svg>
  )
}

export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.6-3.4 4.4-5 8-5s6.4 1.6 8 5" />
    </Svg>
  )
}

