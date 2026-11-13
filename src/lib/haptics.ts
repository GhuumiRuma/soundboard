import { isIOS } from './device';

let iosSwitch: HTMLLabelElement | null = null;
let last = 0;

function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

/** A light tap on phones: Android through the Vibration API, iPhone (iOS 18 and later) through the native switch control. */
export function webHaptic(strength: 'light' | 'medium' = 'light') {
  const now = performance.now();
  if (now - last < 40) return;
  last = now;
  try {
    if (isIOS()) iosTick();
    else navigator.vibrate?.(strength === 'light' ? 8 : 18);
  } catch {
    // A tap is a nicety. If the phone says no, nothing is lost.
  }
}
