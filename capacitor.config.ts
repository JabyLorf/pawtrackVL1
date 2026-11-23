import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ormocstraysoasis.pawtrack',
  appName: 'PawTrack',
  webDir: 'dist',
  android: {
    // Keep the app below the phone's status bar and above its navigation
    // bar on Android 15+, which otherwise draws apps edge to edge.
    adjustMarginsForEdgeToEdge: 'auto',
  },
};

export default config;
