import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lingonova.app',
  appName: 'LingoNova',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#070A10',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
