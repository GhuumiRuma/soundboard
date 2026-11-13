export type DeviceOs = 'ios' | 'android' | 'windows' | 'mac' | 'other';

const nav = (): Navigator | null => (typeof navigator === 'undefined' ? null : navigator);

/** iPhone, iPad and iPod. Recent iPads say they are Macs, so a Mac with a touch screen counts as an iPad. */
export function isIOS(): boolean {
  const n = nav();
  if (!n) return false;
  return /iPad|iPhone|iPod/.test(n.userAgent) || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return /Android/i.test(nav()?.userAgent ?? '');
}

export function detectOs(): DeviceOs {
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  const ua = nav()?.userAgent ?? '';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac';
  return 'other';
}

/** True when the app was opened from the Home Screen or the installed-app icon rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return nav()?.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** Safari on iPhone or iPad (not Chrome or Firefox for iOS, which can't add to the Home Screen the same way). */
export function isIOSSafari(): boolean {
  const ua = nav()?.userAgent ?? '';
  return isIOS() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua);
}

/** A phone or tablet, where the share sheet is the natural way to keep a file. */
export function isTouchDevice(): boolean {
  const n = nav();
  return !!n && (isIOS() || isAndroid() || n.maxTouchPoints > 1);
}

/** Safari before 18.4 cannot play Ogg sounds. Everything else can. */
export function canPlayOgg(): boolean {
  if (typeof Audio === 'undefined') return true;
  try {
    return new Audio().canPlayType('audio/ogg; codecs="vorbis"') !== '';
  } catch {
    return true;
  }
}
