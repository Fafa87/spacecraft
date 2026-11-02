import { canFullscreen } from '../input/orientation.js';
import { storage } from '../util/storage.js';

/**
 * iPhone Safari has no Fullscreen API for pages (Android gets fullscreen + landscape lock on the
 * first tap, see input/orientation.ts). The only way to lose the Safari bars on an iPhone is to
 * add the game to the home screen and launch it from the icon (standalone web app, our manifest +
 * apple-mobile-web-app-capable). This small, dismissible Polish hint explains how; dismissing it
 * is remembered.
 */
export const IOS_HINT_KEY = 'sms.iosHint.dismissed';

export interface IosEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** navigator.standalone (iOS) */
  standalone?: boolean;
  /** matchMedia('(display-mode: standalone|fullscreen)') */
  displayModeApp: boolean;
  /** the page can go fullscreen itself (feature-detected) — then the game just does that */
  fullscreenApi?: boolean;
}

/** iPhone / iPod / iPad (iPadOS reports itself as MacIntel with touch). */
export function isIos(env: Pick<IosEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  return (
    /iPad|iPhone|iPod/.test(env.userAgent) ||
    (env.platform === 'MacIntel' && env.maxTouchPoints > 1)
  );
}

/**
 * Pure rule (unit tested): iOS browser tab (not the home-screen app), no usable Fullscreen API
 * (if iPhone Safari ever ships one, the first tap goes fullscreen instead), not dismissed yet.
 */
export function shouldShowIosHint(env: IosEnv, dismissed: boolean): boolean {
  return isIos(env) && !env.standalone && !env.displayModeApp && !env.fullscreenApi && !dismissed;
}

function currentEnv(): IosEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    platform: nav.platform ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone,
    displayModeApp:
      matchMedia?.('(display-mode: standalone)').matches ||
      matchMedia?.('(display-mode: fullscreen)').matches ||
      false,
    fullscreenApi: canFullscreen(),
  };
}

export const IOS_HINT_TEXT =
  'Pełny ekran na iPhonie: w Safari stuknij <b>⋯</b> lub <b>Udostępnij</b> <span class="ios-share" aria-hidden="true">⬆︎</span> → <b>Do ekranu początkowego</b>, potem uruchamiaj grę z ikony.';
export const IOS_HINT_ALT =
  'Szybciej, ale częściowo: menu strony obok paska adresu → <b>Ukryj pasek narzędzi</b>.';

/** Shows the hint once per device until dismissed. Returns the element (or null). */
export function initIosInstallHint(root: HTMLElement = document.body): HTMLElement | null {
  if (!shouldShowIosHint(currentEnv(), storage.get(IOS_HINT_KEY, false))) return null;
  const el = document.createElement('div');
  el.className = 'ios-hint';
  el.setAttribute('role', 'note');
  el.innerHTML = `<span class="ios-hint-text">📱 ${IOS_HINT_TEXT}<small class="ios-hint-alt">${IOS_HINT_ALT}</small></span>
    <button class="ios-hint-ok" type="button">OK, nie pokazuj</button>
    <button class="ios-hint-close" type="button" aria-label="Zamknij">×</button>`;
  const dismiss = (remember: boolean) => {
    if (remember) storage.set(IOS_HINT_KEY, true);
    el.remove();
  };
  el.querySelector('.ios-hint-ok')!.addEventListener('click', () => dismiss(true));
  // Both buttons dismiss for good — the hint should never nag.
  el.querySelector('.ios-hint-close')!.addEventListener('click', () => dismiss(true));
  root.append(el);
  return el;
}
