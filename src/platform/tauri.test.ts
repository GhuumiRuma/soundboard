import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The plugins only exist inside the installed app, so each one is replaced by a stand-in that records what it was asked to do.
const plugins = vi.hoisted(() => ({
  save: vi.fn(),
  writeFile: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  unregisterAll: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: plugins.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: plugins.writeFile }));
vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
  register: plugins.register,
  unregister: plugins.unregister,
  unregisterAll: plugins.unregisterAll,
}));

const FAILED = "I couldn't save that file. Please try again.";
const WINDOWS = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
  platform: 'Win32',
  maxTouchPoints: 0,
};

type KeyHandler = (event: { shortcut: string; id: number; state: 'Pressed' | 'Released' }) => void;

/** Stands in for Windows or macOS: it holds keys for the app, refuses keys that another app owns, and reports presses. */
class FakeComputer {
  /** The keys held for Soundboard, each with the function that hears it. */
  readonly held = new Map<string, KeyHandler>();
  /** Keys that another app already owns. */
  readonly takenByOthers = new Set<string>();
  /** How long a register call takes, so that overlapping calls have time to tangle. */
  delayMs = 0;

  constructor() {
    plugins.register.mockImplementation(async (shortcut: string, handler: KeyHandler) => {
      if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      if (this.takenByOthers.has(shortcut) || this.held.has(shortcut)) throw new Error(`${shortcut} is already taken`);
      this.held.set(shortcut, handler);
    });
    plugins.unregister.mockImplementation(async (shortcut: string) => {
      if (!this.held.delete(shortcut)) throw new Error(`${shortcut} is not held`);
    });
    plugins.unregisterAll.mockImplementation(async () => {
      this.held.clear();
    });
  }

  /** A tap on the key: the computer reports the press, then the release. */
  tap(shortcut: string): void {
    const hear = this.held.get(shortcut);
    if (!hear) return;
    hear({ shortcut, id: 1, state: 'Pressed' });
    hear({ shortcut, id: 1, state: 'Released' });
  }
}

let computer: FakeComputer;

/** A fresh copy of the platform each time, because it remembers which keys it holds. */
async function load() {
  vi.resetModules();
  const { tauriPlatform, describeFolder } = await import('./tauri');
  const { webPlatform } = await import('./web');
  return { tauriPlatform, describeFolder, webPlatform };
}

function file(bytes: number[], fileName = 'Soundboard backup.zip', title?: string) {
  return { fileName, mimeType: 'application/zip', data: new Blob([new Uint8Array(bytes)]), title };
}

/** A sound on a key, with a spy to see whether it played. */
function bind(key: string) {
  return { key, run: vi.fn() };
}

const shortcutsRegistered = () => plugins.register.mock.calls.map(([shortcut]) => shortcut);

