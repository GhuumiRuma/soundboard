import { describe, expect, it, vi } from 'vitest';
import { createPwa, HINT_KEY, readHintDismissed, type HintStorage, type InstallOffer } from './state';

function fakeStorage(initial: Record<string, string> = {}): HintStorage & { values: Record<string, string> } {
  const values = { ...initial };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
  };
}

function fakeOffer(outcome: 'accepted' | 'dismissed' = 'accepted'): InstallOffer & { prompt: ReturnType<typeof vi.fn> } {
  return { prompt: vi.fn(async () => undefined), userChoice: Promise.resolve({ outcome }) };
}

describe('the update bar', () => {
  it('starts quiet', () => {
    const pwa = createPwa(null);
    expect(pwa.store.getState()).toMatchObject({ updateReady: false, updateLater: false });
  });

  it('shows when a new version is ready, and "Later" hides it for this visit', () => {
    const pwa = createPwa(null);
    pwa.updateIsReady();
    expect(pwa.store.getState()).toMatchObject({ updateReady: true, updateLater: false });
    pwa.updateLater();
    expect(pwa.store.getState()).toMatchObject({ updateReady: true, updateLater: true });
  });

  it('comes back if another new version arrives after "Later"', () => {
    const pwa = createPwa(null);
    pwa.updateIsReady();
    pwa.updateLater();
    pwa.updateIsReady();
    expect(pwa.store.getState().updateLater).toBe(false);
  });

  it('asks the waiting version to take over, and reloads the page', async () => {
    const pwa = createPwa(null);
    const updater = vi.fn(async () => undefined);
    pwa.setUpdater(updater);
    await pwa.applyUpdate();
    expect(updater).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('does nothing when there is no updater (the Android and desktop apps)', async () => {
    await expect(createPwa(null).applyUpdate()).resolves.toBeUndefined();
  });
});

describe('the install offer', () => {
  it('keeps the browser offer until she uses it', () => {
    const pwa = createPwa(null);
    const offer = fakeOffer();
    pwa.offerInstall(offer);
    expect(pwa.store.getState().installOffer).toBe(offer);
  });

  it('shows the browser question once and uses the offer up', async () => {
    const pwa = createPwa(null);
    const offer = fakeOffer('accepted');
    pwa.offerInstall(offer);
    await expect(pwa.promptInstall()).resolves.toBe('accepted');
    expect(offer.prompt).toHaveBeenCalledTimes(1);
    expect(pwa.store.getState().installOffer).toBeNull();
    await expect(pwa.promptInstall()).resolves.toBe('unavailable');
    expect(offer.prompt).toHaveBeenCalledTimes(1);
  });

  it('reports when she turns it down', async () => {
    const pwa = createPwa(null);
    pwa.offerInstall(fakeOffer('dismissed'));
    await expect(pwa.promptInstall()).resolves.toBe('dismissed');
  });

  it('copes with a browser that refuses to show the question', async () => {
    const pwa = createPwa(null);
    const offer = fakeOffer();
    offer.prompt.mockRejectedValue(new Error('Needs a tap'));
    pwa.offerInstall(offer);
    await expect(pwa.promptInstall()).resolves.toBe('dismissed');
    expect(pwa.store.getState().installOffer).toBeNull();
  });

  it('has nothing to show when the browser made no offer', async () => {
    await expect(createPwa(null).promptInstall()).resolves.toBe('unavailable');
  });

  it('remembers that it was installed, and drops the offer', () => {
    const pwa = createPwa(null);
    pwa.offerInstall(fakeOffer());
    pwa.wasInstalled();
    expect(pwa.store.getState()).toMatchObject({ installed: true, installOffer: null });
  });
});

describe('the install note being dismissed', () => {
  it('is remembered on this device', () => {
    const storage = fakeStorage();
    const pwa = createPwa(storage);
    expect(pwa.store.getState().hintDismissed).toBe(false);
    pwa.dismissHint();
    expect(pwa.store.getState().hintDismissed).toBe(true);
    expect(storage.values[HINT_KEY]).toBe('dismissed');
    expect(createPwa(storage).store.getState().hintDismissed).toBe(true);
  });

  it('works for this visit even when the browser will not save it', () => {
    const storage: HintStorage = {
      getItem: () => {
        throw new Error('Blocked');
      },
      setItem: () => {
        throw new Error('Blocked');
      },
    };
    const pwa = createPwa(storage);
    expect(pwa.store.getState().hintDismissed).toBe(false);
    pwa.dismissHint();
    expect(pwa.store.getState().hintDismissed).toBe(true);
  });

  it('only counts the value it wrote', () => {
    expect(readHintDismissed(fakeStorage({ [HINT_KEY]: 'dismissed' }))).toBe(true);
    expect(readHintDismissed(fakeStorage({ [HINT_KEY]: 'yes' }))).toBe(false);
    expect(readHintDismissed(fakeStorage())).toBe(false);
    expect(readHintDismissed(null)).toBe(false);
  });
});
