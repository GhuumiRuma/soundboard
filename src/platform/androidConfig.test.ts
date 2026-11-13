import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../../capacitor.config';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const withoutComments = (xml: string) => xml.replace(/<!--[\s\S]*?-->/g, '');

// Android installs a new APK over an old one only when the package id matches (and the signing key,
// which CI checks). Changing this id turns every update into a second app with none of the user's sounds.
const APP_ID = 'io.github.ghuumiruma.soundboard';
// The public fingerprint of the certificate that signs every release (not a secret).
const CERT_SHA256 = 'b71a5732e6ba9fc9478b3b939eb0d81f547774c5811123cc2c494640b7cd2454';
// Everything the app asks the phone for: the internet, the microphone (to record a sound), audio settings and the tap on a pad.
const PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.RECORD_AUDIO',
  'android.permission.VIBRATE',
];

const manifest = () => withoutComments(read('android/app/src/main/AndroidManifest.xml'));
const workflow = () => read('.github/workflows/android.yml');

describe('Android update identity', () => {
  it('keeps one package id everywhere', () => {
    expect(config.appId).toBe(APP_ID);
    const gradle = read('android/app/build.gradle');
    expect(gradle).toContain(`applicationId "${APP_ID}"`);
    expect(gradle).toContain(`namespace = "${APP_ID}"`);
    expect(read('android/app/src/main/java/io/github/ghuumiruma/soundboard/MainActivity.java')).toContain(`package ${APP_ID};`);
    expect(read('android/app/src/main/res/values/strings.xml')).toContain(`<string name="package_name">${APP_ID}</string>`);
    expect(workflow()).toContain(`APP_ID: ${APP_ID}`);
  });

  it('is called Soundboard on the home screen', () => {
    expect(config.appName).toBe('Soundboard');
    expect(read('android/app/src/main/res/values/strings.xml')).toContain('<string name="app_name">Soundboard</string>');
  });

  it('numbers each build above the last so it installs as an update', () => {
    expect(read('android/app/build.gradle')).toMatch(/versionCode\(\(System\.getenv\("VERSION_CODE"\)/);
    expect(workflow()).toContain('VERSION_CODE: ${{ github.run_number }}');
    expect(workflow()).toContain('VERSION_NAME: 1.${{ github.run_number }}');
  });
});

describe('Android signing', () => {
  const variables = ['ANDROID_KEYSTORE_FILE', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD'];

  it('signs the release build with a key that CI supplies through the environment', () => {
    const gradle = read('android/app/build.gradle');
    for (const name of variables) {
      expect(gradle).toContain(`System.getenv("${name}")`);
      expect(workflow()).toContain(name);
    }
    expect(gradle).toContain('signingConfig System.getenv("ANDROID_KEYSTORE_FILE") ? signingConfigs.release : signingConfigs.debug');
  });

  it('refuses to publish an app signed with any other certificate', () => {
    expect(workflow()).toContain(`EXPECTED_CERT_SHA256: ${CERT_SHA256}`);
    expect(workflow()).toContain('apksigner');
  });

  it('never keeps a signing key in the repository', () => {
    const ignored = read('android/.gitignore');
    for (const pattern of ['*.jks', '*.keystore', 'keystore.properties']) expect(ignored).toMatch(new RegExp(`^${pattern.replace(/[*.]/g, '\\$&')}$`, 'm'));
  });
});

describe('Android release', () => {
  it('publishes Soundboard.apk on one rolling release that is rebuilt on every push to main', () => {
    const text = workflow();
    expect(text).toMatch(/^on:\s*\n\s+push:/m);
    expect(text).toContain('workflow_dispatch');
    expect(text).toContain('contents: write');
    expect(text).toContain('android-latest');
    expect(text).toContain('Soundboard.apk');
    expect(text).toContain("cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}");
  });

  it('builds the web app for the phone and copies it into the Android project first', () => {
    expect(config.webDir).toBe('dist');
    expect(workflow()).toContain('npm run build:native');
    expect(workflow()).toContain('npx cap sync android');
  });

  it('does not commit the copy of the web app that "cap sync" makes', () => {
    const ignored = read('android/.gitignore');
    expect(ignored).toMatch(/^app\/src\/main\/assets\/public$/m);
    expect(ignored).toMatch(/^app\/src\/main\/assets\/capacitor\.config\.json$/m);
  });
});

describe('Android permissions', () => {
  it('asks for the internet, the microphone, audio settings and vibration, and nothing else', () => {
    const asked = [...manifest().matchAll(/<uses-permission\s+android:name="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(asked).toEqual(PERMISSIONS);
    expect(manifest()).not.toContain('<uses-permission-sdk-23');
  });

  it('checks the permissions of the finished APK, not just of the manifest', () => {
    expect(workflow()).toContain('dump badging');
    for (const permission of PERMISSIONS) expect(workflow()).toContain(permission);
  });

  it('has the plugins the app uses', () => {
    const settings = read('android/capacitor.settings.gradle');
    const build = read('android/app/capacitor.build.gradle');
    for (const plugin of ['filesystem', 'share', 'haptics']) {
      expect(settings).toContain(`include ':capacitor-${plugin}'`);
      expect(build).toContain(`implementation project(':capacitor-${plugin}')`);
    }
  });
});

describe('Android screen', () => {
  // A soundboard is as happy on its side on a stand as upright in the hand.
  it('turns to match the phone, whichever way it is held', () => {
    expect(manifest()).not.toContain('screenOrientation');
  });

  it('does not restart the page when the phone turns, which would cut off a sound that is playing', () => {
    const changes = manifest().match(/android:configChanges="([^"]+)"/)?.[1].split('|') ?? [];
    for (const change of ['orientation', 'screenSize', 'smallestScreenSize', 'screenLayout', 'keyboardHidden']) {
      expect(changes).toContain(change);
    }
  });

  it('is dark from the first moment: the splash screen, the window and the status and navigation bars', () => {
    expect(config.backgroundColor).toBe('#111018');
    expect(read('android/app/src/main/res/values/colors.xml')).toMatch(/<color name="app_background">#111018<\/color>/i);
    const styles = read('android/app/src/main/res/values/styles.xml');
    for (const item of ['android:windowBackground', 'android:statusBarColor', 'android:navigationBarColor', 'windowSplashScreenBackground']) {
      expect(styles).toContain(`<item name="${item}">@color/app_background</item>`);
    }
  });

  it('puts the icon art on a dark tile', () => {
    expect(read('android/app/src/main/res/values/ic_launcher_background.xml')).toMatch(/#17131F/i);
  });
});

describe('Android data origin', () => {
  // The WebView keeps boards and sounds in IndexedDB keyed by the page origin, https://localhost.
  it('pins the origin the app is served from', () => {
    expect(config.server?.androidScheme).toBe('https');
    expect(config.server?.hostname).toBe('localhost');
    expect(config.server?.url).toBeUndefined();
  });

  it('offers to keep app data when the app is uninstalled', () => {
    expect(manifest()).toMatch(/<application[^>]*android:hasFragileUserData="true"/);
  });
});