beforeEach(() => {
  vi.resetAllMocks();
  computer = new FakeComputer();
  plugins.save.mockResolvedValue(null);
  plugins.writeFile.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', WINDOWS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the desktop platform', () => {
  it('says it is the Windows and Mac app', async () => {
    const { tauriPlatform } = await load();
    expect(tauriPlatform.kind).toBe('tauri');
    expect(tauriPlatform.isNativeApp).toBe(true);
  });

  it('knows which computer it is on', async () => {
    const { tauriPlatform } = await load();
    expect(tauriPlatform.os).toBe('windows');
  });

  it('keeps the web tap, because a computer has nothing to tap with', async () => {
    const { tauriPlatform, webPlatform } = await load();
    expect(tauriPlatform.haptic).toBe(webPlatform.haptic);
  });

  it('leaves the colours to the computer, so the "System" look still follows it', async () => {
    const { tauriPlatform } = await load();
    expect(tauriPlatform.setTheme).toBeUndefined();
  });
});

describe('saving a file', () => {
  it('opens the save box, then writes the file where she chose', async () => {
    plugins.save.mockResolvedValue('C:\\Users\\Ana\\Downloads\\Soundboard backup.zip');
    const { tauriPlatform } = await load();

    const outcome = await tauriPlatform.saveFile(file([1, 2, 3], 'Soundboard backup.zip', 'Save your backup'));

    expect(plugins.save).toHaveBeenCalledWith({
      title: 'Save your backup',
      defaultPath: 'Soundboard backup.zip',
      filters: [{ name: 'ZIP file', extensions: ['zip'] }],
    });
    expect(plugins.writeFile).toHaveBeenCalledTimes(1);
    const [path, written] = plugins.writeFile.mock.calls[0];
    expect(path).toBe('C:\\Users\\Ana\\Downloads\\Soundboard backup.zip');
    expect(written).toBeInstanceOf(Uint8Array);
    expect([...written]).toEqual([1, 2, 3]);
    expect(outcome).toEqual({ status: 'saved', where: 'your Downloads folder' });
  });

  it('names the save box after the file when no title is given', async () => {
    const { tauriPlatform } = await load();
    await tauriPlatform.saveFile(file([1], 'My recording.wav'));
    expect(plugins.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'My recording.wav', defaultPath: 'My recording.wav' }));
  });

  it('writes nothing when she closes the save box', async () => {
    plugins.save.mockResolvedValue(null);
    const { tauriPlatform } = await load();
    expect(await tauriPlatform.saveFile(file([1]))).toEqual({ status: 'cancelled' });
    expect(plugins.writeFile).not.toHaveBeenCalled();
  });

  it('says so when the save box will not open', async () => {
    plugins.save.mockRejectedValue(new Error('no window'));
    const { tauriPlatform } = await load();
    expect(await tauriPlatform.saveFile(file([1]))).toEqual({ status: 'failed', message: FAILED });
    expect(plugins.writeFile).not.toHaveBeenCalled();
  });

  it('says so when the file cannot be written', async () => {
    plugins.save.mockResolvedValue('C:\\Users\\Ana\\Downloads\\Soundboard backup.zip');
    plugins.writeFile.mockRejectedValue(new Error('disk full'));
    const { tauriPlatform } = await load();
    expect(await tauriPlatform.saveFile(file([1]))).toEqual({ status: 'failed', message: FAILED });
  });

  it('leaves out the file type when the name has no ending', async () => {
    const { tauriPlatform } = await load();
    await tauriPlatform.saveFile(file([1], 'My sounds'));
    expect(plugins.save).toHaveBeenCalledWith({ title: 'My sounds', defaultPath: 'My sounds', filters: undefined });
  });

  it('swaps the characters a computer refuses for dashes', async () => {
    const { tauriPlatform } = await load();
    await tauriPlatform.saveFile(file([1], 'Mix: part 1/2?.wav'));
    expect(plugins.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'Mix- part 1-2-.wav', filters: [{ name: 'WAV file', extensions: ['wav'] }] }),
    );
  });

  it.each(['...', '   ', ''])('starts from a plain name when "%s" leaves nothing usable', async (fileName) => {
    const { tauriPlatform } = await load();
    await tauriPlatform.saveFile(file([1], fileName));
    expect(plugins.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'Soundboard file' }));
  });
});

describe('saying where a file went', () => {
  it.each([
    ['C:\\Users\\Ana\\Downloads\\backup.zip', 'your Downloads folder'],
    ['C:\\Users\\Ana\\Desktop\\backup.zip', 'your Desktop folder'],
    ['C:\\Users\\Ana\\DOWNLOADS\\backup.zip', 'your Downloads folder'],
    ['C:\\Users\\Ana\\OneDrive\\Documents\\backup.zip', 'your Documents folder'],
    ['C:\\Users\\Ana\\OneDrive - Family\\Pictures\\backup.zip', 'your Pictures folder'],
    ['/Users/ana/Movies/take.mov', 'your Movies folder'],
    ['/Users/ana/Music/take.wav', 'your Music folder'],
    ['/home/ana/Videos/take.mp4', 'your Videos folder'],
    ['C:\\Users\\Ana\\Downloads\\Streams\\backup.zip', 'the "Streams" folder'],
    ['D:\\Sounds\\backup.zip', 'the "Sounds" folder'],
    ['/Volumes/Stick/backup.zip', 'the "Stick" folder'],
    ['\\\\server\\share\\backup.zip', 'the "share" folder'],
    ['C:\\backup.zip', 'the C: drive'],
    ['c:/backup.zip', 'the C: drive'],
    ['/backup.zip', undefined],
    ['backup.zip', undefined],
  ])('describes %s as %s', async (path, where) => {
    const { describeFolder } = await load();
    expect(describeFolder(path)).toBe(where);
  });
});

