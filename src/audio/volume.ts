import { clamp01 } from '../model/rules';

/**
 * How loud a sound plays, from 0 (silent) to 1 (full). The sliders are straight lines, like StreamStudio's,
 * so 50% is half as strong a signal as 100%.
 */
export const gainFor = (volume: number): number => clamp01(volume, 0);

/** What a tap really plays at: the sound's own volume times the master volume. */
export const effectiveGain = (soundVolume: number, masterVolume: number): number => gainFor(soundVolume) * gainFor(masterVolume);

/** A volume as a whole percentage for the screen: 0.8 becomes 80. */
export const toPercent = (volume: number): number => Math.round(gainFor(volume) * 100);
