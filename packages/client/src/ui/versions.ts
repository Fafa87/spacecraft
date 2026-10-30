import { GAME_VERSION } from '@sms/shared';
import { escapeHtml } from './format.js';

/** One entry of /spacecraft/versions.json (written by scripts/deploy-pages.ts). */
export interface VersionEntry {
  version: string;
  date: string;
  title: string;
  path: string;
}

/**
 * Site root of the Pages deploy: BASE_URL without a trailing `vX.Y.Z/` segment, so both the
 * latest build (/spacecraft/) and frozen builds (/spacecraft/v0.2.0/) find the same list.
 */
export function siteRoot(base = import.meta.env.BASE_URL): string {
  return base.replace(/v\d+\.\d+\.\d+\/?$/, '');
}

export async function loadVersions(): Promise<VersionEntry[]> {
  try {
    const r = await fetch(`${siteRoot()}versions.json`, { cache: 'no-cache' });
    if (!r.ok) return [];
    const j = (await r.json()) as { versions?: VersionEntry[] };
    return Array.isArray(j.versions) ? j.versions : [];
  } catch {
    return [];
  }
}

/** "Previous versions" link; expands into the list from versions.json (hidden if none). */
export function createVersionsLink(): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'versions';
  wrap.hidden = true;
  void loadVersions().then((list) => {
    const older = list.filter((v) => v.version !== GAME_VERSION);
    if (!older.length) return;
    wrap.hidden = false;
    wrap.innerHTML = ` · <a class="versions-link" role="button" tabindex="0">Previous versions</a><ul class="versions-list" hidden>${list
      .map(
        (v) =>
          `<li><a href="${escapeHtml(v.path)}">v${escapeHtml(v.version)}</a> — ${escapeHtml(v.title)} <span class="muted">(${escapeHtml(v.date)})</span>${v.version === GAME_VERSION ? ' <span class="tag you">CURRENT</span>' : ''}</li>`,
      )
      .join('')}</ul>`;
    const link = wrap.querySelector('.versions-link') as HTMLElement;
    const ul = wrap.querySelector('.versions-list') as HTMLElement;
    const toggle = () => (ul.hidden = !ul.hidden);
    link.addEventListener('click', toggle);
    link.addEventListener('keydown', (e) => e.key === 'Enter' && toggle());
  });
  return wrap;
}
