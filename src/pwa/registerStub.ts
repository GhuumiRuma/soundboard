/**
 * Stands in for the web app's update helper inside the Android and desktop apps, which have no service worker
 * (vite.config.ts points `virtual:pwa-register` here for those builds).
 */
export function registerSW(): (reload?: boolean) => Promise<void> {
  return async () => undefined;
}
