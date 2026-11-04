/** Rules & instructions (Polish), plus the generated compendium. */
import {
  GAME_VERSION,
  MARINE_DEFLECTION,
  MARINE_DIRECTIONAL_ARMOUR,
  MARINE_SPRINT,
  MAX_PLAYERS,
  PLAYER,
  enemyProjectileDeflectChances,
  leaderboardBoard,
  type ContentRegistry,
} from '@sms/shared';
import { escapeHtml as esc } from '../ui/format.js';
import { compendiumHtml } from './compendium.js';

export function rulesHtml(c: ContentRegistry): string {
  const ws = c.weaponOrder;
  const start = ws
    .filter((w) => w.unlockAtSec === 0)
    .map((w) => esc(w.name))
    .join(', ');
  const unlocks = ws
    .filter((w) => w.unlockAtSec)
    .map((w) => `<li><b>${esc(w.name)}</b> — po ${w.unlockAtSec} s przetrwania</li>`)
    .join('');
  const boss = c.enemy(c.director.bosses.enemy).name;
  const d = c.director;
  const A = MARINE_DIRECTIONAL_ARMOUR;
  const SP = MARINE_SPRINT;
  const sec = (v: number) => `${String(Number(v.toFixed(2))).replace('.', ',')} s`;
  const pc = (v: number) => `${Math.round(v * 100)}%`;
  const mul = (v: number) => `×${String(v).replace('.', ',')}`;
  const defl = enemyProjectileDeflectChances(c.enemies.values());
  const shooters = [...c.enemies.values()].filter(
    (e) => e.ranged && defl[e.ranged.projectile.kind],
  );
  const deflList = shooters
    .map((e) => `<b>${esc(e.name)}</b> ${pc(defl[e.ranged!.projectile.kind]!)}`)
    .join(', ');
  const noDefl = [...c.enemies.values()]
    .filter((e) => e.ranged && !defl[e.ranged.projectile.kind])
    .map((e) => esc(e.name))
    .join(', ');
  return `
<header class="top">
  <a class="back" href="./">← WRÓĆ DO GRY</a>
  <h1>${esc(c.title)} <span>· zasady</span></h1>
  <p class="muted">Wersja v${GAME_VERSION}</p>
</header>
<nav class="toc">
  <a href="#cel">Cel</a><a href="#sterowanie">Sterowanie</a><a href="#sprint">Sprint</a><a href="#tryby">Tryby</a><a href="#multi">Multiplayer</a><a href="#bron">Broń</a><a href="#pancerz">Pancerz</a><a href="#wrogowie">Tyranidzi</a><a href="#punkty">Punkty</a><a href="#rady">Rady</a><a href="#kompendium">Kompendium</a>
</nav>
<section id="cel"><h2>Cel gry</h2>
  <p>Jesteś Space Marine broniącym zrujnowanej iglicy ula. Tyranidzi atakują <b>falami</b> z wyłomów w ścianach i szybów w podłodze. Następna fala rusza dopiero, gdy zginie cała poprzednia (po ${d.waves.breather} s przerwy). Każda fala jest większa, a potwory mają więcej życia. Co ${d.bosses.everyWave}. fala od ${d.bosses.firstWave}. prowadzi boss — <b>${esc(boss)}</b>.</p>
  <p>Gra kończy się, gdy padnie cały oddział. Liczy się czas przetrwania i punkty za zabicia.</p>
</section>
<section id="sterowanie"><h2>Sterowanie</h2>
  <div class="two">
    <div><h3>Komputer</h3><ul>
      <li><b>WASD / strzałki</b> — ruch</li>
      <li><b>Mysz</b> — celowanie</li>
      <li><b>Lewy przycisk / Spacja</b> — strzał (przytrzymaj przy broni automatycznej)</li>
      <li><b>1–${ws.length}</b>, <b>Q / E</b>, <b>kółko myszy</b> — zmiana broni</li>
      <li><b>Shift</b> (przytrzymaj) — sprint</li>
      <li><b>R</b> — przeładowanie</li>
      <li><b>M</b> — wycisz dźwięk</li>
      <li><b>Esc</b> — menu / wyjście (w grze solo pauza)</li>
    </ul></div>
    <div><h3>Telefon / tablet</h3><ul>
      <li><b>Lewy kciuk</b> (lewa połowa ekranu) — ruch</li>
      <li><b>Prawy kciuk</b> — celowanie i automatyczny ogień</li>
      <li><b>Sprint lewym kciukiem</b> — wypchnij drążek ruchu poza jego okrąg, do zewnętrznego pierścienia „» SPRINT” (zapala się na złoto); sprintujesz, dopóki trzymasz kciuk w pierścieniu, cofnięcie do środka kończy sprint</li>
      <li><b>» SPRINT</b> (prawy dolny róg) — albo dotknij prawym kciukiem, żeby włączyć sprint; dotknij znowu albo puść drążek ruchu, żeby wyłączyć</li>
      <li><b>Dotknij ikony broni</b> — zmiana broni</li>
      <li><b>⟳</b> — przeładowanie, <b>🔊</b> — dźwięk, <b>⏸</b> — menu</li>
      <li><b>⛶</b> — pełny ekran (Android). Na iPhonie: Udostępnij → „Do ekranu początkowego”, potem uruchamiaj grę z ikony.</li>
      <li>Najlepiej grać poziomo.</li>
    </ul></div>
  </div>
</section>
<section id="sprint"><h2>Sprint</h2>
  <p>Marine może na chwilę rzucić się biegiem: <b>${mul(SP.speedMul)}</b> zwykłej prędkości (${Math.round(PLAYER.speed * SP.speedMul)} px/s — ciężar broni nie spowalnia sprintu). Sprint zaczyna się od razu, ale <b>w biegu nie da się strzelać</b> — spust jest ignorowany i nie przerywa sprintu.</p>
  <ul>
    <li><b>Kondycja</b>: ${sec(SP.staminaMaxS)} sprintu (pasek pod marine). Kończy się sama przy zerze; ponownie ruszysz dopiero, gdy będzie co najmniej ${sec(SP.minToStartS)}.</li>
    <li>Kondycja wraca <b>tylko, gdy stoisz w miejscu</b> — pełna po ${sec(SP.staminaMaxS / SP.regenStandingPerS)}. Zwykły marsz jej nie odnawia.</li>
    <li>Po sprincie broń jest gotowa dopiero po <b>${sec(SP.weaponReadyDelayS)}</b> (złoty pasek „READY…” na ikonie broni). Broń półautomatyczną trzeba wtedy nacisnąć ponownie.</li>
    <li>W sprincie marine patrzy tam, dokąd biegnie — <b>uciekając, nadstawiasz plecy</b> (tylny pancerz ${mul(A.rear)}).</li>
    <li>Nie da się sprintować, podnosząc brata (w promieniu ${PLAYER.reviveRadius} px od powalonego).</li>
    <li>W sprincie marine zarzuca broń na plecy i biegnie z pustymi rękami; po sprincie widać, jak ją podnosi.</li>
    <li>Sprint innych graczy widać po kurzu i smugach za marine.</li>
  </ul>
</section>
<section id="tryby"><h2>Tryby gry</h2><ul>
  <li><b>SOLO DEPLOY</b> — samotna obrona. Esc pauzuje grę.</li>
  <li><b>HOST SQUAD (CO-OP)</b> — zakładasz pokój i zapraszasz do ${MAX_PLAYERS} marines łącznie.</li>
  <li><b>JOIN</b> — dołączasz kodem pokoju.</li>
  <li>Wybierz <b>CALLSIGN</b> (pseudonim) i <b>CHAPTER</b> (barwy zakonu) przed startem.</li>
</ul></section>
<section id="multi"><h2>Jak zagrać ze znajomymi</h2><ol>
  <li>Jedna osoba klika <b>HOST SQUAD</b> — pojawia się kod pokoju, link i kod QR.</li>
  <li>Pozostali skanują QR, otwierają link albo wpisują kod w polu <b>ROOM CODE</b> i klikają <b>JOIN</b>.</li>
  <li>Gdy wszyscy są w pokoju, host startuje misję.</li>
  <li>Gra wymaga internetu (łączenie graczy). Działa też na danych komórkowych.</li>
  <li>Jeśli host wyjdzie, pokój się zamyka.</li>
</ol>
<p><b>Więcej graczy = trudniej</b>: więcej wrogów, szybszy napływ, więcej elit i bossów, potwory mają więcej życia. Dokładne mnożniki są w kompendium.</p>
<p><b>Ranny brat</b>: marine z zerowym życiem pada i czeka na pomoc. Stań obok niego (do ${PLAYER.reviveRadius} px) przez ${PLAYER.reviveTime} s, a wstanie z ${Math.round(PLAYER.reviveHpFraction * 100)}% życia. Ma na to ${PLAYER.bleedOutTime} s — potem ginie.</p>
</section>
<section id="bron"><h2>Broń</h2>
  <p>Na start masz: <b>${start}</b>. Kolejne bronie odblokowują się wszystkim z czasem:</p><ul>${unlocks}</ul>
  <p>Dodatkowo na mapie spadają <b>skrzynie z bronią</b>, a z zabitych Tyranidów — <b>apteczki</b>. Każda broń ma rolę: ANTI-HORDE na roje drobnicy, ANTI-ELITE/ANTI-TANK na duże bestie.</p>
  <ul>
    <li><b>Strzelanie spowalnia</b>: ciężka broń spowalnia zawsze, a przy wciśniętym spuście jeszcze bardziej.</li>
    <li><b>Zaparcie</b>: niektóre ciężkie bronie, gdy stoisz w miejscu, strzelają szybciej i celniej.</li>
    <li><b>Plazma się grzeje</b>: powyżej kreski strzały są przeładowane (mocniejsze), na szczycie broń się przegrzewa i rani strzelca.</li>
    <li><b>Siła vs Wytrzymałość i pancerz</b>: lekka broń odbija się od pancerza Carnifexa, Meltagun przebija wszystko.</li>
  </ul>
</section>
<section id="pancerz"><h2>Pancerz kierunkowy</h2>
  <p>Pancerz wspomagany najlepiej chroni z przodu. <b>Przód to kierunek, w którym celujesz</b> (mysz albo prawy kciuk; gdy na telefonie tylko idziesz — kierunek marszu; w sprincie — kierunek biegu). Liczy się, skąd przychodzi atak: przy ciosie wręcz i szarży — gdzie stoi potwór, przy pocisku — skąd nadleciał, przy wybuchu — gdzie jest jego środek.</p>
  <ul>
    <li><b>Przód</b> (±${A.frontArcDeg}° od kierunku celowania) — obrażenia <b>${mul(A.front)}</b></li>
    <li><b>Boki</b> — obrażenia <b>${mul(A.side)}</b></li>
    <li><b>Tył</b> (±${A.rearArcDeg}° od pleców) — obrażenia <b>${mul(A.rear)}</b></li>
  </ul>
  <p><b>Rykoszet</b>: pocisk Tyranida, który trafi w przedni pancerz, może się od niego odbić — nie zadaje wtedy obrażeń, a od marine sypią się iskry. Najsłabsze pociski odbijają się w ${pc(MARINE_DEFLECTION.maxChance)} przypadków, mocniejsze rzadziej (najmniej ${pc(MARINE_DEFLECTION.minChance)}): ${deflList}.${noDefl ? ` Pocisk wybuchowy (${noDefl}) nigdy się nie odbija.` : ''} Ciosy wręcz i wybuchy nie odbijają się nigdy.</p>
  <p>Przegrzanie plazmy rani zawsze tak samo, niezależnie od kierunku. Twój wybuch, który zahaczy brata, liczy się od środka wybuchu.</p>
</section>
<section id="wrogowie"><h2>Tyranidzi</h2><ul>
  ${[...c.enemies.values()]
    .sort((a, b) => a.threat - b.threat)
    .map(
      (e) =>
        `<li><b>${esc(e.name)}</b>${e.boss ? ' <b class="boss">BOSS</b>' : ''} — ${esc(e.role)}</li>`,
    )
    .join('')}
</ul></section>
<section id="punkty"><h2>Punkty i ranking</h2>
  <p>Zabicie daje punkty marine, który zadał ostatni cios (wartości w kompendium). Na koniec misji widzisz podsumowanie oddziału i listę wszystkich zabitych Tyranidów.</p>
  <p>Ranking (<b>HONOURED DEAD</b>) jest osobny dla każdej wersji gry (obecnie tablica <b>${esc(leaderboardBoard(GAME_VERSION))}</b>) i dla każdej liczby graczy. Są dwie listy: najdłuższe przetrwanie oddziału i najwyższe wyniki marines.</p>
</section>
<section id="rady"><h2>Rady</h2><ul>
  <li>Trzymajcie się razem — podniesienie brata ratuje misję.</li>
  <li>Bolt Rifle na drobnicę, ciężką broń zostaw na Warriorów i Carnifexa.</li>
  <li>Hormagaunty i Carnifex szarżują — uskocz, gdy widzisz zamach.</li>
  <li>Spore Mine wybucha przy marines — zestrzel ją z daleka (zabójstwa od jej wybuchu idą na Twoje konto).</li>
  <li>Tyranid Warrior to stwór synapsy — przyspiesza i wzmacnia rój wokół siebie. Biovore wypuszcza Spore Mine. Zabijaj je w pierwszej kolejności.</li>
  <li>Puść spust, żeby uciec — strzelanie spowalnia. W razie biedy sprint, ale pamiętaj o plecach i o chwili bez broni po biegu.</li>
  <li>Nie odwracaj się plecami do roju — z tyłu dostajesz najmocniej, a z przodu pancerz odbija część pocisków.</li>
</ul></section>
<section id="kompendium"><h2>Kompendium</h2>
  <details><summary>Wszystkie wartości potworów i broni (matematyka)</summary>
  ${compendiumHtml(c)}
  </details>
</section>
<footer class="muted">Nieoficjalny, niekomercyjny projekt fanowski. Nie jest powiązany z Games Workshop.</footer>`;
}
