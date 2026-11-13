import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const readBytes = (path: string) => readFileSync(new URL(path, root));

interface TauriConfig {
  productName: string;
  version: string;
  identifier: string;
  build: { frontendDist: string; beforeBuildCommand: string };
  app: {
    windows: {
      label?: string;
      title: string;
      width: number;
      height: number;
      minWidth: number;
      minHeight: number;
      resizable?: boolean;
      dragDropEnabled?: boolean;
      useHttpsScheme?: boolean;
    }[];
    security: { csp?: string | Record<string, string | string[]> };
  };
  bundle: {
    targets: string[];
    icon: string[];
    category?: string;
    windows?: { nsis?: { installMode?: string }; webviewInstallMode?: { type?: string; silent?: boolean } };
    macOS?: { minimumSystemVersion?: string; signingIdentity?: string; entitlements?: string; hardenedRuntime?: boolean };
  };
}

const conf = JSON.parse(read('src-tauri/tauri.conf.json')) as TauriConfig;
const capability = JSON.parse(read('src-tauri/capabilities/default.json')) as {
  identifier: string;
  windows: string[];
  permissions: string[];
};

// The Android app has the same id, so one app means the same thing on every platform.
const APP_ID = 'io.github.ghuumiruma.soundboard';

/** The CSP as a map from directive to its sources, whether the config spells it as one string or as an object. */
function directives(csp: TauriConfig['app']['security']['csp']): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (typeof csp === 'string') {
    for (const part of csp.split(';')) {
      const [name, ...sources] = part.trim().split(/\s+/);
      if (name) map.set(name, sources);
    }
  } else if (csp) {
    for (const [name, value] of Object.entries(csp)) {
      map.set(name, (Array.isArray(value) ? value : [value]).flatMap((v) => v.split(/\s+/).filter(Boolean)));
    }
  }
  return map;
}

