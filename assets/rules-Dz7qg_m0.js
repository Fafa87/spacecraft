import{G as g,x as l,z as C,P as u,a as v,B as E,C as w,i as T,p as I,E as M,H as L,w as B,s as K,M as A,e as D,h as j,l as G,d as H}from"./format-XC55MGKS.js";const o=(e,n=1)=>{const i=Number(e.toFixed(n));return String(i).replace(".",",")},d=(e,n=0)=>`${o(e*100,n)}%`,F=e=>`${o(e*180/Math.PI,1)}°`,O=e=>e>=7?"brak":`${e}+`,R=e=>e?`-${e}`:"0";function m(e,n,i=""){return`<div class="tw"><table class="${i}"><thead><tr>${e.map(a=>`<th>${a}</th>`).join("")}</tr></thead><tbody>${n.map(a=>`<tr>${a.map((s,t)=>t===0?`<th scope="row">${s}</th>`:`<td>${s}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`}const Z=e=>e.unlockAtSec===0?"od startu":e.unlockAtSec===null?"tylko skrzynie":`${e.unlockAtSec} s`;function _(e){const n=e.weaponOrder.map(i=>{const a=i.projectile,s=a.speed*a.lifetime;return[`${i.slot}. ${l(i.name)}`,l(i.roles.join(" · ")),l(I(i)),`${o(a.damage,1)}${i.pellets>1?` ×${i.pellets}`:""}${a.explosion?` + wybuch ${o(a.explosion.damage)} (r ${a.explosion.radius})`:""}`,`${o(1/i.fireInterval,2)}/s`,`${i.magazine}`,`${o(i.reloadTime,2)} s`,F(i.spread),`${Math.round(s)} px`,`${a.pierce}`,`${d(i.moveSpeedMul)} / ${d(i.moveSpeedMul*i.fireMoveMul)}`,Z(i),i.crateWeight?`${i.crateWeight}`:"—"]});return m(["Broń","Rola","Profil","Obrażenia / pocisk","Szybkostrzelność","Magazynek","Przeładowanie","Rozrzut","Zasięg","Przebicie","Ruch (zwykle / strzelając)","Dostępna","Waga w skrzyni"],n)}function U(e){return`<ul class="specials">${e.weaponOrder.map(i=>{const a=i.projectile,s=[`odrzut ${a.knockback}`,`prędkość pocisku ${a.speed} px/s`];if(a.drag&&s.push(`hamowanie pocisku ${d(a.drag)}/s`),a.explosion&&s.push(`wybuch: ${o(a.explosion.damage)} obrażeń w promieniu ${a.explosion.radius} px (na krawędzi ${d(a.explosion.edgeFactor)})${a.explosion.strength!==void 0?`, S${a.explosion.strength} AP${R(a.explosion.ap)}`:""}${a.explosion.friendlyFire?", <b>rani też marines</b>":""}`),i.braceDelay!==void 0&&s.push(`zaparcie: po ${o(i.braceDelay,2)} s bez ruchu strzela ×${o(i.braceFireRateMult??1,2)} szybciej, rozrzut ×${o(i.braceSpreadMult??1,2)}`),i.heat){const t=i.heat;s.push(`ciepło: +${t.perShot}/strzał, max ${t.max}, stygnie ${t.coolPerSec}/s; od ${d(t.superchargeAt)} strzały przeładowane (obrażenia ×${o(t.superchargeDamageMul,2)}, S+${t.superchargeStrength??0}, AP+${t.superchargeAp??0}); przegrzanie: ${t.selfDamage} obrażeń dla strzelca i ${o(t.ventTime,2)} s chłodzenia`)}return s.push(i.automatic?"automatyczna (trzymaj spust)":"półautomatyczna"),`<li><b>${l(i.name)}</b> — ${l(i.description)}<br><span class="muted">${s.join(" · ")}</span></li>`}).join("")}</ul>`}function x(e,n="burst"){const i=[...e.enemies.values()],a=e.weaponOrder.map(s=>[l(s.name),...i.map(t=>{const c=n==="burst"?M(s,t):L(s,t),r=t.hp/c;return`${o(c,0)}<small>${Number.isFinite(r)?` · ${o(r,2)} s`:""}</small>`})]);return m(["Broń \\ cel",...i.map(s=>l(s.name))],a,"matrix")}function P(e){const n=e.weaponOrder.filter(a=>a.heat);if(!n.length)return"";const i=[...e.enemies.values()];return m(["Przeładowany strzał",...i.map(a=>l(a.name))],n.map(a=>[l(a.name),...i.map(s=>`${o(M(a,s,!0),0)}`)]),"matrix")}function J(e,n){const i=[];if(e.behavior!=="kamikaze"&&e.contactDamage&&i.push(`wręcz ${e.contactDamage} co ${o(e.contactCooldown,2)} s (${o(e.contactDamage/e.contactCooldown,1)} DPS)`),e.ranged){const a=e.ranged;i.push(`strzał ${a.projectile.damage}${a.projectile.explosion?` + wybuch ${a.projectile.explosion.damage} (r ${a.projectile.explosion.radius})`:""} co ${o(a.cooldown,2)} s, zasięg ${a.range} px (trzyma dystans ${a.preferredDistance})`)}if(e.charge){const a=e.charge;i.push(`szarża: ${a.minDistance}–${a.triggerDistance} px, zamach ${o(a.windup,2)} s, ${o(a.duration,2)} s z prędkością ×${o(a.speedMul,2)}, ${a.damage} obrażeń, odnowienie ${o(a.cooldown,1)} s`)}if(e.explode){const a=e.explode;i.push(`wybuch ${a.damage} w promieniu ${a.radius} px (krawędź ${d(a.edgeFactor)}), lont ${o(a.fuse,2)} s od ${a.triggerDistance} px${a.onDeath?", wybucha też po śmierci":""}`)}return e.burrow&&i.push(`podkopuje się (×${o(e.burrow.speedMul,2)} prędkości, nie można trafić), wynurza się ${e.burrow.emergeDistance} px od marine`),e.synapse&&i.push(`synapsa: rój w promieniu ${e.synapse.radius} px szybszy ×${o(e.synapse.speedMul,2)}, obrażenia ×${o(e.synapse.damageMul,2)}`),e.spawner&&i.push(`wypuszcza ${l(n.enemies.get(e.spawner.enemy)?.name??e.spawner.enemy)} co ${o(e.spawner.interval,1)} s (max ${e.spawner.max}, gdy marine bliżej niż ${e.spawner.range} px)`),i.join("<br>")}function Y(e){const n=e.director.teamScaling.eliteThreat,i=[...e.enemies.values()].sort((a,s)=>a.threat-s.threat);return m(["Tyranid","Klasa","Życie","T","Pancerz","Prędkość","Rozmiar","Masa","Zagrożenie","Punkty","Apteczka","Ataki"],i.map(a=>[`${l(a.name)}<br><small class="muted">${l(a.role)}</small>`,a.boss?'<b class="boss">BOSS</b>':a.threat>=n?"ELITA":"rój",`${a.hp}`,`${a.toughness}`,O(a.save),`${a.speed} px/s`,`r ${a.radius}`,`${a.mass}`,`${o(a.threat,2)}`,`${a.points}`,d(a.medkitDropChance),J(a,e)]))}function Q(){const e=[3,4,5,6,8,10],n=[3,4,5,6,8,9,10],i=m(["S \\ T",...e.map(c=>`T${c}`)],n.map(c=>[`S${c}`,...e.map(r=>`×${o(B(c,r),2)}`)]),"matrix"),a=[2,3,4,5,6,7],s=[0,1,2,3,4],t=m(["Pancerz \\ AP",...s.map(c=>`AP${R(c)}`)],a.map(c=>[O(c),...s.map(r=>d(K(c,r)))]),"matrix");return`<h4>Mnożnik obrażeń: Siła (S) broni vs Wytrzymałość (T) celu</h4>${i}
  <h4>Szansa, że pancerz zatrzyma trafienie</h4>${t}`}const f=(e,n)=>e[Math.min(n,e.length-1)]??1;function V(e){const n=e.director.teamScaling,i=e.director,a=Array.from({length:A},(t,c)=>c),s=(t,c)=>[t,...a.map(r=>`×${o(f(c,r),2)}`)];return m(["Graczy",...a.map(t=>`${t+1}`)],[s("Liczba wrogów w fali (budżet)",n.budget),s("Tempo napływu",n.pace),s("Limit żywych naraz",n.maxAlive),s("Życie Tyranidów",n.hp),s(`Udział elit (zagrożenie ≥ ${n.eliteThreat})`,n.elite),s("Limit potomstwa (Rippery, miny)",n.children),["Bossy na pojawienie",...a.map(t=>`${f(i.bosses.count,t)}`)],["Apteczki z zabójstw / falę",...a.map(t=>`${Math.round(i.drops.medkits.base+i.drops.medkits.perMarine*t)}`)],["Skrzynie z bronią / falę",...a.map(t=>`${Math.round(i.drops.crates.base+i.drops.crates.perMarine*t)}`)]],"matrix")}function q(e,n=15){const i=e.director,a=i.waves,s=[];for(let r=1;r<=n;r++){const z=a.budget.base+a.budget.perWave*Math.pow(r-1,a.budget.exponent),y=a.pace.base+a.pace.perWave*(r-1),b=Math.min(i.maxAlive.cap,i.maxAlive.base+i.maxAlive.perWave*(r-1)),k=1+a.hpScalePerWave*(r-1),h=r>=i.bosses.firstWave&&(r-i.bosses.firstWave)%i.bosses.everyWave===0,$=h?(r-i.bosses.firstWave)/i.bosses.everyWave:0;s.push([`${r}`,o(z,1),o(y,1),`${Math.round(b)}`,`×${o(k,2)}`,h?`${l(e.enemy(i.bosses.enemy).name)} (1 os.: ${f(i.bosses.count,0)+$*i.bosses.extraPerAppearance})`:"—"])}const t=[...e.enemies.keys()],c=m(["Od fali",...t.map(r=>l(e.enemy(r).name))],i.waveTable.map(r=>{const z=Object.values(r.weights).reduce((y,b)=>y+b,0);return[`${r.fromWave}`,...t.map(y=>r.weights[y]?d(r.weights[y]/z):"—")]}),"matrix");return`${m(["Fala","Budżet zagrożenia (solo)","Zagrożenie / s (solo)","Limit żywych (solo)","Życie wrogów","Boss"],s,"matrix")}
  <p class="muted">Budżet fali = (${a.budget.base} + ${a.budget.perWave}·(n−1)^${o(a.budget.exponent,2)}) × mnożnik drużyny. Każdy wróg „kosztuje” tyle, ile wynosi jego zagrożenie. Życie rośnie o ${d(a.hpScalePerWave)} na falę, razy mnożnik drużyny. Limit żywych: ${i.maxAlive.base} + ${i.maxAlive.perWave}/falę (maks. ${i.maxAlive.cap}). Pierwsza fala po ${a.firstDelay} s, przerwa między falami ${a.breather} s. Gdy zostanie ≤ ${a.reveal.remaining} wrogów (lub ${d(a.reveal.fraction)} fali), albo minie ${a.reveal.afterSec} s, resztki są ujawniane i polują (×${o(a.reveal.speedMul,2)} prędkości). Po ${a.forceNextAfter} s fala następna rusza i tak.</p>
  <h4>Skład fal (szansa na typ przy losowaniu, 1 gracz)</h4>${c}
  <p class="muted">W większej drużynie wagi elit mnożone są przez „udział elit” z tabeli wyżej.</p>`}function X(e){return m(["Parametr","Wartość"],[["Życie",`${u.maxHp}`],["Prędkość",`${u.speed} px/s (× mnożnik broni)`],["Powrót prędkości po puszczeniu spustu",`${u.fireMoveRecover} s`],["Czas na podniesienie (wykrwawienie)",`${u.bleedOutTime} s`],["Czas podnoszenia",`${u.reviveTime} s w promieniu ${u.reviveRadius} px`],["Życie po podniesieniu",d(u.reviveHpFraction)],["Nietykalność po trafieniu / podniesieniu",`${u.hurtInvuln} s / ${u.reviveInvuln} s`],["Pancerz (przód / boki / tył)",`×${o(w.front,2)} / ×${o(w.side,2)} / ×${o(w.rear,2)} obrażeń`],["Apteczka",`+${v.medkitHeal} życia, leży ${v.lifetime} s`],["Arena",`${e.map.arena.width} × ${e.map.arena.height} px`],["Symulacja",`${E} ticków/s`]])}function ee(){const e=D;return m(["Parametr","Wartość"],[["Prędkość sprintu",`×${o(e.speedMul,2)} = ${o(u.speed*e.speedMul,0)} px/s (bez kary za broń)`],["Kondycja (maks.)",`${o(e.staminaMaxS,2)} s sprintu`],["Zużycie",`${o(e.drainPerS,2)} / s`],["Odnowa (tylko stojąc)",`${o(e.regenStandingPerS,3)} / s — pełna po ${o(e.staminaMaxS/e.regenStandingPerS,2)} s`],["Minimum do startu",`${o(e.minToStartS,2)} s`],["Broń gotowa po sprincie",`${o(e.weaponReadyDelayS,2)} s`],["Strzał w sprincie","niemożliwy (spust ignorowany)"],["Kierunek pancerza w sprincie","kierunek biegu"]])}function ae(e){const n=w,i=j,a=m(["Strona","Kąt od kierunku celowania (w sprincie: biegu)","Mnożnik obrażeń","Rykoszet pocisków"],[["Przód",`0–${n.frontArcDeg}°`,`×${o(n.front,2)}`,"tak"],["Boki",`${n.frontArcDeg}–${180-n.rearArcDeg}°`,`×${o(n.side,2)}`,"nie"],["Tył",`${180-n.rearArcDeg}–180°`,`×${o(n.rear,2)}`,"nie"]]),s=T(e.enemies.values()),t=[...e.enemies.values()].filter(r=>r.ranged).map(r=>{const z=r.ranged.projectile,y=s[z.kind]??0,b=z.damage*n.front;return[l(r.name),l(z.kind),z.explosion?`wybuch ${o(z.explosion.damage)}`:`${o(z.damage)}`,z.explosion?"—":`${o(b,1)}`,y>0?d(y):"0% (wybuchowy)",z.explosion?"—":o(b*(1-y),2)]}),c=m(["Strzelec","Pocisk","Obrażenia","Trafienie w przód","Szansa na rykoszet (przód)","Średnio na strzał w przód"],t);return`${a}
  <p class="muted">Kąt liczony między kierunkiem celowania marine a kierunkiem do źródła: atakujący (wręcz, szarża), kierunek, z którego nadleciał pocisk, albo środek wybuchu. Obrażenia bez kierunku (przegrzanie plazmy) — ×${o(n.side,2)}. Wybuchy i ciosy wręcz też dostają mnożnik strony, ale nie mają rykoszetu. Mnożnik działa razem z synapsą (obrażenia × synapsa × strona).</p>
  <h4>Rykoszet z przedniego pancerza</h4>${c}
  <p class="muted">Szansa = ${d(i.maxChance)} × (obrażenia najsłabszego pocisku Tyranidów / obrażenia tego pocisku), w granicach ${d(i.minChance)}–${d(i.maxChance)}. Liczą się bazowe obrażenia pocisku (synapsa ich nie zmienia). Odbity pocisk nie rani nikogo, odlatuje lustrzanie od pancerza (±${o(i.jitter*180/Math.PI,0)}°, ${d(i.speedMul)} prędkości) i znika po ${o(i.fadeTime,2)} s.</p>`}function ie(e){return`
  <p class="muted">Wszystkie liczby są generowane z kodu gry v${g}. Odległości w pikselach areny, czasy w sekundach. DPS = średnie obrażenia na sekundę przy trafieniu każdym pociskiem, z uwzględnieniem S vs T i pancerza (bez zasięgu, ciepła i zaparcia). Po kropce: czas zabicia jednego wroga z bazowym życiem (fala 1, solo).</p>
  <h3>Space Marine</h3>${X(e)}
  <h3>Sprint</h3>${ee()}
  <h3>Pancerz kierunkowy i rykoszety</h3>${ae(e)}
  <h3>Bronie</h3>${_(e)}
  <h4>Cechy specjalne</h4>${U(e)}
  <h3>Tyranidzi</h3>${Y(e)}
  <h3>DPS broni vs każdy Tyranid (ciągły ogień, bez przeładowań)</h3>${x(e,"burst")}
  <h3>DPS z przeładowaniami (średnia na cały magazynek)</h3>${x(e,"sustained")}
  ${P(e)?`<h3>Plazma — strzały przeładowane (DPS)</h3>${P(e)}`:""}
  <h3>Profile 40k: Siła, Wytrzymałość, pancerz</h3>
  <p class="muted">Obrażenia trafienia = obrażenia × mnożnik S vs T, albo 0, jeśli pancerz zatrzyma pocisk (rzut przy każdym trafieniu). Broń bez profilu (wybuchy wrogów) ignoruje T i pancerz. Przykład: średnio na trafienie ${l(e.weaponOrder[0].name)} w ${l([...e.enemies.values()].at(-1).name)}: ${o(C(e.weaponOrder[0],[...e.enemies.values()].at(-1)),2)}.</p>
  ${Q()}
  <h3>Fale</h3>${q(e)}
  <h3>Trudność a liczba graczy</h3>${V(e)}`}function oe(e){const n=e.weaponOrder,i=n.filter(p=>p.unlockAtSec===0).map(p=>l(p.name)).join(", "),a=n.filter(p=>p.unlockAtSec).map(p=>`<li><b>${l(p.name)}</b> — po ${p.unlockAtSec} s przetrwania</li>`).join(""),s=e.enemy(e.director.bosses.enemy).name,t=e.director,c=w,r=D,z=p=>`${String(Number(p.toFixed(2))).replace(".",",")} s`,y=p=>`${Math.round(p*100)}%`,b=p=>`×${String(p).replace(".",",")}`,k=T(e.enemies.values()),$=[...e.enemies.values()].filter(p=>p.ranged&&k[p.ranged.projectile.kind]).map(p=>`<b>${l(p.name)}</b> ${y(k[p.ranged.projectile.kind])}`).join(", "),S=[...e.enemies.values()].filter(p=>p.ranged&&!k[p.ranged.projectile.kind]).map(p=>l(p.name)).join(", ");return`
<header class="top">
  <a class="back" href="./">← WRÓĆ DO GRY</a>
  <h1>${l(e.title)} <span>· zasady</span></h1>
  <p class="muted">Wersja v${g}</p>
</header>
<nav class="toc">
  <a href="#cel">Cel</a><a href="#sterowanie">Sterowanie</a><a href="#sprint">Sprint</a><a href="#tryby">Tryby</a><a href="#multi">Multiplayer</a><a href="#glos">Czat głosowy</a><a href="#bron">Broń</a><a href="#pancerz">Pancerz</a><a href="#wrogowie">Tyranidzi</a><a href="#punkty">Punkty</a><a href="#rady">Rady</a><a href="#kompendium">Kompendium</a>
</nav>
<section id="cel"><h2>Cel gry</h2>
  <p>Jesteś Space Marine broniącym zrujnowanej iglicy ula. Tyranidzi atakują <b>falami</b> z wyłomów w ścianach i szybów w podłodze. Następna fala rusza dopiero, gdy zginie cała poprzednia (po ${t.waves.breather} s przerwy). Każda fala jest większa, a potwory mają więcej życia. Co ${t.bosses.everyWave}. fala od ${t.bosses.firstWave}. prowadzi boss — <b>${l(s)}</b>.</p>
  <p>Gra kończy się, gdy padnie cały oddział. Liczy się czas przetrwania i punkty za zabicia.</p>
</section>
<section id="sterowanie"><h2>Sterowanie</h2>
  <div class="two">
    <div><h3>Komputer</h3><ul>
      <li><b>WASD / strzałki</b> — ruch</li>
      <li><b>Mysz</b> — celowanie</li>
      <li><b>Lewy przycisk / Spacja</b> — strzał (przytrzymaj przy broni automatycznej)</li>
      <li><b>1–${n.length}</b>, <b>Q / E</b>, <b>kółko myszy</b> — zmiana broni</li>
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
  <p>Marine może na chwilę rzucić się biegiem: <b>${b(r.speedMul)}</b> zwykłej prędkości (${Math.round(u.speed*r.speedMul)} px/s — ciężar broni nie spowalnia sprintu). Sprint zaczyna się od razu, ale <b>w biegu nie da się strzelać</b> — spust jest ignorowany i nie przerywa sprintu.</p>
  <ul>
    <li><b>Kondycja</b>: ${z(r.staminaMaxS)} sprintu (pasek pod marine). Kończy się sama przy zerze; ponownie ruszysz dopiero, gdy będzie co najmniej ${z(r.minToStartS)}.</li>
    <li>Kondycja wraca <b>tylko, gdy stoisz w miejscu</b> — pełna po ${z(r.staminaMaxS/r.regenStandingPerS)}. Zwykły marsz jej nie odnawia.</li>
    <li>Po sprincie broń jest gotowa dopiero po <b>${z(r.weaponReadyDelayS)}</b> (złoty pasek „READY…” na ikonie broni). Broń półautomatyczną trzeba wtedy nacisnąć ponownie.</li>
    <li>W sprincie marine patrzy tam, dokąd biegnie — <b>uciekając, nadstawiasz plecy</b> (tylny pancerz ${b(c.rear)}).</li>
    <li>Nie da się sprintować, podnosząc brata (w promieniu ${u.reviveRadius} px od powalonego).</li>
    <li>W sprincie marine zarzuca broń na plecy i biegnie z pustymi rękami; po sprincie widać, jak ją podnosi.</li>
    <li>Sprint innych graczy widać po kurzu i smugach za marine.</li>
  </ul>
</section>
<section id="tryby"><h2>Tryby gry</h2><ul>
  <li><b>SOLO DEPLOY</b> — samotna obrona. Esc pauzuje grę.</li>
  <li><b>HOST SQUAD (CO-OP)</b> — zakładasz pokój i zapraszasz do ${A} marines łącznie.</li>
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
<p><b>Ranny brat</b>: marine z zerowym życiem pada i czeka na pomoc. Stań obok niego (do ${u.reviveRadius} px) przez ${u.reviveTime} s, a wstanie z ${Math.round(u.reviveHpFraction*100)}% życia. Ma na to ${u.bleedOutTime} s — potem ginie.</p>
</section>
<section id="glos"><h2>Czat głosowy</h2>
  <p>Głos jest <b>domyślnie wyłączony</b>. Włącza go host w pokoju oddziału przełącznikiem <b>🎙 CZAT GŁOSOWY</b> (przed startem misji); pozostali widzą w pokoju, czy głos jest włączony. W grze solo głosu nie ma.</p>
  <ul>
    <li>Gdy głos jest włączony, u góry ekranu pojawia się przycisk <b>🎙 GŁOS</b>. Dotknij go, żeby dołączyć — przeglądarka zapyta o mikrofon. Odmowa jest w porządku: wtedy <b>tylko słuchasz</b>.</li>
    <li><b>Push-to-talk</b> (domyślnie): przytrzymaj klawisz <b>V</b> albo przycisk mikrofonu i mów.</li>
    <li><b>OPEN</b> — otwarty mikrofon; ten sam przycisk wtedy <b>wycisza</b> / włącza mikrofon.</li>
    <li>Każdy gracz ma swój chip z nazwą (świeci, gdy mówi). Dotknij go, żeby zmienić <b>głośność</b>: 100% → 50% → wyciszony.</li>
    <li><b>✕</b> — wyjście z czatu głosowego (gra trwa dalej).</li>
    <li><b>iPhone</b>: dźwięk może przełączyć się na słuchawkę rozmów albo ściszyć efekty gry — najlepiej w słuchawkach. Nie przełączaj aplikacji i nie blokuj ekranu: iOS zatrzymuje wtedy mikrofon; po powrocie dotknij „🎙 GŁOS” ponownie. Na głośniku może pojawić się echo — używaj push-to-talk.</li>
  </ul>
</section>
<section id="bron"><h2>Broń</h2>
  <p>Na start masz: <b>${i}</b>. Kolejne bronie odblokowują się wszystkim z czasem:</p><ul>${a}</ul>
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
    <li><b>Przód</b> (±${c.frontArcDeg}° od kierunku celowania) — obrażenia <b>${b(c.front)}</b></li>
    <li><b>Boki</b> — obrażenia <b>${b(c.side)}</b></li>
    <li><b>Tył</b> (±${c.rearArcDeg}° od pleców) — obrażenia <b>${b(c.rear)}</b></li>
  </ul>
  <p><b>Rykoszet</b>: pocisk Tyranida, który trafi w przedni pancerz, może się od niego odbić — nie zadaje wtedy obrażeń, a od marine sypią się iskry. Najsłabsze pociski odbijają się w ${y(j.maxChance)} przypadków, mocniejsze rzadziej (najmniej ${y(j.minChance)}): ${$}.${S?` Pocisk wybuchowy (${S}) nigdy się nie odbija.`:""} Ciosy wręcz i wybuchy nie odbijają się nigdy.</p>
  <p>Przegrzanie plazmy rani zawsze tak samo, niezależnie od kierunku. Twój wybuch, który zahaczy brata, liczy się od środka wybuchu.</p>
</section>
<section id="wrogowie"><h2>Tyranidzi</h2><ul>
  ${[...e.enemies.values()].sort((p,N)=>p.threat-N.threat).map(p=>`<li><b>${l(p.name)}</b>${p.boss?' <b class="boss">BOSS</b>':""} — ${l(p.role)}</li>`).join("")}
</ul></section>
<section id="punkty"><h2>Punkty i ranking</h2>
  <p>Zabicie daje punkty marine, który zadał ostatni cios (wartości w kompendium). Na koniec misji widzisz podsumowanie oddziału i listę wszystkich zabitych Tyranidów.</p>
  <p>Ranking (<b>HONOURED DEAD</b>) jest osobny dla każdej wersji gry (obecnie tablica <b>${l(G(g))}</b>) i dla każdej liczby graczy. Są dwie listy: najdłuższe przetrwanie oddziału i najwyższe wyniki marines.</p>
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
  ${ie(e)}
  </details>
</section>
<footer class="muted">Nieoficjalny, niekomercyjny projekt fanowski. Nie jest powiązany z Games Workshop.</footer>`}const W=document.getElementById("rules");W.innerHTML=oe(H);location.hash==="#kompendium"&&W.querySelector("details")?.setAttribute("open","");
//# sourceMappingURL=rules-Dz7qg_m0.js.map
