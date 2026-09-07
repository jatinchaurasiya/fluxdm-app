import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fluxdm.app',
  appName: 'FluxDM',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    App: {
      customUrlScheme: 'fluxdm'
    }
  }
};

export default config;