describe('Desktop app identity', () => {
  it('is called Soundboard, with the Android app id', () => {
    expect(conf.productName).toBe('Soundboard');
    expect(conf.identifier).toBe(APP_ID);
    expect(conf.app.windows).toHaveLength(1);
    expect(conf.app.windows[0].title).toBe('Soundboard');
  });

  it('has a plain version number for the build to replace', () => {
    expect(conf.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('opens its page from the web app built for native apps', () => {
    expect(conf.build.frontendDist).toBe('../dist');
    expect(conf.build.beforeBuildCommand).toBe('npm run build:native');
    expect(JSON.parse(read('package.json')).scripts['build:native']).toContain('--mode native');
  });
});

describe('Desktop window', () => {
  const win = conf.app.windows[0];

  it('opens at a comfortable size and can shrink to a narrow strip', () => {
    expect([win.width, win.height]).toEqual([1100, 760]);
    expect([win.minWidth, win.minHeight]).toEqual([360, 480]);
    expect(win.resizable).toBe(true);
  });

  // With the desktop's own drag-and-drop on, the page never hears about files dropped on it.
  it('lets the page handle files dropped onto it', () => {
    expect(win.dragDropEnabled).toBe(false);
  });

  // Sounds live in the page's IndexedDB, which belongs to the address the page is served from (http://tauri.localhost
  // on Windows). Switching to https would make every saved sound disappear.
  it('keeps the page address, so saved sounds stay where they are', () => {
    expect(win.useHttpsScheme).toBe(false);
  });
});

describe('Desktop content security policy', () => {
  const csp = directives(conf.app.security.csp);
  const sources = (name: string) => csp.get(name) ?? [];

  it('has one', () => {
    expect(csp.size).toBeGreaterThan(0);
    expect(sources('default-src')).toEqual(["'self'"]);
  });

  it('runs only the app\'s own scripts', () => {
    expect(sources('script-src')).toContain("'self'");
    for (const source of sources('script-src')) expect(["'self'", "'wasm-unsafe-eval'"]).toContain(source);
  });

  it('allows inline code nowhere, apart from style attributes', () => {
    for (const [name, list] of csp) {
      if (name === 'style-src-attr') continue;
      expect(list, name).not.toContain("'unsafe-inline'");
      expect(list, name).not.toContain("'unsafe-eval'");
    }
  });

  it('never reaches the internet', () => {
    const everything = [...csp.values()].flat();
    expect(everything.filter((s) => s === '*' || (/^(https?|wss?|ftp):/.test(s) && s !== 'http://ipc.localhost'))).toEqual([]);
  });

  it('lets the page use its own sounds, pictures and waveform workers', () => {
    for (const name of ['img-src', 'media-src']) {
      expect(sources(name), name).toEqual(expect.arrayContaining(["'self'", 'blob:', 'data:']));
    }
    expect(sources('worker-src')).toEqual(expect.arrayContaining(["'self'", 'blob:']));
  });

  it('lets the page talk to the desktop app, which every plugin call needs', () => {
    expect(sources('connect-src')).toEqual(expect.arrayContaining(["'self'", 'ipc:', 'http://ipc.localhost']));
  });

  it('shuts the doors the app does not use', () => {
    expect(sources('object-src')).toEqual(["'none'"]);
    expect(sources('frame-src')).toEqual(["'none'"]);
    expect(sources('form-action')).toEqual(["'none'"]);
    expect(sources('base-uri')).toEqual(["'self'"]);
  });
});

describe('Desktop permissions', () => {
  it('belong to the one window the app has', () => {
    expect(capability.identifier).toBe('default');
    expect(capability.windows).toEqual([conf.app.windows[0].label]);
    expect(conf.app.windows[0].label).toBe('main');
  });

  // Saving a file the person picked, and sound keys. Nothing that reads files, runs programs or reaches the network.
  it('are the few the app uses, and nothing else', () => {
    expect([...capability.permissions].sort()).toEqual(
      [
        'core:default',
        'dialog:allow-save',
        'fs:allow-write-file',
        'global-shortcut:allow-register',
        'global-shortcut:allow-unregister',
        'global-shortcut:allow-unregister-all',
      ].sort(),
    );
  });
});

describe('Rust side', () => {
  const lib = read('src-tauri/src/lib.rs');
  const cargo = read('src-tauri/Cargo.toml');

  it('starts the dialog, file and global-shortcut plugins and nothing else', () => {
    const plugins = [...lib.matchAll(/\.plugin\(\s*(tauri_plugin_[a-z_]+)/g)].map((m) => m[1]);
    expect(plugins).toEqual(['tauri_plugin_dialog', 'tauri_plugin_fs', 'tauri_plugin_global_shortcut']);
    expect(lib).not.toMatch(/invoke_handler|#\[tauri::command\]/);
  });

  it('depends on just those plugins', () => {
    const section = cargo.split(/^\[dependencies\]\s*$/m)[1].split(/^\[/m)[0];
    const names = [...section.matchAll(/^([a-z][a-z0-9_-]*)\s*=/gm)].map((m) => m[1]);
    expect(names).toEqual(['tauri', 'tauri-plugin-dialog', 'tauri-plugin-fs', 'tauri-plugin-global-shortcut']);
  });

  it('keeps the versions of its libraries in Cargo.lock, so every build uses the same ones', () => {
    expect(existsSync(new URL('src-tauri/Cargo.lock', root))).toBe(true);
  });
});

describe('Windows installer', () => {
  it('is an NSIS setup program that installs for the current person, so no administrator password is asked for', () => {
    expect(conf.bundle.targets).toContain('nsis');
    expect(conf.bundle.windows?.nsis?.installMode).toBe('currentUser');
  });

  it('fetches the web view quietly if the computer lacks it', () => {
    expect(conf.bundle.windows?.webviewInstallMode).toMatchObject({ type: 'downloadBootstrapper', silent: true });
  });
});

describe('Mac app', () => {
  const mac = conf.bundle.macOS;

  it('comes as a disk image holding the app', () => {
    expect(conf.bundle.targets).toEqual(expect.arrayContaining(['dmg', 'app']));
  });

  // Apple Silicon refuses to start a program that has no signature at all. "-" signs it with no certificate.
  it('is signed without a certificate, which is enough to run on Apple Silicon', () => {
    expect(mac?.signingIdentity).toBe('-');
    expect(mac?.minimumSystemVersion).toBe('10.15');
  });

  it('may use the microphone, and says why when it asks', () => {
    expect(mac?.entitlements).toBe('./entitlements.plist');
    expect(read('src-tauri/entitlements.plist')).toMatch(/<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/);
    expect(read('src-tauri/Info.plist')).toMatch(
      /<key>NSMicrophoneUsageDescription<\/key>\s*<string>Soundboard uses the microphone only when you record a sound\.<\/string>/,
    );
  });
});

describe('Desktop icons', () => {
  const pngSize = (path: string) => {
    const bytes = readBytes(path);
    expect(bytes.subarray(0, 8).toString('hex'), path).toBe('89504e470d0a1a0a');
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  };

  it('are all there', () => {
    expect(conf.bundle.icon.length).toBeGreaterThan(0);
    for (const icon of conf.bundle.icon) expect(existsSync(new URL(`src-tauri/${icon}`, root)), icon).toBe(true);
  });

  it('have the sizes each system asks for', () => {
    expect(pngSize('src-tauri/icons/32x32.png')).toEqual([32, 32]);
    expect(pngSize('src-tauri/icons/128x128.png')).toEqual([128, 128]);
    expect(pngSize('src-tauri/icons/128x128@2x.png')).toEqual([256, 256]);
    expect(pngSize('src-tauri/icons/icon.png')).toEqual([512, 512]);
  });

  it('include a Windows icon with small and large pictures, and a complete Mac icon', () => {
    const ico = readBytes('src-tauri/icons/icon.ico');
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + 16 * i] || 256);
    expect(sizes).toEqual(expect.arrayContaining([16, 32, 48, 256]));

    const icns = readBytes('src-tauri/icons/icon.icns');
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);
  });
});

describe('Desktop release', () => {
  const workflow = read('.github/workflows/desktop.yml');

  it('puts the two installers on one rolling release, under names that never change', () => {
    expect(workflow).toMatch(/^on:\s*\n\s+push:/m);
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('Soundboard-Windows-Setup.exe');
    expect(workflow).toContain('Soundboard-Mac.dmg');
    expect(workflow).toContain('gh release delete desktop-latest --yes --cleanup-tag');
    expect(workflow).toContain('gh release create desktop-latest');
  });

  // GitHub refuses (403) a release tag on an older commit that changed a workflow file, and main moves on while this builds.
  it('lets the new release tag land on the newest main instead of the built commit', () => {
    const create = workflow.match(/gh release create desktop-latest(?:[^\n]*\\\r?\n)*[^\n]*/)?.[0] ?? '';
    expect(create).toContain('--notes-file');
    expect(create).toContain('--latest=false');
    expect(create).not.toContain('--target');
  });

  it('builds the Mac app for Apple Silicon and Intel together', () => {
    expect(workflow).toContain('--target universal-apple-darwin');
    expect(workflow).toContain('aarch64-apple-darwin,x86_64-apple-darwin');
  });

  it('gives each build its own version number', () => {
    expect(workflow).toContain('APP_VERSION: 1.${{ github.run_number }}.0');
  });

  it('never stops a publish half way', () => {
    expect(workflow).toContain("cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}");
  });
});
