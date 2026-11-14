import { describe, expect, it } from 'vitest';
import { keepingClipText, longFileNotice, openingText, placedText, placeText } from './messages';

describe('what the clipper says', () => {
  it('tells her which file is being opened', () => {
    expect(openingText('boss fight.mp4')).toBe('Opening “boss fight.mp4”…');
  });

  it('says how much of the file is kept', () => {
    expect(keepingClipText(3200, 125_000)).toBe('Keeping 3.2 seconds of 2:05');
    expect(keepingClipText(0, 0)).toBe('Keeping 0.0 seconds of 0:00');
  });

  it('shows the whole file to the tenth when it is not a whole second, so what is kept never looks longer', () => {
    expect(keepingClipText(5900, 5900)).toBe('Keeping 5.9 seconds of 0:05.9');
    expect(keepingClipText(3000, 125_300)).toBe('Keeping 3.0 seconds of 2:05.3');
    expect(keepingClipText(30_000, 30_040)).toBe('Keeping 30.0 seconds of 0:30');
  });

  it('says where a handle is in words a screen reader can speak', () => {
    expect(placeText(7500)).toBe('7.5 seconds');
    expect(placeText(0)).toBe('0.0 seconds');
    expect(placeText(60_000)).toBe('1 minute 0.0 seconds');
    expect(placeText(125_300)).toBe('2 minutes 5.3 seconds');
    expect(placeText(119_999.9)).toBe('1 minute 59.9 seconds');
  });

  it('says where Start or End was put', () => {
    expect(placedText('start', 7500)).toBe('Start is now at 7.5 seconds.');
    expect(placedText('end', 125_300)).toBe('End is now at 2 minutes 5.3 seconds.');
  });

  it('copes with a place that makes no sense', () => {
    expect(placeText(-5)).toBe('0.0 seconds');
    expect(placeText(Number.NaN)).toBe('0.0 seconds');
    expect(placeText(Number.POSITIVE_INFINITY)).toBe('0.0 seconds');
  });

  it('tells her how to pick the rest of a long file, using how long it is', () => {
    const notice = longFileNotice(125_000);
    expect(notice.kind).toBe('hint');
    expect(notice.text).toContain('2:05');
    expect(notice.text).toContain('Start here');
    expect(notice.text).toContain('End here');
  });
});
