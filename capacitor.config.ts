import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.studex.app',
  appName: 'Studex',
  webDir: 'dist',
  android: {
    // Studex only goes online to activate or move a license (HTTPS); keep mixed content and cleartext off.
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DEFAULT',
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#FAFAF9',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_studex',
      iconColor: '#111113',
    },
    // Off until the student turns on App lock (services/appLock.ts enables it then). When on it
    // hides Studex in the app switcher; on Android that also blocks screenshots.
    PrivacyScreen: {
      enable: false,
      preventScreenshots: false,
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false,
    },
  },
}

export default config
