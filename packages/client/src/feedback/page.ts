import {
  GAME_VERSION,
  makePetitionId,
  nameProblem,
  nameProblemMessage,
  sanitizeName,
  type PetitionCard,
  type PetitionCategory,
  type PetitionVoteValue,
} from '@sms/shared';
import { DEV_PREVIEW } from '../devPreview.js';
import { HttpError } from '../highscores/HttpHighscoreStore.js';
import { escapeHtml as esc, formatDate } from '../ui/format.js';
import { storage } from '../util/storage.js';
import { PetitionStore, sortPetitions, type CategoryFilter } from './store.js';

const NAME_KEY = 'sms.name';
const VOTER_KEY = 'sms.voterId';

const CAT_LABEL: Record<PetitionCategory, string> = {
  bugs: 'Błędy',
  balance: 'Balans',
  ideas: 'Pomysły',
};

const TABS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'bugs', label: CAT_LABEL.bugs },
  { id: 'balance', label: CAT_LABEL.balance },
  { id: 'ideas', label: CAT_LABEL.ideas },
];

export type SortMode = 'score' | 'newest';

function voterId(): string {
  let id = storage.get<string>(VOTER_KEY, '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
    storage.set(VOTER_KEY, id.toLowerCase());
  }
  return id.toLowerCase();
}

function gameVersionStamp(): string {
  return DEV_PREVIEW ? `${GAME_VERSION}-dev` : GAME_VERSION;
}

function sourceStamp(): 'dev' | 'live' {
  return DEV_PREVIEW ? 'dev' : 'live';
}

function problemPl(error: string): string {
  switch (error) {
    case 'BAD_TITLE':
      return 'Tytuł: 1–80 znaków.';
    case 'BAD_BODY':
      return 'Treść: 1–1500 znaków.';
    case 'BAD_NAME': {
      const raw = storage.get(NAME_KEY, '');
      const p = nameProblem(sanitizeName(raw) || 'x');
      return p ? nameProblemMessage(p) : 'Podaj wezwanie (callsign).';
    }
    case 'BAD_CATEGORY':
      return 'Wybierz kategorię.';
    default:
      return 'Petycja odrzucona — sprawdź pola.';
  }
}

function cardHtml(c: PetitionCard): string {
  const done = c.status === 'done' ? '<span class="badge done">Załatwione</span>' : '';
  const dev = c.source === 'dev' ? '<span class="badge dev">dev</span>' : '';
  return `<article class="card" data-id="${esc(c.id)}">
  <div class="votes">
    <button type="button" class="up${c.myVote === 1 ? ' active-up' : ''}" data-vote="1" aria-label="Za" title="Za">▲</button>
    <div class="score">${c.score}</div>
    <button type="button" class="down${c.myVote === -1 ? ' active-down' : ''}" data-vote="-1" aria-label="Przeciw" title="Przeciw">▼</button>
  </div>
  <div>
    <h3>${esc(c.title)} ${done}${dev}</h3>
    <p class="body">${esc(c.body)}</p>
    <div class="meta">
      <span>${esc(c.name)}</span>
      <span>${esc(formatDate(c.createdAt))}</span>
      <span>v${esc(c.gameVersion)}</span>
      <span class="badge">${esc(CAT_LABEL[c.category])}</span>
    </div>
  </div>
</article>`;
}