describe('sound keys', () => {
  it('play while a game or another app is in front', async () => {
    const { tauriPlatform } = await load();
    expect(tauriPlatform.soundKeys.global).toBe(true);
  });

  it('are handed to the computer one by one, spelled the way Tauri reads them', async () => {
    const { tauriPlatform } = await load();
    const result = await tauriPlatform.soundKeys.setKeys([bind('Ctrl+Alt+1'), bind('Ctrl+Shift+Meta+F5'), bind('Alt+Up')]);
    expect(result).toEqual({ unavailable: [] });
    expect(shortcutsRegistered()).toEqual(['Ctrl+Alt+1', 'Ctrl+Shift+Super+F5', 'Alt+Up']);
    expect([...computer.held.keys()]).toEqual(['Ctrl+Alt+1', 'Ctrl+Shift+Super+F5', 'Alt+Up']);
  });

  it('play their sound once for each tap', async () => {
    const { tauriPlatform } = await load();
    const one = bind('Ctrl+Alt+1');
    await tauriPlatform.soundKeys.setKeys([one]);
    computer.tap('Ctrl+Alt+1');
    expect(one.run).toHaveBeenCalledTimes(1);
    computer.tap('Ctrl+Alt+1');
    expect(one.run).toHaveBeenCalledTimes(2);
  });

  it('ignore the moment a key is let go', async () => {
    const { tauriPlatform } = await load();
    const one = bind('Ctrl+Alt+1');
    await tauriPlatform.soundKeys.setKeys([one]);
    computer.held.get('Ctrl+Alt+1')?.({ shortcut: 'Ctrl+Alt+1', id: 1, state: 'Released' });
    expect(one.run).not.toHaveBeenCalled();
  });

  it('name the keys another app already holds, and set up the rest', async () => {
    computer.takenByOthers.add('Ctrl+Alt+2');
    const { tauriPlatform } = await load();
    const [a, b, c] = [bind('Ctrl+Alt+1'), bind('Ctrl+Alt+2'), bind('Ctrl+Alt+3')];

    expect(await tauriPlatform.soundKeys.setKeys([a, b, c])).toEqual({ unavailable: ['Ctrl+Alt+2'] });

    for (const key of ['Ctrl+Alt+1', 'Ctrl+Alt+2', 'Ctrl+Alt+3']) computer.tap(key);
    expect(a.run).toHaveBeenCalledTimes(1);
    expect(b.run).not.toHaveBeenCalled();
    expect(c.run).toHaveBeenCalledTimes(1);
  });

  it('try a refused key again the next time they are set', async () => {
    computer.takenByOthers.add('Ctrl+Alt+2');
    const { tauriPlatform } = await load();
    const two = bind('Ctrl+Alt+2');
    expect(await tauriPlatform.soundKeys.setKeys([two])).toEqual({ unavailable: ['Ctrl+Alt+2'] });

    computer.takenByOthers.clear();
    expect(await tauriPlatform.soundKeys.setKeys([two])).toEqual({ unavailable: [] });

    computer.tap('Ctrl+Alt+2');
    expect(two.run).toHaveBeenCalledTimes(1);
    expect(plugins.register).toHaveBeenCalledTimes(2);
  });

  it.each(['banana', 'Ctrl+Alt', 'Ctrl+', 'A+B'])('name "%s" as unavailable without asking the computer', async (text) => {
    const { tauriPlatform } = await load();
    expect(await tauriPlatform.soundKeys.setKeys([bind(text)])).toEqual({ unavailable: [text] });
    expect(plugins.register).not.toHaveBeenCalled();
  });

  it('skip sounds that have no key', async () => {
    const { tauriPlatform } = await load();
    expect(await tauriPlatform.soundKeys.setKeys([bind(''), bind('   ')])).toEqual({ unavailable: [] });
    expect(plugins.register).not.toHaveBeenCalled();
  });

  it('name every way a refused key was written', async () => {
    computer.takenByOthers.add('Ctrl+Alt+1');
    const { tauriPlatform } = await load();
    const result = await tauriPlatform.soundKeys.setKeys([bind('Ctrl+Alt+1'), bind('control + option + 1')]);
    expect(result).toEqual({ unavailable: ['Ctrl+Alt+1', 'control + option + 1'] });
  });

  it('give a key that two sounds share to the first one', async () => {
    const { tauriPlatform } = await load();
    const first = bind('Ctrl+Alt+1');
    const second = bind('ctrl+alt+1');
    expect(await tauriPlatform.soundKeys.setKeys([first, second])).toEqual({ unavailable: [] });
    expect(plugins.register).toHaveBeenCalledTimes(1);
    computer.tap('Ctrl+Alt+1');
    expect(first.run).toHaveBeenCalledTimes(1);
    expect(second.run).not.toHaveBeenCalled();
  });

  it('are replaced, not added to, each time they are set', async () => {
    const { tauriPlatform } = await load();
    await tauriPlatform.soundKeys.setKeys([bind('Ctrl+Alt+1'), bind('Ctrl+Alt+2')]);
    await tauriPlatform.soundKeys.setKeys([bind('Ctrl+Alt+2'), bind('Ctrl+Alt+3')]);

    expect([...computer.held.keys()].sort()).toEqual(['Ctrl+Alt+2', 'Ctrl+Alt+3']);
    expect(plugins.unregister.mock.calls).toEqual([['Ctrl+Alt+1']]);
    expect(shortcutsRegistered()).toEqual(['Ctrl+Alt+1', 'Ctrl+Alt+2', 'Ctrl+Alt+3']);
  });

  it('stop for good when set to none', async () => {
    const { tauriPlatform } = await load();
    const one = bind('Ctrl+Alt+1');
    await tauriPlatform.soundKeys.setKeys([one]);

    expect(await tauriPlatform.soundKeys.setKeys([])).toEqual({ unavailable: [] });

    expect(computer.held.size).toBe(0);
    computer.tap('Ctrl+Alt+1');
    expect(one.run).not.toHaveBeenCalled();
  });

  it('can play a different sound without asking the computer again', async () => {
    const { tauriPlatform } = await load();
    const before = bind('Ctrl+Alt+1');
    const after = bind('Ctrl+Alt+1');
    await tauriPlatform.soundKeys.setKeys([before]);
    await tauriPlatform.soundKeys.setKeys([after]);

    expect(plugins.register).toHaveBeenCalledTimes(1);
    expect(plugins.unregister).not.toHaveBeenCalled();
    computer.tap('Ctrl+Alt+1');
    expect(before.run).not.toHaveBeenCalled();
    expect(after.run).toHaveBeenCalledTimes(1);
  });

  it('stay quiet once dropped, even if the computer will not let go of the key', async () => {
    const { tauriPlatform } = await load();
    const one = bind('Ctrl+Alt+1');
    await tauriPlatform.soundKeys.setKeys([one]);

    plugins.unregister.mockRejectedValueOnce(new Error('busy'));
    expect(await tauriPlatform.soundKeys.setKeys([])).toEqual({ unavailable: [] });
    computer.tap('Ctrl+Alt+1');
    expect(one.run).not.toHaveBeenCalled();

    // The computer still holds it, so there is nothing to ask for: the key simply plays again.
    expect(await tauriPlatform.soundKeys.setKeys([one])).toEqual({ unavailable: [] });
    expect(plugins.register).toHaveBeenCalledTimes(1);
    computer.tap('Ctrl+Alt+1');
    expect(one.run).toHaveBeenCalledTimes(1);
  });

  it('let go of keys left behind by an earlier copy of the page, once, before the first key is set', async () => {
    computer.held.set('Ctrl+Alt+9', () => undefined);
    const { tauriPlatform } = await load();
    const nine = bind('Ctrl+Alt+9');

    expect(await tauriPlatform.soundKeys.setKeys([nine])).toEqual({ unavailable: [] });
    await tauriPlatform.soundKeys.setKeys([nine, bind('Ctrl+Alt+8')]);

    expect(plugins.unregisterAll).toHaveBeenCalledTimes(1);
    computer.tap('Ctrl+Alt+9');
    expect(nine.run).toHaveBeenCalledTimes(1);
  });

  it('still work when the clean-up gets no answer', async () => {
    plugins.unregisterAll.mockRejectedValue(new Error('no answer'));
    const { tauriPlatform } = await load();
    const one = bind('Ctrl+Alt+1');

    expect(await tauriPlatform.soundKeys.setKeys([one])).toEqual({ unavailable: [] });

    computer.tap('Ctrl+Alt+1');
    expect(one.run).toHaveBeenCalledTimes(1);
  });

  it('take their turn when set again before the last change has finished', async () => {
    computer.delayMs = 5;
    const { tauriPlatform } = await load();
    const one = bind('Ctrl+Alt+1');
    const two = bind('Ctrl+Alt+2');

    const first = tauriPlatform.soundKeys.setKeys([one]);
    const second = tauriPlatform.soundKeys.setKeys([two]);
    expect(await first).toEqual({ unavailable: [] });
    expect(await second).toEqual({ unavailable: [] });

    expect([...computer.held.keys()]).toEqual(['Ctrl+Alt+2']);
    computer.tap('Ctrl+Alt+1');
    computer.tap('Ctrl+Alt+2');
    expect(one.run).not.toHaveBeenCalled();
    expect(two.run).toHaveBeenCalledTimes(1);
  });
});

