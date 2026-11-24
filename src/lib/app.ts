import { Capacitor } from '@capacitor/core'

// Always points at the newest GitHub release, so the website never needs
// changing when a new APK is published. Override with VITE_APK_URL if the
// APK is hosted somewhere else.
export const APK_URL =
  import.meta.env.VITE_APK_URL ||
  'https://github.com/JabyLorf/pawtrackVL1/releases/latest/download/PawTrack.apk'

// True inside the installed Android app, where the download button is pointless.
export const isNativeApp = Capacitor.isNativePlatform()