export function mountFeedback(root: HTMLElement, store: PetitionStore | null): void {
  let category: CategoryFilter = 'all';
  let sort: SortMode = 'score';
  let cards: PetitionCard[] = [];
  let busy = false;
  const vid = voterId();

  root.innerHTML = `
<header class="top">
  <div class="nav-row">
    <a class="back" href="./">← WRÓĆ DO GRY</a>
    <a class="back" href="rules.html">ZASADY</a>
  </div>
  <h1>Vox Relay <span>· Petycje do kapituły</span></h1>
  <p class="muted">Zgłoś błąd, uwagi do balansu albo pomysł. Głosuj — jeden głos na petycję z tej przeglądarki. v${esc(GAME_VERSION)}${DEV_PREVIEW ? ` · podgląd ${esc(DEV_PREVIEW)}` : ''}</p>
</header>
<div class="tabs" role="tablist">
  ${TABS.map(
    (t) =>
      `<button type="button" class="tab${t.id === category ? ' active' : ''}" data-cat="${t.id}">${t.label}</button>`,
  ).join('')}
</div>
<div class="toolbar">
  <button type="button" class="sort active" data-sort="score">Najwyżej oceniane</button>
  <button type="button" class="sort" data-sort="newest">Najnowsze</button>
  <button type="button" class="btn primary" id="compose">Złóż petycję</button>
</div>
<div class="status-line" id="status">Ładowanie kanału Vox…</div>
<div class="form-panel hidden" id="form">
  <h2>Nowa petycja</h2>
  <div class="form-row"><label for="f-cat">Kategoria</label>
    <select id="f-cat">${(Object.keys(CAT_LABEL) as PetitionCategory[])
      .map((k) => `<option value="${k}">${CAT_LABEL[k]}</option>`)
      .join('')}</select></div>
  <div class="form-row"><label for="f-title">Tytuł</label>
    <input id="f-title" maxlength="80" autocomplete="off" spellcheck="true" /></div>
  <div class="form-row"><label for="f-body">Treść</label>
    <textarea id="f-body" maxlength="1500"></textarea></div>
  <div class="form-row"><label for="f-name">Wezwanie (callsign)</label>
    <input id="f-name" maxlength="16" autocomplete="nickname" spellcheck="false" /></div>
  <div class="form-error" id="f-err"></div>
  <div class="form-actions">
    <button type="button" class="btn primary" id="f-submit">Wyślij na Vox</button>
    <button type="button" class="btn" id="f-cancel">Anuluj</button>
  </div>
</div>
<div class="list" id="list"></div>
<footer>Nieoficjalny, niekomercyjny projekt fanowski. Nie jest powiązany z Games Workshop. Moderacja: status petycji w konsoli Firebase (done / hidden).</footer>`;

  const statusEl = root.querySelector('#status') as HTMLElement;
  const listEl = root.querySelector('#list') as HTMLElement;
  const formEl = root.querySelector('#form') as HTMLElement;
  const nameInput = root.querySelector('#f-name') as HTMLInputElement;
  nameInput.value = storage.get(NAME_KEY, '');

  const setStatus = (msg: string, error = false) => {
    statusEl.textContent = msg;
    statusEl.classList.toggle('error', error);
  };

  const renderList = () => {
    const shown = sortPetitions(cards, category, sort);
    if (!store) {
      listEl.innerHTML =
        '<div class="empty">Kanał Vox nie jest skonfigurowany (brak Firebase w tej kompilacji).</div>';
      return;
    }
    if (!shown.length) {
      const empty =
        category === 'all'
          ? 'Brak petycji. Bądź pierwszy — złóż petycję.'
          : `Brak petycji w kategorii „${esc(CAT_LABEL[category])}”. Bądź pierwszy — złóż petycję.`;
      listEl.innerHTML = `<div class="empty">${empty}</div>`;
      return;
    }
    listEl.innerHTML = shown.map(cardHtml).join('');
  };

  const refresh = async () => {
    if (!store) {
      setStatus('Firebase nie skonfigurowany — petycje niedostępne.', true);
      renderList();
      return;
    }
    setStatus('Ładowanie kanału Vox…');
    try {
      cards = await store.list(vid);
      setStatus(
        cards.length
          ? `Odebrano ${cards.length} petycji. Głosuj lub złóż własną.`
          : 'Kanał milczy — złóż pierwszą petycję.',
      );
      renderList();
    } catch (err) {
      const msg =
        err instanceof HttpError
          ? err.status === 403
            ? 'Vox odrzucony (403) — reguły Firestore nie obejmują jeszcze petycji. Trzeba je opublikować.'
            : `Nie udało się połączyć z Vox (${err.status}).`
          : 'Nie udało się połączyć z Vox (sieć).';
      setStatus(msg, true);
      listEl.innerHTML = `<div class="empty">${esc(msg)}</div>`;
    }
  };

  root.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      category = ((btn as HTMLElement).dataset.cat || 'all') as CategoryFilter;
      root.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      if (category !== 'all') {
        (root.querySelector('#f-cat') as HTMLSelectElement).value = category;
      }
      renderList();
    });
  });

  root.querySelectorAll('.sort').forEach((btn) => {
    btn.addEventListener('click', () => {
      sort = (btn as HTMLElement).dataset.sort as SortMode;
      root.querySelectorAll('.sort').forEach((b) => b.classList.toggle('active', b === btn));
      renderList();
    });
  });

  root.querySelector('#compose')!.addEventListener('click', () => {
    formEl.classList.remove('hidden');
    if (category !== 'all') {
      (root.querySelector('#f-cat') as HTMLSelectElement).value = category;
    }
    (root.querySelector('#f-title') as HTMLInputElement).focus();
  });
  root.querySelector('#f-cancel')!.addEventListener('click', () => {
    formEl.classList.add('hidden');
    (root.querySelector('#f-err') as HTMLElement).textContent = '';
  });

  root.querySelector('#f-submit')!.addEventListener('click', async () => {
    if (!store || busy) return;
    const errEl = root.querySelector('#f-err') as HTMLElement;
    errEl.textContent = '';
    const cat = (root.querySelector('#f-cat') as HTMLSelectElement).value as PetitionCategory;
    const title = (root.querySelector('#f-title') as HTMLInputElement).value;
    const body = (root.querySelector('#f-body') as HTMLTextAreaElement).value;
    const name = sanitizeName(nameInput.value) || 'Marine';
    const np = nameProblem(name);
    if (np) {
      errEl.textContent = nameProblemMessage(np);
      return;
    }
    storage.set(NAME_KEY, name);
    busy = true;
    try {
      await store.create({
        id: makePetitionId(),
        category: cat,
        title,
        body,
        name,
        gameVersion: gameVersionStamp(),
        source: sourceStamp(),
      });
      formEl.classList.add('hidden');
      (root.querySelector('#f-title') as HTMLInputElement).value = '';
      (root.querySelector('#f-body') as HTMLTextAreaElement).value = '';
      if (category !== 'all') {
        category = cat;
        root.querySelectorAll('.tab').forEach((b) =>
          b.classList.toggle('active', (b as HTMLElement).dataset.cat === cat),
        );
      }
      await refresh();
      setStatus('Petycja przyjęta na Vox Relay.');
    } catch (err) {
      const detail =
        err instanceof HttpError
          ? err.status === 403
            ? 'Odrzucono (403) — opublikuj reguły Firestore z petycjami.'
            : err.message.includes('invalid petition')
              ? problemPl(err.message.replace(/^.*invalid petition:\s*/, ''))
              : `Nie wysłano (${err.status}).`
          : 'Błąd sieci przy wysyłaniu.';
      errEl.textContent = detail;
    } finally {
      busy = false;
    }
  });

  listEl.addEventListener('click', async (ev) => {
    const t = ev.target as HTMLElement;
    const btn = t.closest('button[data-vote]') as HTMLElement | null;
    if (!btn || !store || busy) return;
    const card = btn.closest('.card') as HTMLElement | null;
    const id = card?.dataset.id;
    if (!id) return;
    const want = Number(btn.dataset.vote) as 1 | -1;
    const cur = cards.find((c) => c.id === id);
    if (!cur) return;
    // Same button again → clear (0); otherwise set ±1.
    const next: PetitionVoteValue = cur.myVote === want ? 0 : want;
    busy = true;
    try {
      await store.cast(id, vid, next);
      // Optimistic local update; then refresh for truth.
      const idx = cards.findIndex((c) => c.id === id);
      if (idx >= 0) {
        const prev = cards[idx]!.myVote;
        let { up, down } = cards[idx]!;
        if (prev === 1) up--;
        if (prev === -1) down--;
        if (next === 1) up++;
        if (next === -1) down++;
        cards[idx] = {
          ...cards[idx]!,
          myVote: next,
          up,
          down,
          score: up - down,
        };
        renderList();
      }
    } catch (err) {
      const msg =
        err instanceof HttpError && err.status === 403
          ? 'Głos odrzucony (403) — reguły Firestore bez petycji.'
          : 'Nie udało się oddać głosu.';
      setStatus(msg, true);
    } finally {
      busy = false;
    }
  });

  void refresh();
}
