import{G as g,L as l,S as E,P as u,c as x,U as L,V as h,l as A,B,W as M,X as K,w as G,s as F,n as D,Y as j,M as O,k as f,x as H,o as Z}from"./format-D-pE_bBh.js";const o=(e,n=1)=>{const i=Number(e.toFixed(n));return String(i).replace(".",",")},d=(e,n=0)=>`${o(e*100,n)}%`,U=e=>`${o(e*180/Math.PI,1)}°`,W=e=>e>=7?"brak":`${e}+`,R=e=>e?`-${e}`:"0";function m(e,n,i=""){return`<div class="tw"><table class="${i}"><thead><tr>${e.map(a=>`<th>${a}</th>`).join("")}</tr></thead><tbody>${n.map(a=>`<tr>${a.map((t,r)=>r===0?`<th scope="row">${t}</th>`:`<td>${t}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`}const _=e=>e.unlockAtWave===0?"od startu":e.unlockAtWave===null?"tylko skrzynie":`fala ${e.unlockAtWave}`;function Y(e){const n=e.weaponOrder.map(i=>{const a=i.projectile,t=a.speed*a.lifetime;return[`${i.slot}. ${l(i.name)}`,l(i.roles.join(" · ")),l(B(i)),`${o(a.damage,1)}${i.pellets>1?` ×${i.pellets}`:""}${a.explosion?` + wybuch ${o(a.explosion.damage)} (r ${a.explosion.radius})`:""}`,`${o(1/i.fireInterval,2)}/s`,`${i.magazine}`,`${o(i.reloadTime,2)} s`,U(i.spread),`${Math.round(t)} px`,`${a.pierce}`,`${d(i.moveSpeedMul)} / ${d(i.moveSpeedMul*i.fireMoveMul)}`,_(i),i.crateWeight?`${i.crateWeight}`:"—"]});return m(["Broń","Rola","Profil","Obrażenia / pocisk","Szybkostrzelność","Magazynek","Przeładowanie","Rozrzut","Zasięg","Przebicie","Ruch (zwykle / strzelając)","Dostępna","Waga w skrzyni"],n)}function J(e){return`<ul class="specials">${e.weaponOrder.map(i=>{const a=i.projectile,t=[`odrzut ${a.knockback}`,`prędkość pocisku ${a.speed} px/s`];if(a.drag&&t.push(`hamowanie pocisku ${d(a.drag)}/s`),a.explosion&&t.push(`wybuch: ${o(a.explosion.damage)} obrażeń w promieniu ${a.explosion.radius} px (na krawędzi ${d(a.explosion.edgeFactor)})${a.explosion.strength!==void 0?`, S${a.explosion.strength} AP${R(a.explosion.ap)}`:""}${a.explosion.friendlyFire?", <b>rani też marines</b>":""}`),i.braceDelay!==void 0&&t.push(`zaparcie: po ${o(i.braceDelay,2)} s bez ruchu strzela ×${o(i.braceFireRateMult??1,2)} szybciej, rozrzut ×${o(i.braceSpreadMult??1,2)}`),i.heat){const r=i.heat;t.push(`ciepło: +${r.perShot}/strzał, max ${r.max}, stygnie ${r.coolPerSec}/s; od ${d(r.superchargeAt)} strzały przeładowane (obrażenia ×${o(r.superchargeDamageMul,2)}, S+${r.superchargeStrength??0}, AP+${r.superchargeAp??0}); przegrzanie: ${r.selfDamage} obrażeń dla strzelca i ${o(r.ventTime,2)} s chłodzenia`)}return t.push(i.automatic?"automatyczna (trzymaj spust)":"półautomatyczna"),`<li><b>${l(i.name)}</b> — ${l(i.description)}<br><span class="muted">${t.join(" · ")}</span></li>`}).join("")}</ul>`}function P(e,n="burst"){const i=[...e.enemies.values()],a=e.weaponOrder.map(t=>[l(t.name),...i.map(r=>{const c=n==="burst"?M(t,r):K(t,r),s=r.hp/c;return`${o(c,0)}<small>${Number.isFinite(s)?` · ${o(s,2)} s`:""}</small>`})]);return m(["Broń \\ cel",...i.map(t=>l(t.name))],a,"matrix")}function T(e){const n=e.weaponOrder.filter(a=>a.heat);if(!n.length)return"";const i=[...e.enemies.values()];return m(["Przeładowany strzał",...i.map(a=>l(a.name))],n.map(a=>[l(a.name),...i.map(t=>`${o(M(a,t,!0),0)}`)]),"matrix")}function Q(e,n){const i=[];if(e.behavior!=="kamikaze"&&e.contactDamage&&i.push(`wręcz ${e.contactDamage} co ${o(e.contactCooldown,2)} s (${o(e.contactDamage/e.contactCooldown,1)} DPS)`),e.ranged){const a=e.ranged;i.push(`strzał ${a.projectile.damage}${a.projectile.explosion?` + wybuch ${a.projectile.explosion.damage} (r ${a.projectile.explosion.radius})`:""} co ${o(a.cooldown,2)} s, zasięg ${a.range} px (trzyma dystans ${a.preferredDistance})`)}if(e.charge){const a=e.charge;i.push(`szarża: ${a.minDistance}–${a.triggerDistance} px, zamach ${o(a.windup,2)} s, ${o(a.duration,2)} s z prędkością ×${o(a.speedMul,2)}, ${a.damage} obrażeń, odnowienie ${o(a.cooldown,1)} s`)}if(e.explode){const a=e.explode;i.push(`wybuch ${a.damage} w promieniu ${a.radius} px (krawędź ${d(a.edgeFactor)}), lont ${o(a.fuse,2)} s od ${a.triggerDistance} px${a.onDeath?", wybucha też po śmierci":""}`)}return e.burrow&&i.push(`podkopuje się (×${o(e.burrow.speedMul,2)} prędkości, nie można trafić), wynurza się ${e.burrow.emergeDistance} px od marine`),e.synapse&&i.push(`synapsa: rój w promieniu ${e.synapse.radius} px szybszy ×${o(e.synapse.speedMul,2)}, obrażenia ×${o(e.synapse.damageMul,2)}`),e.spawner&&i.push(`wypuszcza ${l(n.enemies.get(e.spawner.enemy)?.name??e.spawner.enemy)} co ${o(e.spawner.interval,1)} s (max ${e.spawner.max}, gdy marine bliżej niż ${e.spawner.range} px)`),i.join("<br>")}function V(e){const n=e.director.teamScaling.eliteThreat,i=[...e.enemies.values()].sort((a,t)=>a.threat-t.threat);return m(["Tyranid","Klasa","Życie","T","Pancerz","Prędkość","Rozmiar","Masa","Zagrożenie","Punkty","Apteczka","Ataki"],i.map(a=>[`${l(a.name)}<br><small class="muted">${l(a.role)}</small>`,a.boss?'<b class="boss">BOSS</b>':a.threat>=n?"ELITA":"rój",`${a.hp}`,`${a.toughness}`,W(a.save),`${a.speed} px/s`,`r ${a.radius}`,`${a.mass}`,`${o(a.threat,2)}`,`${a.points}`,d(a.medkitDropChance,1),Q(a,e)]))}function X(){const e=[3,4,5,6,8,10],n=[3,4,5,6,8,9,10],i=m(["S \\ T",...e.map(c=>`T${c}`)],n.map(c=>[`S${c}`,...e.map(s=>`×${o(G(c,s),2)}`)]),"matrix"),a=[2,3,4,5,6,7],t=[0,1,2,3,4],r=m(["Pancerz \\ AP",...t.map(c=>`AP${R(c)}`)],a.map(c=>[W(c),...t.map(s=>d(F(c,s)))]),"matrix");return`<h4>Mnożnik obrażeń: Siła (S) broni vs Wytrzymałość (T) celu</h4>${i}
  <h4>Szansa, że pancerz zatrzyma trafienie</h4>${r}`}const v=(e,n)=>e[Math.min(n,e.length-1)]??1;function q(e){const n=e.director.teamScaling,i=e.director,a=Array.from({length:D},(r,c)=>c),t=(r,c)=>[r,...a.map(s=>`×${o(v(c,s),2)}`)];return m(["Graczy",...a.map(r=>`${r+1}`)],[t("Liczba wrogów w fali (budżet)",n.budget),t("Tempo napływu",n.pace),t("Limit żywych naraz",n.maxAlive),t("Życie Tyranidów",n.hp),t(`Udział elit (zagrożenie ≥ ${n.eliteThreat})`,n.elite),t("Limit potomstwa (Rippery, miny)",n.children),["Bossy na pojawienie",...a.map(r=>`${v(i.bosses.count,r)}`)],["Apteczki z zabójstw / falę (średnio)",...a.map(r=>o(j(i,r+1).medkits,2))],["Skrzynie z bronią / falę (średnio)",...a.map(r=>o(j(i,r+1).crates,2))]],"matrix")}function ee(e,n=15){const i=e.director,a=i.waves,t=[];for(let s=1;s<=n;s++){const z=a.budget.base+a.budget.perWave*Math.pow(s-1,a.budget.exponent),y=a.pace.base+a.pace.perWave*(s-1),b=Math.min(i.maxAlive.cap,i.maxAlive.base+i.maxAlive.perWave*(s-1)),$=1+a.hpScalePerWave*(s-1),k=s>=i.bosses.firstWave&&(s-i.bosses.firstWave)%i.bosses.everyWave===0,w=k?(s-i.bosses.firstWave)/i.bosses.everyWave:0;t.push([`${s}`,o(z,1),o(y,1),`${Math.round(b)}`,`×${o($,2)}`,k?`${l(e.enemy(i.bosses.enemy).name)} (1 os.: ${v(i.bosses.count,0)+w*i.bosses.extraPerAppearance})`:"—"])}const r=[...e.enemies.keys()],c=m(["Od fali",...r.map(s=>l(e.enemy(s).name))],i.waveTable.map(s=>{const z=Object.values(s.weights).reduce((y,b)=>y+b,0);return[`${s.fromWave}`,...r.map(y=>s.weights[y]?d(s.weights[y]/z):"—")]}),"matrix");return`${m(["Fala","Budżet zagrożenia (solo)","Zagrożenie / s (solo)","Limit żywych (solo)","Życie wrogów","Boss"],t,"matrix")}
  <p class="muted">Budżet fali = (${a.budget.base} + ${a.budget.perWave}·(n−1)^${o(a.budget.exponent,2)}) × mnożnik drużyny. Każdy wróg „kosztuje” tyle, ile wynosi jego zagrożenie. Życie rośnie o ${d(a.hpScalePerWave)} na falę, razy mnożnik drużyny. Limit żywych: ${i.maxAlive.base} + ${i.maxAlive.perWave}/falę (maks. ${i.maxAlive.cap}). Pierwsza fala po ${a.firstDelay} s, przerwa między falami ${a.breather} s. Gdy zostanie ≤ ${a.reveal.remaining} wrogów (lub ${d(a.reveal.fraction)} fali), albo minie ${a.reveal.afterSec} s, resztki są ujawniane i polują (×${o(a.reveal.speedMul,2)} prędkości). Po ${a.forceNextAfter} s fala następna rusza i tak.</p>
  <h4>Skład fal (szansa na typ przy losowaniu, 1 gracz)</h4>${c}
  <p class="muted">W większej drużynie wagi elit mnożone są przez „udział elit” z tabeli wyżej.</p>`}function ae(e){return m(["Parametr","Wartość"],[["Życie",`${u.maxHp}`],["Prędkość",`${u.speed} px/s (× mnożnik broni)`],["Powrót prędkości po puszczeniu spustu",`${u.fireMoveRecover} s`],["Czas na podniesienie (wykrwawienie)",`${u.bleedOutTime} s`],["Czas podnoszenia",`${u.reviveTime} s w promieniu ${u.reviveRadius} px`],["Życie po podniesieniu",d(u.reviveHpFraction)],["Nietykalność po trafieniu / podniesieniu",`${u.hurtInvuln} s / ${u.reviveInvuln} s`],["Pancerz (przód / boki / tył)",`×${o(h.front,2)} / ×${o(h.side,2)} / ×${o(h.rear,2)} obrażeń`],["Apteczka",`+${x.medkitHeal} życia, leży ${x.lifetime} s`],["Arena",`${e.map.arena.width} × ${e.map.arena.height} px`],["Symulacja",`${L} ticków/s`]])}function ie(){const e=O;return m(["Parametr","Wartość"],[["Prędkość sprintu",`×${o(e.speedMul,2)} = ${o(u.speed*e.speedMul,0)} px/s (bez kary za broń)`],["Kondycja (maks.)",`${o(e.staminaMaxS,2)} s sprintu`],["Zużycie",`${o(e.drainPerS,2)} / s`],["Odnowa (tylko stojąc)",`${o(e.regenStandingPerS,3)} / s — pełna po ${o(e.staminaMaxS/e.regenStandingPerS,2)} s`],["Minimum do startu",`${o(e.minToStartS,2)} s`],["Broń gotowa po sprincie",`${o(e.weaponReadyDelayS,2)} s`],["Strzał w sprincie","niemożliwy (spust ignorowany)"],["Start sprintu przy wciśniętym spuście","wstrzymany do puszczenia spustu"],["Kierunek pancerza w sprincie","kierunek biegu"]])}function oe(e){const n=h,i=f,a=m(["Strona","Kąt od kierunku celowania (w sprincie: biegu)","Mnożnik obrażeń","Rykoszet pocisków"],[["Przód",`0–${n.frontArcDeg}°`,`×${o(n.front,2)}`,"tak"],["Boki",`${n.frontArcDeg}–${180-n.rearArcDeg}°`,`×${o(n.side,2)}`,"nie"],["Tył",`${180-n.rearArcDeg}–180°`,`×${o(n.rear,2)}`,"nie"]]),t=A(e.enemies.values()),r=[...e.enemies.values()].filter(s=>s.ranged).map(s=>{const z=s.ranged.projectile,y=t[z.kind]??0,b=z.damage*n.front;return[l(s.name),l(z.kind),z.explosion?`wybuch ${o(z.explosion.damage)}`:`${o(z.damage)}`,z.explosion?"—":`${o(b,1)}`,y>0?d(y):"0% (wybuchowy)",z.explosion?"—":o(b*(1-y),2)]}),c=m(["Strzelec","Pocisk","Obrażenia","Trafienie w przód","Szansa na rykoszet (przód)","Średnio na strzał w przód"],r);return`${a}
  <p class="muted">Kąt liczony między kierunkiem celowania marine a kierunkiem do źródła: atakujący (wręcz, szarża), kierunek, z którego nadleciał pocisk, albo środek wybuchu. Obrażenia bez kierunku (przegrzanie plazmy) — ×${o(n.side,2)}. Wybuchy i ciosy wręcz też dostają mnożnik strony, ale nie mają rykoszetu. Mnożnik działa razem z synapsą (obrażenia × synapsa × strona).</p>
  <h4>Rykoszet z przedniego pancerza</h4>${c}
  <p class="muted">Szansa = ${d(i.maxChance)} × (obrażenia najsłabszego pocisku Tyranidów / obrażenia tego pocisku), w granicach ${d(i.minChance)}–${d(i.maxChance)}. Liczą się bazowe obrażenia pocisku (synapsa ich nie zmienia). Odbity pocisk nie rani nikogo, odlatuje lustrzanie od pancerza (±${o(i.jitter*180/Math.PI,0)}°, ${d(i.speedMul)} prędkości) i znika po ${o(i.fadeTime,2)} s.</p>`}function ne(e){return`
  <p class="muted">Wszystkie liczby są generowane z kodu gry v${g}. Odległości w pikselach areny, czasy w sekundach. DPS = średnie obrażenia na sekundę przy trafieniu każdym pociskiem, z uwzględnieniem S vs T i pancerza (bez zasięgu, ciepła i zaparcia). Po kropce: czas zabicia jednego wroga z bazowym życiem (fala 1, solo).</p>
  <h3>Space Marine</h3>${ae(e)}
  <h3>Sprint</h3>${ie()}
  <h3>Pancerz kierunkowy i rykoszety</h3>${oe(e)}
  <h3>Bronie</h3>${Y(e)}
  <h4>Cechy specjalne</h4>${J(e)}
  <h3>Tyranidzi</h3>${V(e)}
  <h3>DPS broni vs każdy Tyranid (ciągły ogień, bez przeładowań)</h3>${P(e,"burst")}
  <h3>DPS z przeładowaniami (średnia na cały magazynek)</h3>${P(e,"sustained")}
  ${T(e)?`<h3>Plazma — strzały przeładowane (DPS)</h3>${T(e)}`:""}
  <h3>Profile 40k: Siła, Wytrzymałość, pancerz</h3>
  <p class="muted">Obrażenia trafienia = obrażenia × mnożnik S vs T, albo 0, jeśli pancerz zatrzyma pocisk (rzut przy każdym trafieniu). Broń bez profilu (wybuchy wrogów) ignoruje T i pancerz. Przykład: średnio na trafienie ${l(e.weaponOrder[0].name)} w ${l([...e.enemies.values()].at(-1).name)}: ${o(E(e.weaponOrder[0],[...e.enemies.values()].at(-1)),2)}.</p>
  ${X()}
  <h3>Fale</h3>${ee(e)}
  <h3>Trudność a liczba graczy</h3>${q(e)}`}function re(e){const n=e.weaponOrder,i=n.filter(p=>p.unlockAtWave===0).map(p=>l(p.name)).join(", "),a=n.filter(p=>p.unlockAtWave).map(p=>`<li><b>${l(p.name)}</b> — na starcie fali ${p.unlockAtWave}</li>`).join(""),t=e.enemy(e.director.bosses.enemy).name,r=e.director,c=h,s=O,z=p=>`${String(Number(p.toFixed(2))).replace(".",",")} s`,y=p=>`${Math.round(p*100)}%`,b=p=>`×${String(p).replace(".",",")}`,$=p=>String(Number(p.toFixed(2))).replace(".",","),k=j(r,1),w=A(e.enemies.values()),C=[...e.enemies.values()].filter(p=>p.ranged&&w[p.ranged.projectile.kind]).map(p=>`<b>${l(p.name)}</b> ${y(w[p.ranged.projectile.kind])}`).join(", "),S=[...e.enemies.values()].filter(p=>p.ranged&&!w[p.ranged.projectile.kind]).map(p=>l(p.name)).join(", ");return`
<header class="top">
  <a class="back" href="./">← WRÓĆ DO GRY</a>
  <h1>${l(e.title)} <span>· zasady</span></h1>
  <p class="muted">Wersja v${g}</p>
</header>
<nav class="toc">
  <a href="#cel">Cel</a><a href="#sterowanie">Sterowanie</a><a href="#sprint">Sprint</a><a href="#tryby">Tryby</a><a href="#multi">Multiplayer</a><a href="#glos">Czat głosowy</a><a href="#bron">Broń</a><a href="#pancerz">Pancerz</a><a href="#wrogowie">Tyranidzi</a><a href="#punkty">Punkty</a><a href="#rady">Rady</a><a href="#kompendium">Kompendium</a>
</nav>
<section id="cel"><h2>Cel gry</h2>
  <p>Jesteś Space Marine broniącym zrujnowanej iglicy ula. Tyranidzi atakują <b>falami</b> z wyłomów w ścianach i szybów w podłodze. Następna fala rusza dopiero, gdy zginie cała poprzednia (po ${r.waves.breather} s przerwy). Każda fala jest większa, a potwory mają więcej życia. Co ${r.bosses.everyWave}. fala od ${r.bosses.firstWave}. prowadzi boss — <b>${l(t)}</b>.</p>
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
      <li><b>Sprint lewym kciukiem</b> — to jedyny sposób na sprint na telefonie (bez osobnego przycisku). Gdy gałka dojdzie do okręgu drążka, marine idzie pełnym marszem (okrąg i gałka robią się złote). Za nim jest krótka przerwa, a dalej zewnętrzny, przerywany czerwono-pomarańczowy pierścień „»”: wypchnij kciuk do niego, a sprintujesz, dopóki go tam trzymasz (pierścień się zapala). Cofnięcie do środka kończy sprint. Szary pierścień z napisem NO STAMINA / FIRING znaczy, że sprint teraz nie ruszy (za mało kondycji albo trzymasz spust).</li>
      <li><b>Dotknij ikony broni</b> — zmiana broni</li>
      <li><b>⟳</b> — przeładowanie, <b>🔊</b> — dźwięk, <b>⏸</b> — menu</li>
      <li><b>⛶</b> — pełny ekran (Android). Na iPhonie: Udostępnij → „Do ekranu początkowego”, potem uruchamiaj grę z ikony.</li>
      <li>Najlepiej grać poziomo.</li>
    </ul></div>
  </div>
</section>
<section id="sprint"><h2>Sprint</h2>
  <p>Marine może na chwilę rzucić się biegiem: <b>${b(s.speedMul)}</b> zwykłej prędkości (${Math.round(u.speed*s.speedMul)} px/s — ciężar broni nie spowalnia sprintu). Sprint zaczyna się od razu, ale <b>w biegu nie da się strzelać</b> — spust jest ignorowany i nie przerywa sprintu.</p>
  <p><b>Sprint nie ruszy, póki trzymasz spust</b> (mysz/klawisz strzału albo strzelający drążek celowania): prośba o sprint (Shift albo drążek ruchu w pierścieniu sprintu) czeka, a gdy puścisz spust i nadal chcesz biec, sprint rusza od razu. Sprint, który już trwa, biegnie dalej — spust jest wtedy ignorowany, jak wyżej.</p>
  <ul>
    <li><b>Kondycja</b>: ${z(s.staminaMaxS)} sprintu (pasek pod marine). Kończy się sama przy zerze; ponownie ruszysz dopiero, gdy będzie co najmniej ${z(s.minToStartS)}.</li>
    <li>Kondycja wraca <b>tylko, gdy stoisz w miejscu</b> — pełna po ${z(s.staminaMaxS/s.regenStandingPerS)}. Zwykły marsz jej nie odnawia.</li>
    <li>Po sprincie broń jest gotowa dopiero po <b>${z(s.weaponReadyDelayS)}</b> (złoty pasek „READY…” na ikonie broni). Broń półautomatyczną trzeba wtedy nacisnąć ponownie.</li>
    <li>W sprincie marine patrzy tam, dokąd biegnie — <b>uciekając, nadstawiasz plecy</b> (tylny pancerz ${b(c.rear)}).</li>
    <li>Nie da się sprintować, podnosząc brata (w promieniu ${u.reviveRadius} px od powalonego).</li>
    <li>W sprincie marine biegnie z pustymi rękami (broni nie widać); po sprincie broń pojawia się i unosi do celu przez czas gotowości.</li>
    <li>Sprint innych graczy widać po kurzu i smugach za marine.</li>
  </ul>
</section>
<section id="tryby"><h2>Tryby gry</h2><ul>
  <li><b>SOLO DEPLOY</b> — samotna obrona. Esc pauzuje grę.</li>
  <li><b>HOST SQUAD (CO-OP)</b> — zakładasz pokój i zapraszasz do ${D} marines łącznie.</li>
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
  <p>Na start masz: <b>${i}</b>. Kolejne bronie odblokowują się wszystkim (żywym i powalonym) na początku kolejnych fal:</p><ul>${a}</ul>
  <p>Dodatkowo na mapie spadają <b>skrzynie z bronią</b> (co ${z(r.crates.intervalMin)}–${z(r.crates.intervalMax)}, średnio ${$(k.crates)} na falę w pojedynkę), a z zabitych Tyranidów — <b>apteczki</b> (do średnio ${$(k.medkits)} na falę w pojedynkę; więcej w większym oddziale, boss zawsze zostawia apteczkę). Każda broń ma rolę: ANTI-HORDE na roje drobnicy, ANTI-ELITE/ANTI-TANK na duże bestie.</p>
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
  <p><b>Rykoszet</b>: pocisk Tyranida, który trafi w przedni pancerz, może się od niego odbić — nie zadaje wtedy obrażeń, a od marine sypią się iskry. Najsłabsze pociski odbijają się w ${y(f.maxChance)} przypadków, mocniejsze rzadziej (najmniej ${y(f.minChance)}): ${C}.${S?` Pocisk wybuchowy (${S}) nigdy się nie odbija.`:""} Ciosy wręcz i wybuchy nie odbijają się nigdy.</p>
  <p>Przegrzanie plazmy rani zawsze tak samo, niezależnie od kierunku. Twój wybuch, który zahaczy brata, liczy się od środka wybuchu.</p>
</section>
<section id="wrogowie"><h2>Tyranidzi</h2><ul>
  ${[...e.enemies.values()].sort((p,I)=>p.threat-I.threat).map(p=>`<li><b>${l(p.name)}</b>${p.boss?' <b class="boss">BOSS</b>':""} — ${l(p.role)}</li>`).join("")}
</ul></section>
<section id="punkty"><h2>Punkty i ranking</h2>
  <p>Zabicie daje punkty marine, który zadał ostatni cios (wartości w kompendium). Na koniec misji widzisz podsumowanie oddziału i listę wszystkich zabitych Tyranidów.</p>
  <p>Ranking (<b>HONOURED DEAD</b>) jest osobny dla każdej wersji gry (obecnie tablica <b>${l(H(g))}</b>) i dla każdej liczby graczy. Są dwie listy: najdłuższe przetrwanie oddziału i najwyższe wyniki marines.</p>
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
  ${ne(e)}
  </details>
</section>
<footer class="muted">Nieoficjalny, niekomercyjny projekt fanowski. Nie jest powiązany z Games Workshop.</footer>`}const N=document.getElementById("rules");N.innerHTML=re(Z);location.hash==="#kompendium"&&N.querySelector("details")?.setAttribute("open","");
//# sourceMappingURL=rules-Dx8b6EAb.js.map