describe('starting up', () => {
  it('lets go of keys left behind by an earlier copy of the page', async () => {
    const { tauriPlatform } = await load();
    await tauriPlatform.init?.();
    expect(plugins.unregisterAll).toHaveBeenCalledTimes(1);
  });

  it('keeps the page awake while the window is out of sight, so a key press is never held back', async () => {
    const request = vi.fn(() => new Promise<never>(() => undefined));
    vi.stubGlobal('navigator', { ...WINDOWS, locks: { request } });
    const { tauriPlatform } = await load();

    await tauriPlatform.init?.();

    expect(request).toHaveBeenCalledTimes(1);
    const [name, whileHeld] = request.mock.calls[0] as unknown as [string, () => Promise<never>];
    expect(name).toBe('soundboard-keep-awake');
    expect(whileHeld()).toBeInstanceOf(Promise);
  });

  it('carries on when the computer has no locks to offer', async () => {
    vi.stubGlobal('navigator', { ...WINDOWS, locks: undefined });
    const { tauriPlatform } = await load();
    await expect(tauriPlatform.init?.()).resolves.toBeUndefined();
  });

  it('carries on when asking for the lock goes wrong', async () => {
    const { tauriPlatform } = await load();

    vi.stubGlobal('navigator', {
      ...WINDOWS,
      locks: {
        request: () => {
          throw new Error('not allowed');
        },
      },
    });
    await expect(tauriPlatform.init?.()).resolves.toBeUndefined();

    vi.stubGlobal('navigator', { ...WINDOWS, locks: { request: () => Promise.reject(new Error('refused')) } });
    await expect(tauriPlatform.init?.()).resolves.toBeUndefined();
  });

  it('carries on when the clean-up gets no answer', async () => {
    plugins.unregisterAll.mockRejectedValue(new Error('no answer'));
    const { tauriPlatform } = await load();
    await expect(tauriPlatform.init?.()).resolves.toBeUndefined();
  });
});
