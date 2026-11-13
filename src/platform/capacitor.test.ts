import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The plugins only exist inside the Android app, so each one is replaced by a stand-in that records what it was asked to do.
const plugins = vi.hoisted(() => ({
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  deleteFile: vi.fn(),
  readdir: vi.fn(),
  getUri: vi.fn(),
  share: vi.fn(),
  impact: vi.fn(),
  setStyle: vi.fn(),
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    writeFile: plugins.writeFile,
    appendFile: plugins.appendFile,
    deleteFile: plugins.deleteFile,
    readdir: plugins.readdir,
    getUri: plugins.getUri,
  },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: plugins.share } }));
vi.mock('@capacitor/haptics', () => ({
  ImpactStyle: { Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' },
  Haptics: { impact: plugins.impact },
}));
vi.mock('@capacitor/core', () => ({
  SystemBars: { setStyle: plugins.setStyle },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);
const FAILED = "I couldn't save that file. Please try again.";

/** A fresh copy of the platform each time, because the tap throttle remembers when the last tap was. */
async function load() {
  vi.resetModules();
  const { capacitorPlatform } = await import('./capacitor');
  const { webPlatform } = await import('./web');
  return { capacitorPlatform, webPlatform };
}

function file(text: string | Uint8Array, fileName = 'Soundboard backup.zip') {
  return { fileName, mimeType: 'application/zip', data: new Blob([text as BlobPart]) };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  plugins.writeFile.mockResolvedValue({ uri: '' });
  plugins.appendFile.mockResolvedValue(undefined);
  plugins.deleteFile.mockResolvedValue(undefined);
  plugins.readdir.mockResolvedValue({ files: [] });
  plugins.getUri.mockImplementation(async ({ path }: { path: string }) => ({ uri: `file:///cache/${encodeURI(path)}` }));
  plugins.share.mockResolvedValue({});
  plugins.impact.mockResolvedValue(undefined);
  plugins.setStyle.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Android platform', () => {
  it('says it is the Android app', async () => {
    const { capacitorPlatform } = await load();
    expect(capacitorPlatform.kind).toBe('capacitor');
    expect(capacitorPlatform.os).toBe('android');
    expect(capacitorPlatform.isNativeApp).toBe(true);
  });

  it('keeps the window key events for sound keys, as a phone has no global keys', async () => {
    const { capacitorPlatform, webPlatform } = await load();
    expect(capacitorPlatform.soundKeys).toBe(webPlatform.soundKeys);
    expect(capacitorPlatform.soundKeys.global).toBe(false);
  });
});

describe('saveFile', () => {
  it('puts the file in the cache and opens the share sheet', async () => {
    const { capacitorPlatform } = await load();
    const outcome = await capacitorPlatform.saveFile({ ...file('hello'), title: 'Save your backup' });

    expect(outcome).toEqual({ status: 'shared' });
    expect(plugins.writeFile).toHaveBeenCalledTimes(1);
    expect(plugins.writeFile).toHaveBeenCalledWith({
      path: 'share/Soundboard backup.zip',
      data: btoa('hello'),
      directory: 'CACHE',
      recursive: true,
    });
    expect(plugins.appendFile).not.toHaveBeenCalled();
    expect(plugins.getUri).toHaveBeenCalledWith({ path: 'share/Soundboard backup.zip', directory: 'CACHE' });
    expect(plugins.share).toHaveBeenCalledWith({
      title: 'Save your backup',
      files: ['file:///cache/share/Soundboard%20backup.zip'],
      dialogTitle: 'Save your backup',
    });
  });

  it('titles the share sheet with the file name when there is no title', async () => {
    const { capacitorPlatform } = await load();
    await capacitorPlatform.saveFile(file('hello', 'Airhorn.ogg'));
    expect(plugins.share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Airhorn.ogg', dialogTitle: 'Airhorn.ogg' }));
  });

  it('writes a big file in pieces that add up to the original', async () => {
    const bytes = new Uint8Array(3 * 1024 * 1024 * 2 + 10).map((_, i) => i % 251);
    const { capacitorPlatform } = await load();
    const outcome = await capacitorPlatform.saveFile(file(bytes));

    expect(outcome).toEqual({ status: 'shared' });
    expect(plugins.writeFile).toHaveBeenCalledTimes(1);
    expect(plugins.appendFile).toHaveBeenCalledTimes(2);
    for (const call of plugins.appendFile.mock.calls) {
      expect(call[0]).toMatchObject({ path: 'share/Soundboard backup.zip', directory: 'CACHE' });
    }
    const pieces = [plugins.writeFile.mock.calls[0][0], ...plugins.appendFile.mock.calls.map((c) => c[0])].map((c) =>
      Buffer.from(c.data as string, 'base64'),
    );
    expect(Buffer.concat(pieces).equals(Buffer.from(bytes))).toBe(true);
  });

  it('can share an empty file', async () => {
    const { capacitorPlatform } = await load();
    expect(await capacitorPlatform.saveFile(file(''))).toEqual({ status: 'shared' });
    expect(plugins.writeFile).toHaveBeenCalledTimes(1);
    expect(plugins.appendFile).not.toHaveBeenCalled();
  });

  it('keeps the file inside the share folder whatever it is called', async () => {
    const { capacitorPlatform } = await load();
    await capacitorPlatform.saveFile(file('x', '../a/b:c*?.zip'));
    const { path } = plugins.writeFile.mock.calls[0][0];
    expect(path).toMatch(/^share\/[^/]+$/);
    expect(path).not.toContain('..');
    expect(path).not.toMatch(/[:*?]/);
  });

  it('gives a nameless file a name', async () => {
    const { capacitorPlatform } = await load();
    await capacitorPlatform.saveFile(file('x', '...'));
    expect(plugins.writeFile.mock.calls[0][0].path).toBe('share/Soundboard file');
  });

  it('says it was cancelled when the share sheet is closed without choosing', async () => {
    plugins.share.mockRejectedValue(new Error('Share canceled'));
    const { capacitorPlatform } = await load();
    expect(await capacitorPlatform.saveFile(file('hello'))).toEqual({ status: 'cancelled' });
  });

  it('fails in plain words when the share sheet cannot open', async () => {
    plugins.share.mockRejectedValue(new Error('Unable to do share'));
    const { capacitorPlatform } = await load();
    expect(await capacitorPlatform.saveFile(file('hello'))).toEqual({ status: 'failed', message: FAILED });
  });

  it('fails in plain words and removes the half-written file when the phone is out of space', async () => {
    plugins.appendFile.mockRejectedValue(new Error('No space left on device'));
    const { capacitorPlatform } = await load();
    const outcome = await capacitorPlatform.saveFile(file(new Uint8Array(3 * 1024 * 1024 + 1)));

    expect(outcome).toEqual({ status: 'failed', message: FAILED });
    expect(plugins.deleteFile).toHaveBeenCalledWith({ path: 'share/Soundboard backup.zip', directory: 'CACHE' });
    expect(plugins.share).not.toHaveBeenCalled();
  });

  it('still reports a failed write when removing the half-written file fails too', async () => {
    plugins.writeFile.mockRejectedValue(new Error('disk error'));
    plugins.deleteFile.mockRejectedValue(new Error('not there'));
    const { capacitorPlatform } = await load();
    expect(await capacitorPlatform.saveFile(file('hello'))).toEqual({ status: 'failed', message: FAILED });
  });

  it('clears out copies from earlier shares that are over a day old, and only those', async () => {
    plugins.readdir.mockResolvedValue({
      files: [
        { name: 'old.zip', type: 'file', size: 1, mtime: NOW - 25 * HOUR, uri: '' },
        { name: 'recent.zip', type: 'file', size: 1, mtime: NOW - 2 * HOUR, uri: '' },
        { name: 'folder', type: 'directory', size: 0, mtime: 0, uri: '' },
      ],
    });
    const { capacitorPlatform } = await load();
    expect(await capacitorPlatform.saveFile(file('hello'))).toEqual({ status: 'shared' });

    expect(plugins.readdir).toHaveBeenCalledWith({ path: 'share', directory: 'CACHE' });
    expect(plugins.deleteFile).toHaveBeenCalledTimes(1);
    expect(plugins.deleteFile).toHaveBeenCalledWith({ path: 'share/old.zip', directory: 'CACHE' });
  });

  it('shares even when the folder of earlier copies cannot be listed or cleared', async () => {
    plugins.readdir.mockRejectedValueOnce(new Error('Folder does not exist'));
    const { capacitorPlatform } = await load();
    expect(await capacitorPlatform.saveFile(file('hello'))).toEqual({ status: 'shared' });

    plugins.readdir.mockResolvedValueOnce({ files: [{ name: 'old.zip', type: 'file', size: 1, mtime: 0, uri: '' }] });
    plugins.deleteFile.mockRejectedValue(new Error('busy'));
    expect(await capacitorPlatform.saveFile(file('hello'))).toEqual({ status: 'shared' });
  });
});

describe('haptic', () => {
  it('gives a light tap by default and a firmer one for medium', async () => {
    const now = vi.spyOn(performance, 'now');
    const { capacitorPlatform } = await load();

    now.mockReturnValue(1000);
    capacitorPlatform.haptic();
    now.mockReturnValue(2000);
    capacitorPlatform.haptic('light');
    now.mockReturnValue(3000);
    capacitorPlatform.haptic('medium');

    expect(plugins.impact.mock.calls).toEqual([[{ style: 'LIGHT' }], [{ style: 'LIGHT' }], [{ style: 'MEDIUM' }]]);
  });

  it('skips a tap that comes right after another, so a drumroll does not pile up', async () => {
    const now = vi.spyOn(performance, 'now');
    const { capacitorPlatform } = await load();

    now.mockReturnValue(1000);
    capacitorPlatform.haptic();
    now.mockReturnValue(1039);
    capacitorPlatform.haptic();
    expect(plugins.impact).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1040);
    capacitorPlatform.haptic();
    expect(plugins.impact).toHaveBeenCalledTimes(2);
  });

  it('carries on quietly when the phone cannot vibrate', async () => {
    const { capacitorPlatform } = await load();
    const now = vi.spyOn(performance, 'now');

    plugins.impact.mockRejectedValue(new Error('Haptics unavailable'));
    now.mockReturnValue(1000);
    expect(() => capacitorPlatform.haptic()).not.toThrow();

    plugins.impact.mockImplementation(() => {
      throw new Error('Plugin is not implemented');
    });
    now.mockReturnValue(2000);
    expect(() => capacitorPlatform.haptic()).not.toThrow();

    // A rejection nobody caught would fail the whole test run once these have settled.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe('setTheme', () => {
  it('gives the status and navigation bars icons that show up on the look the app is using', async () => {
    const { capacitorPlatform } = await load();

    capacitorPlatform.setTheme?.('dark');
    capacitorPlatform.setTheme?.('light');

    // "Dark" means light icons for a dark background, and "Light" means dark icons for a light one.
    expect(plugins.setStyle.mock.calls).toEqual([[{ style: 'DARK' }], [{ style: 'LIGHT' }]]);
  });

  it('carries on quietly when the bars cannot be restyled', async () => {
    plugins.setStyle.mockRejectedValue(new Error('Not implemented'));
    const { capacitorPlatform } = await load();
    expect(() => capacitorPlatform.setTheme?.('dark')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
