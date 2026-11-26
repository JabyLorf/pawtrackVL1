import { Capacitor } from '@capacitor/core'

// Always points at the newest GitHub release, so the website never needs
// changing when a new APK is published. Override with VITE_APK_URL if the
// APK is hosted somewhere else.
export const APK_URL =
  import.meta.env.VITE_APK_URL ||
  'https://github.com/JabyLorf/pawtrackVL1/releases/latest/download/PawTrack.apk'

// True inside the installed Android app, where the download button is pointless.
export const isNativeApp = Capacitor.isNativePlatform()

// iPhone/iPad (iPadOS reports itself as a Mac, so check for touch too).
export const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

// True when opened from the home-screen icon instead of the browser.
export const isHomeScreenApp =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true)

// Whether to show "get the app" links at all.
export const showAppLinks = !isNativeApp && !isHomeScreenApp

// Public address of the website, for share links (the Android app runs from
// a local address, so it uses the live site).
export const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined) ||
  (isNativeApp || typeof window === 'undefined' ? 'https://pawtrack.jarrybendijo.workers.dev' : window.location.origin)
