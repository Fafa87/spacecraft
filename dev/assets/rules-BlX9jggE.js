import{G as f,X as l,a1 as L,P as y,c as T,a2 as K,a3 as h,o as O,J as F,j as G,a4 as v,a5 as H,a6 as R,a7 as Z,w as _,s as J,t as W,a8 as S,M as N,n as U,C as Y,E as Q,v as V}from"./format-C_yLf1Rv.js";const o=(e,n=1)=>{const i=Number(e.toFixed(n));return String(i).replace(".",",")},u=(e,n=0)=>`${o(e*100,n)}%`,B=e=>`${o(e*180/Math.PI,1)}°`,C=e=>e>=7?"brak":`${e}+`,x=e=>e?`-${e}`:"0";function m(e,n,i=""){return`<div class="tw"><table class="${i}"><thead><tr>${e.map(a=>`<th>${a}</th>`).join("")}</tr></thead><tbody>${n.map(a=>`<tr>${a.map((r,t)=>t===0?`<th scope="row">${r}</th>`:`<td>${r}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`}const X=e=>e.unlockAtWave===0?"od startu":e.unlockAtWave===null?"tylko skrzynie":`fala ${e.unlockAtWave}`;function q(e){const n=e.weaponOrder.map(i=>{const a=i.projectile,r=a.speed*a.lifetime;return[`${i.slot}. ${l(i.name)}`,l(i.roles.join(" · ")),l(F(i)),`${o(a.damage,1)}${i.pellets>1?` ×${i.pellets}`:""}${a.explosion?` + wybuch ${o(a.explosion.damage)} (r ${a.explosion.radius})`:""}${a.endBurst?` (pudło: ${o(a.endBurst.damage)}, r ${a.endBurst.radius})`:""}`,`${o(1/i.fireInterval,2)}/s`,`${i.magazine}`,`${o(i.reloadTime,2)} s`,B(i.spread),`${Math.round(r)} px`,`${a.pierce}`,`${u(i.moveSpeedMul)} / ${u(i.moveSpeedMul*i.fireMoveMul)}`,X(i),i.crateWeight?`${i.crateWeight}`:"—"]});return m(["Broń","Rola","Profil","Obrażenia / pocisk","Szybkostrzelność","Magazynek","Przeładowanie","Rozrzut","Zasięg","Przebicie","Ruch (zwykle / strzelając)","Dostępna","Waga w skrzyni"],n)}function ee(e){return`<ul class="specials">${e.weaponOrder.map(i=>{const a=i.projectile,r=[`odrzut ${a.knockback}`,`prędkość pocisku ${a.speed} px/s`];if(a.drag&&r.push(`hamowanie pocisku ${u(a.drag)}/s`),a.explosion&&r.push(`wybuch: ${o(a.explosion.damage)} obrażeń w promieniu ${a.explosion.radius} px (na krawędzi ${u(a.explosion.edgeFactor)})${a.explosion.strength!==void 0?`, S${a.explosion.strength} AP${x(a.explosion.ap)}`:""}${a.explosion.friendlyFire?", <b>rani też marines</b>":""}`),a.endBurst&&r.push(`wybuch na końcu zasięgu (gdy pocisk nikogo nie trafił): ${o(a.endBurst.damage)} obrażeń w promieniu ${a.endBurst.radius} px (na krawędzi ${u(a.endBurst.edgeFactor)})${a.endBurst.strength!==void 0?`, S${a.endBurst.strength} AP${x(a.endBurst.ap)}`:""}, ${a.endBurst.friendlyFire?"<b>rani też marines</b>":"tylko wrogowie"}`),i.braceDelay!==void 0&&r.push(`zaparcie: po ${o(i.braceDelay,2)} s bez ruchu strzela ×${o(i.braceFireRateMult??1,2)} szybciej, rozrzut ×${o(i.braceSpreadMult??1,2)}`),i.heat){const t=i.heat;r.push(`ciepło: +${t.perShot}/strzał, max ${t.max}, stygnie ${t.coolPerSec}/s; od ${u(t.superchargeAt)} strzały przeładowane (obrażenia ×${o(t.superchargeDamageMul,2)}, S+${t.superchargeStrength??0}, AP+${t.superchargeAp??0}); przegrzanie: ${t.selfDamage} obrażeń dla strzelca i ${o(t.ventTime,2)} s chłodzenia`)}return r.push(i.automatic?"automatyczna (trzymaj spust)":"półautomatyczna"),`<li><b>${l(i.name)}</b> — ${l(i.description)}<br><span class="muted">${r.join(" · ")}</span></li>`}).join("")}</ul>`}function A(e,n="burst"){const i=[...e.enemies.values()],a=e.weaponOrder.map(r=>[l(r.name),...i.map(t=>{const c=n==="burst"?R(r,t):Z(r,t),p=t.hp/c;return`${o(c,0)}<small>${Number.isFinite(p)?` · ${o(p,2)} s`:""}</small>`})]);return m(["Broń \\ cel",...i.map(r=>l(r.name))],a,"matrix")}function D(e){const n=e.weaponOrder.filter(a=>a.heat);if(!n.length)return"";const i=[...e.enemies.values()];return m(["Przeładowany strzał",...i.map(a=>l(a.name))],n.map(a=>[l(a.name),...i.map(r=>`${o(R(a,r,!0),0)}`)]),"matrix")}function ae(e,n){const i=[];if(e.behavior!=="kamikaze"&&e.contactDamage&&i.push(`wręcz ${e.contactDamage} co ${o(e.contactCooldown,2)} s (${o(e.contactDamage/e.contactCooldown,1)} DPS)`),e.ranged){const a=e.ranged;i.push(`strzał ${a.projectile.damage}${a.projectile.explosion?` + wybuch ${a.projectile.explosion.damage} (r ${a.projectile.explosion.radius})`:""} co ${o(a.cooldown,2)} s, zasięg ${a.range} px (trzyma dystans ${a.preferredDistance})`)}if(e.charge){const a=e.charge;i.push(`szarża: ${a.minDistance}–${a.triggerDistance} px, zamach ${o(a.windup,2)} s, ${o(a.duration,2)} s z prędkością ×${o(a.speedMul,2)}, ${a.damage} obrażeń, odnowienie ${o(a.cooldown,1)} s`)}if(e.explode){const a=e.explode;i.push(`wybuch ${a.damage} w promieniu ${a.radius} px (krawędź ${u(a.edgeFactor)}), lont ${o(a.fuse,2)} s od ${a.triggerDistance} px${a.onDeath?", wybucha też po śmierci":""}`)}return e.burrow&&i.push(`podkopuje się (×${o(e.burrow.speedMul,2)} prędkości, nie można trafić), wynurza się ${e.burrow.emergeDistance} px od marine`),e.synapse&&i.push(`synapsa: rój w promieniu ${e.synapse.radius} px szybszy ×${o(e.synapse.speedMul,2)}, obrażenia ×${o(e.synapse.damageMul,2)}`),e.spawner&&i.push(`wypuszcza ${l(n.enemies.get(e.spawner.enemy)?.name??e.spawner.enemy)} co ${o(e.spawner.interval,1)} s (max ${e.spawner.max}, gdy marine bliżej niż ${e.spawner.range} px)`),i.join("<br>")}function ie(e){const n=e.director.teamScaling.eliteThreat,i=[...e.enemies.values()].sort((a,r)=>a.threat-r.threat);return m(["Tyranid","Klasa","Życie","T","Pancerz","Prędkość","Rozmiar","Masa","Zagrożenie","Punkty","Apteczka","Ataki"],i.map(a=>[`${l(a.name)}<br><small class="muted">${l(a.role)}</small>`,a.boss?'<b class="boss">BOSS</b>':a.threat>=n?"ELITA":"rój",`${a.hp}`,`${a.toughness}`,C(a.save),`${a.speed} px/s`,`r ${a.radius}`,`${a.mass}`,`${o(a.threat,2)}`,`${a.points}`,u(a.medkitDropChance,1),ae(a,e)]))}function oe(){const e=[3,4,5,6,8,10],n=[3,4,5,6,8,9,10],i=m(["S \\ T",...e.map(c=>`T${c}`)],n.map(c=>[`S${c}`,...e.map(p=>`×${o(_(c,p),2)}`)]),"matrix"),a=[2,3,4,5,6,7],r=[0,1,2,3,4],t=m(["Pancerz \\ AP",...r.map(c=>`AP${x(c)}`)],a.map(c=>[C(c),...r.map(p=>u(J(c,p)))]),"matrix");return`<h4>Mnożnik obrażeń: Siła (S) broni vs Wytrzymałość (T) celu</h4>${i}
  <h4>Szansa, że pancerz zatrzyma trafienie</h4>${t}`}const P=(e,n)=>e[Math.min(n,e.length-1)]??1;function ne(e){const n=e.director.teamScaling,i=e.director,a=Array.from({length:W},(t,c)=>c),r=(t,c)=>[t,...a.map(p=>`×${o(P(c,p),2)}`)];return m(["Graczy",...a.map(t=>`${t+1}`)],[r("Liczba wrogów w fali (budżet)",n.budget),r("Tempo napływu",n.pace),r("Limit żywych naraz",n.maxAlive),r("Życie Tyranidów",n.hp),r(`Udział elit (zagrożenie ≥ ${n.eliteThreat})`,n.elite),r("Limit potomstwa (Rippery, miny)",n.children),["Bossy na pojawienie",...a.map(t=>`${P(i.bosses.count,t)}`)],["Apteczki z zabójstw / falę (średnio)",...a.map(t=>o(S(i,t+1).medkits,2))],["Skrzynie z bronią / falę (średnio)",...a.map(t=>o(S(i,t+1).crates,2))]],"matrix")}function re(e,n=15){const i=e.director,a=i.waves,r=[];for(let p=1;p<=n;p++){const d=a.budget.base+a.budget.perWave*Math.pow(p-1,a.budget.exponent),z=a.pace.base+a.pace.perWave*(p-1),k=Math.min(i.maxAlive.cap,i.maxAlive.base+i.maxAlive.perWave*(p-1)),b=1+a.hpScalePerWave*(p-1),w=p>=i.bosses.firstWave&&(p-i.bosses.firstWave)%i.bosses.everyWave===0,g=w?(p-i.bosses.firstWave)/i.bosses.everyWave:0;r.push([`${p}`,o(d,1),o(z,1),`${Math.round(k)}`,`×${o(b,2)}`,w?`${l(e.enemy(i.bosses.enemy).name)} (1 os.: ${P(i.bosses.count,0)+g*i.bosses.extraPerAppearance})`:"—"])}const t=[...e.enemies.keys()],c=m(["Od fali",...t.map(p=>l(e.enemy(p).name))],i.waveTable.map(p=>{const d=Object.values(p.weights).reduce((z,k)=>z+k,0);return[`${p.fromWave}`,...t.map(z=>p.weights[z]?u(p.weights[z]/d):"—")]}),"matrix");return`${m(["Fala","Budżet zagrożenia (solo)","Zagrożenie / s (solo)","Limit żywych (solo)","Życie wrogów","Boss"],r,"matrix")}
  <p class="muted">Budżet fali = (${a.budget.base} + ${a.budget.perWave}·(n−1)^${o(a.budget.exponent,2)}) × mnożnik drużyny. Każdy wróg „kosztuje” tyle, ile wynosi jego zagrożenie. Życie rośnie o ${u(a.hpScalePerWave)} na falę, razy mnożnik drużyny. Limit żywych: ${i.maxAlive.base} + ${i.maxAlive.perWave}/falę (maks. ${i.maxAlive.cap}). Pierwsza fala po ${a.firstDelay} s, przerwa między falami ${a.breather} s. Gdy zostanie ≤ ${a.reveal.remaining} wrogów (lub ${u(a.reveal.fraction)} fali), albo minie ${a.reveal.afterSec} s, resztki są ujawniane i polują (×${o(a.reveal.speedMul,2)} prędkości). Po ${a.forceNextAfter} s fala następna rusza i tak.</p>
  <h4>Skład fal (szansa na typ przy losowaniu, 1 gracz)</h4>${c}
  <p class="muted">W większej drużynie wagi elit mnożone są przez „udział elit” z tabeli wyżej.</p>`}function se(e){return m(["Parametr","Wartość"],[["Życie",`${y.maxHp}`],["Prędkość",`${y.speed} px/s (× mnożnik broni)`],["Powrót prędkości po puszczeniu spustu",`${y.fireMoveRecover} s`],["Czas na podniesienie (wykrwawienie)",`${y.bleedOutTime} s`],["Czas podnoszenia",`${y.reviveTime} s w promieniu ${y.reviveRadius} px`],["Życie po podniesieniu",u(y.reviveHpFraction)],["Nietykalność po trafieniu / podniesieniu",`${y.hurtInvuln} s / ${y.reviveInvuln} s`],["Pancerz (przód / boki / tył)",`×${o(h.front,2)} / ×${o(h.side,2)} / ×${o(h.rear,2)} obrażeń`],["Apteczka",`+${T.medkitHeal} życia, leży ${T.lifetime} s`],["Arena",`${e.map.arena.width} × ${e.map.arena.height} px`],["Symulacja",`${K} ticków/s`]])}function te(){const e=N;return m(["Parametr","Wartość"],[["Prędkość sprintu",`×${o(e.speedMul,2)} = ${o(y.speed*e.speedMul,0)} px/s (bez kary za broń)`],["Kondycja (maks.)",`${o(e.staminaMaxS,2)} s sprintu`],["Zużycie",`${o(e.drainPerS,2)} / s`],["Odnowa (tylko stojąc)",`${o(e.regenStandingPerS,3)} / s — pełna po ${o(e.staminaMaxS/e.regenStandingPerS,2)} s`],["Minimum do startu",`${o(e.minToStartS,2)} s`],["Broń gotowa po sprincie",`${o(e.weaponReadyDelayS,2)} s`],["Strzał w sprincie","niemożliwy (spust ignorowany)"],["Start sprintu przy wciśniętym spuście","wstrzymany do puszczenia spustu"],["Kierunek pancerza w sprincie","kierunek biegu"]])}function pe(e){const n=v,i=Math.PI/180,a=e.weaponOrder.map(t=>{const c=G(t.id);return[`${t.slot}. ${l(t.name)}`,`${o(c.kickDeg,2)}°`,`${o(c.kickDeg*n.standingMul,3)}°`,c.kickDistPx?`${o(c.kickDistPx,1)} px`:"—",`${o(c.maxDeg,1)}°`,`${o(H(c),2)} s`]}),r=`Mnożnik: stojąc / w zaparciu ×${o(n.standingMul,2)}, w pełnym marszu ×${o(n.walkingMul,2)} (pomiędzy — proporcjonalnie do prędkości). Kierunek kopnięcia losowy, ${u(.5+n.signBias)} w prawo. Limit odchylenia na broń; powrót wykładniczy (70% w podanym czasie). Odchylenie ${B(1*i)} na ${o(300,0)} px to ~${o(300*Math.tan(1*i),1)} px.`;return m(["Broń","Kopnięcie (marsz)","Kopnięcie (stojąc)","Odepchnięcie celownika","Maks. odchylenie","Powrót 70%"],a)+`<p class="muted">${r}</p>`}function ce(e){const n=h,i=U,a=m(["Strona","Kąt od kierunku celowania (w sprincie: biegu)","Mnożnik obrażeń","Rykoszet pocisków"],[["Przód",`0–${n.frontArcDeg}°`,`×${o(n.front,2)}`,"tak"],["Boki",`${n.frontArcDeg}–${180-n.rearArcDeg}°`,`×${o(n.side,2)}`,"nie"],["Tył",`${180-n.rearArcDeg}–180°`,`×${o(n.rear,2)}`,"nie"]]),r=O(e.enemies.values()),t=[...e.enemies.values()].filter(p=>p.ranged).map(p=>{const d=p.ranged.projectile,z=r[d.kind]??0,k=d.damage*n.front;return[l(p.name),l(d.kind),d.explosion?`wybuch ${o(d.explosion.damage)}`:`${o(d.damage)}`,d.explosion?"—":`${o(k,1)}`,z>0?u(z,1):"0% (wybuchowy)",d.explosion?"—":o(k*(1-z),2)]}),c=m(["Strzelec","Pocisk","Obrażenia","Trafienie w przód","Szansa na rykoszet (przód)","Średnio na strzał w przód"],t);return`${a}
  <p class="muted">Kąt liczony między kierunkiem celowania marine a kierunkiem do źródła: atakujący (wręcz, szarża), kierunek, z którego nadleciał pocisk, albo środek wybuchu. Obrażenia bez kierunku (przegrzanie plazmy) — ×${o(n.side,2)}. Wybuchy i ciosy wręcz też dostają mnożnik strony, ale nie mają rykoszetu. Mnożnik działa razem z synapsą (obrażenia × synapsa × strona).</p>
  <h4>Rykoszet z przedniego pancerza</h4>${c}
  <p class="muted">Szansa jest stała dla każdego rodzaju pocisku (tabela w danych gry); nowy pocisk bez wpisu dostaje ${u(i.defaultChance,1)}, pociski wybuchowe 0%. Synapsa jej nie zmienia. Odbity pocisk nie rani nikogo, odlatuje lustrzanie od pancerza (±${o(i.jitter*180/Math.PI,0)}°, ${u(i.speedMul)} prędkości) i znika po ${o(i.fadeTime,2)} s.</p>`}function le(e){return`
  <p class="muted">Wszystkie liczby są generowane z kodu gry v${f}. Odległości w pikselach areny, czasy w sekundach. DPS = średnie obrażenia na sekundę przy trafieniu każdym pociskiem, z uwzględnieniem S vs T i pancerza (bez zasięgu, ciepła i zaparcia). Po kropce: czas zabicia jednego wroga z bazowym życiem (fala 1, solo).</p>
  <h3>Space Marine</h3>${se(e)}
  <h3>Sprint</h3>${te()}
  <h3>Pancerz kierunkowy i rykoszety</h3>${ce(e)}
  <h3>Bronie</h3>${q(e)}
  <h3>Odrzut (odchylenie celownika)</h3>${pe(e)}
  <h4>Cechy specjalne</h4>${ee(e)}
  <h3>Tyranidzi</h3>${ie(e)}
  <h3>DPS broni vs każdy Tyranid (ciągły ogień, bez przeładowań)</h3>${A(e,"burst")}
  <h3>DPS z przeładowaniami (średnia na cały magazynek)</h3>${A(e,"sustained")}
  ${D(e)?`<h3>Plazma — strzały przeładowane (DPS)</h3>${D(e)}`:""}
  <h3>Profile 40k: Siła, Wytrzymałość, pancerz</h3>
  <p class="muted">Obrażenia trafienia = obrażenia × mnożnik S vs T, albo 0, jeśli pancerz zatrzyma pocisk (rzut przy każdym trafieniu). Broń bez profilu (wybuchy wrogów) ignoruje T i pancerz. Przykład: średnio na trafienie ${l(e.weaponOrder[0].name)} w ${l([...e.enemies.values()].at(-1).name)}: ${o(L(e.weaponOrder[0],[...e.enemies.values()].at(-1)),2)}.</p>
  ${oe()}
  <h3>Fale</h3>${re(e)}
  <h3>Trudność a liczba graczy</h3>${ne(e)}`}function de(e){const n=e.weaponOrder,i=n.filter(s=>s.unlockAtWave===0).map(s=>l(s.name)).join(", "),a=n.filter(s=>s.projectile.endBurst).map(s=>{const $=s.projectile.endBurst;return`<li><b>${l(s.name)}: spudłowany strzał też grzeje</b> — gdy pocisk doleci do końca zasięgu (${Math.round(s.projectile.speed*s.projectile.lifetime)} px), nie trafiwszy nikogo, błyska małym wybuchem cieplnym: ${$.damage} obrażeń w promieniu ${$.radius} px (na krawędzi ${Math.round($.edgeFactor*100)}%). Rani tylko Tyranidów, nigdy marines.</li>`}).join(""),r=n.filter(s=>s.unlockAtWave).map(s=>`<li><b>${l(s.name)}</b> — na starcie fali ${s.unlockAtWave}</li>`).join(""),t=e.enemy(e.director.bosses.enemy).name,c=e.director,p=h,d=N,z=s=>`${String(Number(s.toFixed(2))).replace(".",",")} s`,k=s=>`${String(Number((s*100).toFixed(1))).replace(".",",")}%`,b=s=>`×${String(s).replace(".",",")}`,w=s=>String(Number(s.toFixed(2))).replace(".",","),g=S(c,1),j=O(e.enemies.values()),E=[...e.enemies.values()].filter(s=>s.ranged&&j[s.ranged.projectile.kind]).map(s=>`<b>${l(s.name)}</b> ${k(j[s.ranged.projectile.kind])}`).join(", "),M=[...e.enemies.values()].filter(s=>s.ranged&&!j[s.ranged.projectile.kind]).map(s=>l(s.name)).join(", ");return`
<header class="top">
  <a class="back" href="./">← WRÓĆ DO GRY</a>
  <h1>${l(e.title)} <span>· zasady</span></h1>
  <p class="muted">Wersja v${f}</p>
</header>
<nav class="toc">
  <a href="#cel">Cel</a><a href="#sterowanie">Sterowanie</a><a href="#sprint">Sprint</a><a href="#tryby">Tryby</a><a href="#multi">Multiplayer</a><a href="#glos">Czat głosowy</a><a href="#bron">Broń</a><a href="#odrzut">Odrzut</a><a href="#pancerz">Pancerz</a><a href="#wrogowie">Tyranidzi</a><a href="#punkty">Punkty</a><a href="#rady">Rady</a><a href="#kompendium">Kompendium</a>
</nav>
<section id="cel"><h2>Cel gry</h2>
  <p>Jesteś Space Marine broniącym zrujnowanej iglicy ula. Tyranidzi atakują <b>falami</b> z wyłomów w ścianach i szybów w podłodze. Następna fala rusza dopiero, gdy zginie cała poprzednia (po ${c.waves.breather} s przerwy). Każda fala jest większa, a potwory mają więcej życia. Co ${c.bosses.everyWave}. fala od ${c.bosses.firstWave}. prowadzi boss — <b>${l(t)}</b>.</p>
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
  <p>Marine może na chwilę rzucić się biegiem: <b>${b(d.speedMul)}</b> zwykłej prędkości (${Math.round(y.speed*d.speedMul)} px/s — ciężar broni nie spowalnia sprintu). Sprint zaczyna się od razu, ale <b>w biegu nie da się strzelać</b> — spust jest ignorowany i nie przerywa sprintu.</p>
  <p><b>Sprint nie ruszy, póki trzymasz spust</b> (mysz/klawisz strzału albo strzelający drążek celowania): prośba o sprint (Shift albo drążek ruchu w pierścieniu sprintu) czeka, a gdy puścisz spust i nadal chcesz biec, sprint rusza od razu. Sprint, który już trwa, biegnie dalej — spust jest wtedy ignorowany, jak wyżej.</p>
  <ul>
    <li><b>Kondycja</b>: ${z(d.staminaMaxS)} sprintu (pasek pod marine). Kończy się sama przy zerze; ponownie ruszysz dopiero, gdy będzie co najmniej ${z(d.minToStartS)}.</li>
    <li>Kondycja wraca <b>tylko, gdy stoisz w miejscu</b> — pełna po ${z(d.staminaMaxS/d.regenStandingPerS)}. Zwykły marsz jej nie odnawia.</li>
    <li>Po sprincie broń jest gotowa dopiero po <b>${z(d.weaponReadyDelayS)}</b> (złoty pasek „READY…” na ikonie broni). Broń półautomatyczną trzeba wtedy nacisnąć ponownie.</li>
    <li>W sprincie marine patrzy tam, dokąd biegnie — <b>uciekając, nadstawiasz plecy</b> (tylny pancerz ${b(p.rear)}).</li>
    <li>Nie da się sprintować, podnosząc brata (w promieniu ${y.reviveRadius} px od powalonego).</li>
    <li>W sprincie marine biegnie z pustymi rękami (broni nie widać); po sprincie broń pojawia się i unosi do celu przez czas gotowości.</li>
    <li>Sprint innych graczy widać po kurzu i smugach za marine.</li>
  </ul>
</section>
<section id="tryby"><h2>Tryby gry</h2><ul>
  <li><b>SOLO DEPLOY</b> — samotna obrona. Esc pauzuje grę.</li>
  <li><b>HOST SQUAD (CO-OP)</b> — zakładasz pokój i zapraszasz do ${W} marines łącznie.</li>
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
<p><b>Ranny brat</b>: marine z zerowym życiem pada i czeka na pomoc. Stań obok niego (do ${y.reviveRadius} px) przez ${y.reviveTime} s, a wstanie z ${Math.round(y.reviveHpFraction*100)}% życia. Ma na to ${y.bleedOutTime} s — potem ginie.</p>
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
  <p>Na start masz: <b>${i}</b>. Kolejne bronie odblokowują się wszystkim (żywym i powalonym) na początku kolejnych fal:</p><ul>${r}</ul>
  <p>Dodatkowo na mapie spadają <b>skrzynie z bronią</b> (co ${z(c.crates.intervalMin)}–${z(c.crates.intervalMax)}, średnio ${w(g.crates)} na falę w pojedynkę), a z zabitych Tyranidów — <b>apteczki</b> (do średnio ${w(g.medkits)} na falę w pojedynkę; więcej w większym oddziale, boss zawsze zostawia apteczkę). Każda broń ma rolę: ANTI-HORDE na roje drobnicy, ANTI-ELITE/ANTI-TANK na duże bestie.</p>
  <ul>
    <li><b>Strzelanie spowalnia</b>: ciężka broń spowalnia zawsze, a przy wciśniętym spuście jeszcze bardziej.</li>
    <li><b>Zaparcie</b>: niektóre ciężkie bronie, gdy stoisz w miejscu, strzelają szybciej i celniej.</li>
    <li><b>Plazma się grzeje</b>: powyżej kreski strzały są przeładowane (mocniejsze), na szczycie broń się przegrzewa i rani strzelca.</li>
    <li><b>Siła vs Wytrzymałość i pancerz</b>: lekka broń odbija się od pancerza Carnifexa, Meltagun przebija wszystko.</li>
    ${a}
  </ul>
</section>
<section id="odrzut"><h2>Odrzut</h2>
  <p>Każdy strzał <b>kopie celownik</b> lekko w bok (losowo, częściej w prawo). Celownik na ekranie pokazuje dokładnie, gdzie poleci następny pocisk; jasna kropka — gdzie naprawdę wskazuje mysz lub drążek. Odchylenie samo wraca w ułamku sekundy.</p>
  <ul>
    <li><b>Stojąc</b> (i w zaparciu) odrzut to tylko <b>${b(v.standingMul)}</b> — strzelaj z miejsca, gdy liczy się celność.</li>
    <li><b>W marszu</b> odrzut jest pełny (${b(v.walkingMul)}), proporcjonalnie do prędkości.</li>
    <li>Najmocniej kopie <b>Meltagun</b>, w serii najbardziej rozjeżdża się <b>Heavy Bolter</b>; Miotacz ognia prawie nie ma odrzutu. Liczby — w kompendium.</li>
    <li>W grze przez sieć celownik gościa nadąża za odrzutem z opóźnieniem pingu.</li>
  </ul>
</section>
<section id="pancerz"><h2>Pancerz kierunkowy</h2>
  <p>Pancerz wspomagany najlepiej chroni z przodu. <b>Przód to kierunek, w którym celujesz</b> (mysz albo prawy kciuk; gdy na telefonie tylko idziesz — kierunek marszu; w sprincie — kierunek biegu). Liczy się, skąd przychodzi atak: przy ciosie wręcz i szarży — gdzie stoi potwór, przy pocisku — skąd nadleciał, przy wybuchu — gdzie jest jego środek.</p>
  <ul>
    <li><b>Przód</b> (±${p.frontArcDeg}° od kierunku celowania) — obrażenia <b>${b(p.front)}</b></li>
    <li><b>Boki</b> — obrażenia <b>${b(p.side)}</b></li>
    <li><b>Tył</b> (±${p.rearArcDeg}° od pleców) — obrażenia <b>${b(p.rear)}</b></li>
  </ul>
  <p><b>Rykoszet</b>: pocisk Tyranida, który trafi w przedni pancerz, może się od niego odbić — nie zadaje wtedy obrażeń, a od marine sypią się iskry. Szansa zależy od rodzaju pocisku — najsłabsze odbijają się najczęściej, mocniejsze rzadziej: ${E}.${M?` Pocisk wybuchowy (${M}) nigdy się nie odbija.`:""} Ciosy wręcz i wybuchy nie odbijają się nigdy.</p>
  <p>Przegrzanie plazmy rani zawsze tak samo, niezależnie od kierunku. Twój wybuch, który zahaczy brata, liczy się od środka wybuchu.</p>
</section>
<section id="wrogowie"><h2>Tyranidzi</h2><ul>
  ${[...e.enemies.values()].sort((s,$)=>s.threat-$.threat).map(s=>`<li><b>${l(s.name)}</b>${s.boss?' <b class="boss">BOSS</b>':""} — ${l(s.role)}</li>`).join("")}
</ul></section>
<section id="punkty"><h2>Punkty i ranking</h2>
  <p>Zabicie daje punkty marine, który zadał ostatni cios (wartości w kompendium). Na koniec misji widzisz podsumowanie oddziału i listę wszystkich zabitych Tyranidów.</p>
  <p>Ranking (<b>HONOURED DEAD</b>) jest osobny dla każdej wersji gry (obecnie tablica <b>${l(Y(Q(f)))}</b>) i dla każdej liczby graczy. Są dwie listy: najdłuższe przetrwanie oddziału i najwyższe wyniki marines.</p>
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
  ${le(e)}
  </details>
</section>
<footer class="muted">Nieoficjalny, niekomercyjny projekt fanowski. Nie jest powiązany z Games Workshop.</footer>`}const I=document.getElementById("rules");I.innerHTML=de(V);location.hash==="#kompendium"&&I.querySelector("details")?.setAttribute("open","");
//# sourceMappingURL=rules-BlX9jggE.js.map
