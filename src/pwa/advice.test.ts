import { describe, expect, it } from 'vitest';
import { installAdvice, type InstallFacts } from './advice';

const base: InstallFacts = {
  os: 'windows',
  iosSafari: false,
  standalone: false,
  nativeApp: false,
  canPrompt: false,
  installed: false,
  dismissed: false,
};

const facts = (changes: Partial<InstallFacts>): InstallFacts => ({ ...base, ...changes });

describe('installAdvice', () => {
  it('has nothing to say inside the Android and desktop apps', () => {
    expect(installAdvice(facts({ nativeApp: true, canPrompt: true }))).toEqual({ help: null, note: false });
    expect(installAdvice(facts({ nativeApp: true, os: 'ios' }))).toEqual({ help: null, note: false });
  });

  it('says it is installed when it was opened from the Home Screen or the app icon', () => {
    expect(installAdvice(facts({ standalone: true, os: 'ios', iosSafari: true }))).toEqual({ help: 'installed', note: false });
    expect(installAdvice(facts({ standalone: true, canPrompt: true }))).toEqual({ help: 'installed', note: false });
  });

  it('says it is installed right after she installs it', () => {
    expect(installAdvice(facts({ installed: true }))).toEqual({ help: 'installed', note: false });
  });

  it('offers the Install button and a note when the browser can install it', () => {
    expect(installAdvice(facts({ canPrompt: true }))).toEqual({ help: 'button', note: true });
    expect(installAdvice(facts({ canPrompt: true, os: 'android' }))).toEqual({ help: 'button', note: true });
  });

  it('shows the Share steps on iPhone and iPad, in a note too', () => {
    expect(installAdvice(facts({ os: 'ios', iosSafari: true }))).toEqual({ help: 'ios', note: true });
  });

  it('points other iPhone browsers at Safari', () => {
    expect(installAdvice(facts({ os: 'ios', iosSafari: false }))).toEqual({ help: 'ios-browser', note: true });
  });

  it('gives the menu steps on Android and computers, without a note', () => {
    expect(installAdvice(facts({ os: 'android' }))).toEqual({ help: 'android', note: false });
    expect(installAdvice(facts({ os: 'windows' }))).toEqual({ help: 'computer', note: false });
    expect(installAdvice(facts({ os: 'mac' }))).toEqual({ help: 'computer', note: false });
    expect(installAdvice(facts({ os: 'other' }))).toEqual({ help: 'computer', note: false });
  });

  it('keeps the note away once she has dismissed it, but not the help in Settings', () => {
    expect(installAdvice(facts({ canPrompt: true, dismissed: true }))).toEqual({ help: 'button', note: false });
    expect(installAdvice(facts({ os: 'ios', iosSafari: true, dismissed: true }))).toEqual({ help: 'ios', note: false });
  });

  it('prefers the Install button over the manual steps when both are possible', () => {
    expect(installAdvice(facts({ os: 'ios', iosSafari: true, canPrompt: true })).help).toBe('button');
  });
});
