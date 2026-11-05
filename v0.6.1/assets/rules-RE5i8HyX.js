import{G as h,e as l,P as b,a as R,u as H,w as _,v as M,x as U,M as N,h as Z,l as J,d as Y}from"./format-BVao54bB.js";import{A as Q,M as g,B as f,m as B,v as V,C as I,D as q,w as X,s as ee,E as x,h as C,l as ae}from"./director-BttZ7d9y.js";const o=(e,r=1)=>{const i=Number(e.toFixed(r));return String(i).replace(".",",")},u=(e,r=0)=>`${o(e*100,r)}%`,E=e=>`${o(e*180/Math.PI,1)}°`,L=e=>e>=7?"brak":`${e}+`,P=e=>e?`-${e}`:"0";function m(e,r,i=""){return`<div class="tw"><table class="${i}"><thead><tr>${e.map(a=>`<th>${a}</th>`).join("")}</tr></thead><tbody>${r.map(a=>`<tr>${a.map((n,c)=>c===0?`<th scope="row">${n}</th>`:`<td>${n}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`}const ie=e=>e.unlockAtWave===0?"od startu":e.unlockAtWave===null?"tylko skrzynie":`fala ${e.unlockAtWave}`;function oe(e){const r=e.weaponOrder.map(i=>{const a=i.projectile,n=a.speed*a.lifetime;return[`${i.slot}. ${l(i.name)}`,l(i.roles.join(" · ")),l(V(i)),`${o(a.damage,1)}${i.pellets>1?` ×${i.pellets}`:""}${a.explosion?` + wybuch ${o(a.explosion.damage)} (r ${a.explosion.radius})`:""}${a.endBurst?` (koniec zasięgu: ${o(a.endBurst.damage)}, r ${a.endBurst.radius})`:""}`,`${o(1/i.fireInterval,2)}/s`,`${i.magazine}`,`${o(i.reloadTime,2)} s`,E(i.spread),`${Math.round(n)} px`,`${a.pierce}`,`${u(i.moveSpeedMul)} / ${u(i.moveSpeedMul*i.fireMoveMul)}`,ie(i),i.crateWeight?`${i.crateWeight}`:"—"]});return m(["Broń","Rola","Profil","Obrażenia / pocisk","Szybkostrzelność","Magazynek","Przeładowanie","Rozrzut","Zasięg","Przebicie","Ruch (zwykle / strzelając)","Dostępna","Waga w skrzyni"],r)}function re(e){return`<ul class="specials">${e.weaponOrder.map(i=>{const a=i.projectile,n=[`odrzut ${a.knockback}`,`prędkość pocisku ${a.speed} px/s`];if(a.drag&&n.push(`hamowanie pocisku ${u(a.drag)}/s`),a.explosion&&n.push(`wybuch: ${o(a.explosion.damage)} obrażeń w promieniu ${a.explosion.radius} px (na krawędzi ${u(a.explosion.edgeFactor)})${a.explosion.strength!==void 0?`, S${a.explosion.strength} AP${P(a.explosion.ap)}`:""}${a.explosion.friendlyFire?", <b>rani też marines</b>":""}`),a.endBurst&&n.push(`wybuch na końcu zasięgu (pudło albo po przebiciu — promień leci do max; nie po wyjściu z areny): ${o(a.endBurst.damage)} obrażeń w promieniu ${a.endBurst.radius} px (na krawędzi ${u(a.endBurst.edgeFactor)})${a.endBurst.strength!==void 0?`, S${a.endBurst.strength} AP${P(a.endBurst.ap)}`:""}, ${a.endBurst.friendlyFire?"<b>rani też marines</b>":"tylko wrogowie"}`),i.braceDelay!==void 0&&n.push(`zaparcie: po ${o(i.braceDelay,2)} s bez ruchu strzela ×${o(i.braceFireRateMult??1,2)} szybciej, rozrzut ×${o(i.braceSpreadMult??1,2)}`),i.heat){const c=i.heat;n.push(`ciepło: +${c.perShot}/strzał, max ${c.max}, stygnie ${c.coolPerSec}/s; od ${u(c.superchargeAt)} strzały przeładowane (obrażenia ×${o(c.superchargeDamageMul,2)}, S+${c.superchargeStrength??0}, AP+${c.superchargeAp??0}); przegrzanie: ${c.selfDamage} obrażeń dla strzelca i ${o(c.ventTime,2)} s chłodzenia`)}return n.push(i.automatic?"automatyczna (trzymaj spust)":"półautomatyczna"),`<li><b>${l(i.name)}</b> — ${l(i.description)}<br><span class="muted">${n.join(" · ")}</span></li>`}).join("")}</ul>`}function O(e,r="burst"){const i=[...e.enemies.values()],a=e.weaponOrder.map(n=>[l(n.name),...i.map(c=>{const p=r==="burst"?I(n,c):q(n,c),s=c.hp/p;return`${o(p,0)}<small>${Number.isFinite(s)?` · ${o(s,2)} s`:""}</small>`})]);return m(["Broń \\ cel",...i.map(n=>l(n.name))],a,"matrix")}function W(e){const r=e.weaponOrder.filter(a=>a.heat);if(!r.length)return"";const i=[...e.enemies.values()];return m(["Przeładowany strzał",...i.map(a=>l(a.name))],r.map(a=>[l(a.name),...i.map(n=>`${o(I(a,n,!0),0)}`)]),"matrix")}function ne(e,r){const i=[];if(e.behavior!=="kamikaze"&&e.contactDamage&&i.push(`wręcz ${e.contactDamage} co ${o(e.contactCooldown,2)} s (${o(e.contactDamage/e.contactCooldown,1)} DPS)`),e.ranged){const a=e.ranged;i.push(`strzał ${a.projectile.damage}${a.projectile.explosion?` + wybuch ${a.projectile.explosion.damage} (r ${a.projectile.explosion.radius})`:""} co ${o(a.cooldown,2)} s, zasięg ${a.range} px (trzyma dystans ${a.preferredDistance})`)}if(e.charge){const a=e.charge;i.push(`szarża: ${a.minDistance}–${a.triggerDistance} px, zamach ${o(a.windup,2)} s, ${o(a.duration,2)} s z prędkością ×${o(a.speedMul,2)}, ${a.damage} obrażeń, odnowienie ${o(a.cooldown,1)} s`)}if(e.explode){const a=e.explode;i.push(`wybuch ${a.damage} w promieniu ${a.radius} px (krawędź ${u(a.edgeFactor)}), lont ${o(a.fuse,2)} s od ${a.triggerDistance} px${a.onDeath?", wybucha też po śmierci":""}`)}return e.burrow&&i.push(`podkopuje się (×${o(e.burrow.speedMul,2)} prędkości, nie można trafić), wynurza się ${e.burrow.emergeDistance} px od marine`),e.synapse&&i.push(`synapsa: rój w promieniu ${e.synapse.radius} px szybszy ×${o(e.synapse.speedMul,2)}, obrażenia ×${o(e.synapse.damageMul,2)}`),e.spawner&&i.push(`wypuszcza ${l(r.enemies.get(e.spawner.enemy)?.name??e.spawner.enemy)} co ${o(e.spawner.interval,1)} s (max ${e.spawner.max}, gdy marine bliżej niż ${e.spawner.range} px)`),i.join("<br>")}function se(e){const r=e.director.teamScaling.eliteThreat,i=[...e.enemies.values()].sort((a,n)=>a.threat-n.threat);return m(["Tyranid","Klasa","Życie","T","Pancerz","Prędkość","Rozmiar","Masa","Zagrożenie","Punkty","Apteczka","Ataki"],i.map(a=>[`${l(a.name)}<br><small class="muted">${l(a.role)}</small>`,a.boss?'<b class="boss">BOSS</b>':a.threat>=r?"ELITA":"rój",`${a.hp}`,`${a.toughness}`,L(a.save),`${a.speed} px/s`,`r ${a.radius}`,`${a.mass}`,`${o(a.threat,2)}`,`${a.points}`,u(a.medkitDropChance,1),ne(a,e)]))}function te(){const e=[3,4,5,6,8,10],r=[3,4,5,6,8,9,10],i=m(["S \\ T",...e.map(p=>`T${p}`)],r.map(p=>[`S${p}`,...e.map(s=>`×${o(X(p,s),2)}`)]),"matrix"),a=[2,3,4,5,6,7],n=[0,1,2,3,4],c=m(["Pancerz \\ AP",...n.map(p=>`AP${P(p)}`)],a.map(p=>[L(p),...n.map(s=>u(ee(p,s)))]),"matrix");return`<h4>Mnożnik obrażeń: Siła (S) broni vs Wytrzymałość (T) celu</h4>${i}
  <h4>Szansa, że pancerz zatrzyma trafienie</h4>${c}`}const A=(e,r)=>e[Math.min(r,e.length-1)]??1;function ce(e){const r=e.director.teamScaling,i=e.director,a=Array.from({length:N},(c,p)=>p),n=(c,p)=>[c,...a.map(s=>`×${o(A(p,s),2)}`)];return m(["Graczy",...a.map(c=>`${c+1}`)],[n("Liczba wrogów w fali (budżet)",r.budget),n("Tempo napływu",r.pace),n("Limit żywych naraz",r.maxAlive),n("Życie Tyranidów",r.hp),n(`Udział elit (zagrożenie ≥ ${r.eliteThreat})`,r.elite),n("Limit potomstwa (Rippery, miny)",r.children),["Bossy na pojawienie",...a.map(c=>`${A(i.bosses.count,c)}`)],["Apteczki z zabójstw / falę (średnio)",...a.map(c=>o(x(i,c+1).medkits,2))],["Skrzynie z bronią / falę (średnio)",...a.map(c=>o(x(i,c+1).crates,2))]],"matrix")}function pe(e,r=15){const i=e.director,a=i.waves,n=[];for(let s=1;s<=r;s++){const k=a.budget.base+a.budget.perWave*Math.pow(s-1,a.budget.exponent),d=a.pace.base+a.pace.perWave*(s-1),z=Math.min(i.maxAlive.cap,i.maxAlive.base+i.maxAlive.perWave*(s-1)),w=1+a.hpScalePerWave*(s-1),y=s>=i.bosses.firstWave&&(s-i.bosses.firstWave)%i.bosses.everyWave===0,$=y?(s-i.bosses.firstWave)/i.bosses.everyWave:0;n.push([`${s}`,o(k,1),o(d,1),`${Math.round(z)}`,`×${o(w,2)}`,y?`${l(e.enemy(i.bosses.enemy).name)} (1 os.: ${A(i.bosses.count,0)+$*i.bosses.extraPerAppearance})`:"—"])}const c=[...e.enemies.keys()],p=m(["Od fali",...c.map(s=>l(e.enemy(s).name))],i.waveTable.map(s=>{const k=Object.values(s.weights).reduce((d,z)=>d+z,0);return[`${s.fromWave}`,...c.map(d=>s.weights[d]?u(s.weights[d]/k):"—")]}),"matrix");return`${m(["Fala","Budżet zagrożenia (solo)","Zagrożenie / s (solo)","Limit żywych (solo)","Życie wrogów","Boss"],n,"matrix")}
  <p class="muted">Budżet fali = (${a.budget.base} + ${a.budget.perWave}·(n−1)^${o(a.budget.exponent,2)}) × mnożnik drużyny. Każdy wróg „kosztuje” tyle, ile wynosi jego zagrożenie. Życie rośnie o ${u(a.hpScalePerWave)} na falę, razy mnożnik drużyny. Limit żywych: ${i.maxAlive.base} + ${i.maxAlive.perWave}/falę (maks. ${i.maxAlive.cap}). Pierwsza fala po ${a.firstDelay} s, przerwa między falami ${a.breather} s. Gdy zostanie ≤ ${a.reveal.remaining} wrogów (lub ${u(a.reveal.fraction)} fali), albo minie ${a.reveal.afterSec} s, resztki są ujawniane i polują (×${o(a.reveal.speedMul,2)} prędkości). Po ${a.forceNextAfter} s fala następna rusza i tak.</p>
  <h4>Skład fal (szansa na typ przy losowaniu, 1 gracz)</h4>${p}
  <p class="muted">W większej drużynie wagi elit mnożone są przez „udział elit” z tabeli wyżej.</p>`}function le(e){return m(["Parametr","Wartość"],[["Życie",`${b.maxHp}`],["Prędkość",`${b.speed} px/s (× mnożnik broni)`],["Powrót prędkości po puszczeniu spustu",`${b.fireMoveRecover} s`],["Czas na podniesienie (wykrwawienie)",`${b.bleedOutTime} s`],["Czas podnoszenia",`${b.reviveTime} s w promieniu ${b.reviveRadius} px`],["Życie po podniesieniu",u(b.reviveHpFraction)],["Nietykalność po trafieniu / podniesieniu",`${b.hurtInvuln} s / ${b.reviveInvuln} s`],["Pancerz (przód / boki / tył)",`×${o(f.front,2)} / ×${o(f.side,2)} / ×${o(f.rear,2)} obrażeń`],["Postawa obronna — przód",`×${o(g.frontMul,2)} (+${Math.round(g.frontArmourBonus*100)}% pancerza); rykoszet: nie-odbicie ×${o(g.nonDeflectFactor,2)}; trafiony pocisk ×${o(g.landedDamageMul,2)}`],["Apteczka",`+${R.medkitHeal} życia, leży ${R.lifetime} s`],["Arena",`${e.map.arena.width} × ${e.map.arena.height} px`],["Symulacja",`${H} ticków/s`]])}function de(){const e=C;return m(["Parametr","Wartość"],[["Prędkość sprintu",`×${o(e.speedMul,2)} = ${o(b.speed*e.speedMul,0)} px/s (bez kary za broń)`],["Kondycja (maks.)",`${o(e.staminaMaxS,2)} s sprintu`],["Zużycie",`${o(e.drainPerS,2)} / s`],["Odnowa (tylko stojąc)",`${o(e.regenStandingPerS,3)} / s — pełna po ${o(e.staminaMaxS/e.regenStandingPerS,2)} s`],["Minimum do startu",`${o(e.minToStartS,2)} s`],["Broń gotowa po sprincie",`${o(e.weaponReadyDelayS,2)} s`],["Strzał w sprincie","niemożliwy (spust ignorowany)"],["Start sprintu przy wciśniętym spuście","wstrzymany do puszczenia spustu"],["Kierunek pancerza w sprincie","kierunek biegu"]])}function ze(e){const r=M,i=Math.PI/180,a=e.weaponOrder.map(c=>{const p=_(c.id);return[`${c.slot}. ${l(c.name)}`,`${o(p.kickDeg,2)}°`,`${o(p.kickDeg*r.standingMul,3)}°`,p.kickDistPx?`${o(p.kickDistPx,1)} px`:"—",`${o(p.maxDeg,1)}°`,`${o(U(p),2)} s`]}),n=`Mnożnik: stojąc / w zaparciu ×${o(r.standingMul,2)}, w pełnym marszu ×${o(r.walkingMul,2)} (pomiędzy — proporcjonalnie do prędkości). Kierunek kopnięcia losowy, ${u(.5+r.signBias)} w prawo. Limit odchylenia na broń; powrót wykładniczy (70% w podanym czasie). Odchylenie ${E(1*i)} na ${o(300,0)} px to ~${o(300*Math.tan(1*i),1)} px.`;return m(["Broń","Kopnięcie (marsz)","Kopnięcie (stojąc)","Odepchnięcie celownika","Maks. odchylenie","Powrót 70%"],a)+`<p class="muted">${n}</p>`}function ue(e){const r=f,i=ae,a=m(["Strona","Kąt od kierunku celowania (w sprincie: biegu)","Mnożnik obrażeń","Rykoszet pocisków"],[["Przód",`0–${r.frontArcDeg}°`,`×${o(r.front,2)}`,"tak"],["Boki",`${r.frontArcDeg}–${180-r.rearArcDeg}°`,`×${o(r.side,2)}`,"nie"],["Tył",`${180-r.rearArcDeg}–180°`,`×${o(r.rear,2)}`,"nie"]]),n=B(e.enemies.values()),c=[...e.enemies.values()].filter(d=>d.ranged).map(d=>{const z=d.ranged.projectile,w=n[z.kind]??0,y=z.damage*r.front;return[l(d.name),l(z.kind),z.explosion?`wybuch ${o(z.explosion.damage)}`:`${o(z.damage)}`,z.explosion?"—":`${o(y,1)}`,w>0?u(w,1):"0% (wybuchowy)",z.explosion?"—":o(y*(1-w),2)]}),p=m(["Strzelec","Pocisk","Obrażenia","Trafienie w przód","Szansa na rykoszet (przód)","Średnio na strzał w przód"],c),s=g,k=m(["Efekt postawy obronnej (stój + trzymanie)","Wartość"],[["Pancerz przedni",`×${o(s.frontMul,2)} (zamiast ×${o(r.front,2)}; +${Math.round(s.frontArmourBonus*100)}%)`],["Szansa rykoszetu",`1 − ${o(s.nonDeflectFactor,2)}·(1 − baza) — np. baza 50% → ${u(1-s.nonDeflectFactor*.5,1)}`],["Pocisk z przodu, który przeszedł",`×${o(s.landedDamageMul,2)} obrażeń (−${Math.round((1-s.landedDamageMul)*100)}%)`],["Sterowanie","RMB (PC) / 🛡 GUARD (telefon); koniec przy ruchu"]]);return`${a}
  <p class="muted">Kąt liczony między kierunkiem celowania marine a kierunkiem do źródła: atakujący (wręcz, szarża), kierunek, z którego nadleciał pocisk, albo środek wybuchu. Obrażenia bez kierunku (przegrzanie plazmy) — ×${o(r.side,2)}. Wybuchy i ciosy wręcz też dostają mnożnik strony, ale nie mają rykoszetu. Mnożnik działa razem z synapsą (obrażenia × synapsa × strona). Stałe: <code>data/armour.ts</code>, postawa: <code>data/guard.ts</code>.</p>
  <h4>Rykoszet z przedniego pancerza</h4>${p}
  <p class="muted">Szansa jest stała dla każdego rodzaju pocisku (tabela w danych gry); nowy pocisk bez wpisu dostaje ${u(i.defaultChance,1)}, pociski wybuchowe 0%. Synapsa jej nie zmienia. Odbity pocisk nie rani nikogo, odlatuje lustrzanie od pancerza (±${o(i.jitter*180/Math.PI,0)}°, ${u(i.speedMul)} prędkości) i znika po ${o(i.fadeTime,2)} s.</p>
  <h4>Postawa obronna</h4>${k}`}function ye(e){return`
  <p class="muted">Wszystkie liczby są generowane z kodu gry v${h}. Odległości w pikselach areny, czasy w sekundach. DPS = średnie obrażenia na sekundę przy trafieniu każdym pociskiem, z uwzględnieniem S vs T i pancerza (bez zasięgu, ciepła i zaparcia). Po kropce: czas zabicia jednego wroga z bazowym życiem (fala 1, solo).</p>
  <h3>Space Marine</h3>${le(e)}
  <h3>Sprint</h3>${de()}
  <h3>Pancerz kierunkowy i rykoszety</h3>${ue(e)}
  <h3>Bronie</h3>${oe(e)}
  <h3>Odrzut (odchylenie celownika)</h3>${ze(e)}
  <h4>Cechy specjalne</h4>${re(e)}
  <h3>Tyranidzi</h3>${se(e)}
  <h3>DPS broni vs każdy Tyranid (ciągły ogień, bez przeładowań)</h3>${O(e,"burst")}
  <h3>DPS z przeładowaniami (średnia na cały magazynek)</h3>${O(e,"sustained")}
  ${W(e)?`<h3>Plazma — strzały przeładowane (DPS)</h3>${W(e)}`:""}
  <h3>Profile 40k: Siła, Wytrzymałość, pancerz</h3>
  <p class="muted">Obrażenia trafienia = obrażenia × mnożnik S vs T, albo 0, jeśli pancerz zatrzyma pocisk (rzut przy każdym trafieniu). Broń bez profilu (wybuchy wrogów) ignoruje T i pancerz. Przykład: średnio na trafienie ${l(e.weaponOrder[0].name)} w ${l([...e.enemies.values()].at(-1).name)}: ${o(Q(e.weaponOrder[0],[...e.enemies.values()].at(-1)),2)}.</p>
  ${te()}
  <h3>Fale</h3>${pe(e)}
  <h3>Trudność a liczba graczy</h3>${ce(e)}`}function be(e){const r=e.weaponOrder,i=r.filter(t=>t.unlockAtWave===0).map(t=>l(t.name)).join(", "),a=r.filter(t=>t.projectile.endBurst).map(t=>{const j=t.projectile.endBurst;return`<li><b>${l(t.name)}: błysk na końcu zasięgu</b> — gdy pocisk doleci do końca zasięgu (${Math.round(t.projectile.speed*t.projectile.lifetime)} px), błyska małym wybuchem cieplnym: ${j.damage} obrażeń w promieniu ${j.radius} px (na krawędzi ${Math.round(j.edgeFactor*100)}%). Działa też po przebiciu celów (promień leci dalej); nie ma błysku po wyjściu poza arenę. Rani tylko Tyranidów, nigdy marines.</li>`}).join(""),n=r.filter(t=>t.unlockAtWave).map(t=>`<li><b>${l(t.name)}</b> — na starcie fali ${t.unlockAtWave}</li>`).join(""),c=e.enemy(e.director.bosses.enemy).name,p=e.director,s=f,k=g,d=C,z=t=>`${String(Number(t.toFixed(2))).replace(".",",")} s`,w=t=>`${String(Number((t*100).toFixed(1))).replace(".",",")}%`,y=t=>`×${String(t).replace(".",",")}`,$=t=>String(Number(t.toFixed(2))).replace(".",","),D=x(p,1),S=B(e.enemies.values()),G=[...e.enemies.values()].filter(t=>t.ranged&&S[t.ranged.projectile.kind]).map(t=>`<b>${l(t.name)}</b> ${w(S[t.ranged.projectile.kind])}`).join(", "),T=[...e.enemies.values()].filter(t=>t.ranged&&!S[t.ranged.projectile.kind]).map(t=>l(t.name)).join(", "),v=Z(J(h)),K=v!==h?`; v${l(h)} dzieli tę tablicę z v${l(v)} (bez osobnego boards/${l(h)})`:"";return`
<header class="top">
  <a class="back" href="./">← WRÓĆ DO GRY</a>
  <h1>${l(e.title)} <span>· zasady</span></h1>
  <p class="muted">Wersja v${h}</p>
</header>
<nav class="toc">
  <a href="#cel">Cel</a><a href="#sterowanie">Sterowanie</a><a href="#sprint">Sprint</a><a href="#tryby">Tryby</a><a href="#multi">Multiplayer</a><a href="#glos">Czat głosowy</a><a href="#bron">Broń</a><a href="#odrzut">Odrzut</a><a href="#pancerz">Pancerz</a><a href="#postawa">Postawa obronna</a><a href="#wrogowie">Tyranidzi</a><a href="#punkty">Punkty</a><a href="#rady">Rady</a><a href="#kompendium">Kompendium</a>
</nav>
<section id="cel"><h2>Cel gry</h2>
  <p>Jesteś Space Marine broniącym zrujnowanej iglicy ula. Tyranidzi atakują <b>falami</b> z wyłomów w ścianach i szybów w podłodze. Następna fala rusza dopiero, gdy zginie cała poprzednia (po ${p.waves.breather} s przerwy). Każda fala jest większa, a potwory mają więcej życia. Co ${p.bosses.everyWave}. fala od ${p.bosses.firstWave}. prowadzi boss — <b>${l(c)}</b>.</p>
  <p>Gra kończy się, gdy padnie cały oddział. Liczy się czas przetrwania i punkty za zabicia.</p>
</section>
<section id="sterowanie"><h2>Sterowanie</h2>
  <div class="two">
    <div><h3>Komputer</h3><ul>
      <li><b>WASD / strzałki</b> — ruch</li>
      <li><b>Mysz</b> — celowanie</li>
      <li><b>Lewy przycisk / Spacja</b> — strzał (przytrzymaj przy broni automatycznej)</li>
      <li><b>1–${r.length}</b>, <b>Q / E</b>, <b>kółko myszy</b> — zmiana broni</li>
      <li><b>Shift</b> (przytrzymaj) — sprint</li>
      <li><b>Prawy przycisk myszy</b> (przytrzymaj) — postawa obronna (tylko stojąc w miejscu)</li>
      <li><b>R</b> — przeładowanie</li>
      <li><b>M</b> — wycisz dźwięk</li>
      <li><b>Esc</b> — menu / wyjście (w grze solo pauza)</li>
    </ul></div>
    <div><h3>Telefon / tablet</h3><ul>
      <li><b>Lewy kciuk</b> (lewa połowa ekranu) — ruch</li>
      <li><b>Prawy kciuk</b> — celowanie i automatyczny ogień</li>
      <li><b>Sprint lewym kciukiem</b> — to jedyny sposób na sprint na telefonie (bez osobnego przycisku). Gdy gałka dojdzie do okręgu drążka, marine idzie pełnym marszem (okrąg i gałka robią się złote). Za nim jest krótka przerwa, a dalej zewnętrzny, przerywany czerwono-pomarańczowy pierścień „»”: wypchnij kciuk do niego, a sprintujesz, dopóki go tam trzymasz (pierścień się zapala). Cofnięcie do środka kończy sprint. Szary pierścień z napisem NO STAMINA / FIRING znaczy, że sprint teraz nie ruszy (za mało kondycji albo trzymasz spust).</li>
      <li><b>Dotknij ikony broni</b> — zmiana broni</li>
      <li><b>🛡 GUARD</b> (przytrzymaj, prawa strona) — postawa obronna (tylko stojąc w miejscu)</li>
      <li><b>⟳</b> — przeładowanie, <b>🔊</b> — dźwięk, <b>⏸</b> — menu</li>
      <li><b>⛶</b> — pełny ekran (Android). Na iPhonie: Udostępnij → „Do ekranu początkowego”, potem uruchamiaj grę z ikony.</li>
      <li>Najlepiej grać poziomo.</li>
    </ul></div>
  </div>
</section>
<section id="sprint"><h2>Sprint</h2>
  <p>Marine może na chwilę rzucić się biegiem: <b>${y(d.speedMul)}</b> zwykłej prędkości (${Math.round(b.speed*d.speedMul)} px/s — ciężar broni nie spowalnia sprintu). Sprint zaczyna się od razu, ale <b>w biegu nie da się strzelać</b> — spust jest ignorowany i nie przerywa sprintu.</p>
  <p><b>Sprint nie ruszy, póki trzymasz spust</b> (mysz/klawisz strzału albo strzelający drążek celowania): prośba o sprint (Shift albo drążek ruchu w pierścieniu sprintu) czeka, a gdy puścisz spust i nadal chcesz biec, sprint rusza od razu. Sprint, który już trwa, biegnie dalej — spust jest wtedy ignorowany, jak wyżej.</p>
  <ul>
    <li><b>Kondycja</b>: ${z(d.staminaMaxS)} sprintu (pasek pod marine). Kończy się sama przy zerze; ponownie ruszysz dopiero, gdy będzie co najmniej ${z(d.minToStartS)}.</li>
    <li>Kondycja wraca <b>tylko, gdy stoisz w miejscu</b> — pełna po ${z(d.staminaMaxS/d.regenStandingPerS)}. Zwykły marsz jej nie odnawia.</li>
    <li>Po sprincie broń jest gotowa dopiero po <b>${z(d.weaponReadyDelayS)}</b> (złoty pasek „READY…” na ikonie broni). Broń półautomatyczną trzeba wtedy nacisnąć ponownie.</li>
    <li>W sprincie marine patrzy tam, dokąd biegnie — <b>uciekając, nadstawiasz plecy</b> (tylny pancerz ${y(s.rear)}).</li>
    <li>Nie da się sprintować, podnosząc brata (w promieniu ${b.reviveRadius} px od powalonego).</li>
    <li>W sprincie marine biegnie z pustymi rękami (broni nie widać); po sprincie broń pojawia się i unosi do celu przez czas gotowości.</li>
    <li>Sprint innych graczy widać po kurzu i smugach za marine.</li>
  </ul>
</section>
<section id="tryby"><h2>Tryby gry</h2><ul>
  <li><b>SOLO DEPLOY</b> — samotna obrona. Esc pauzuje grę.</li>
  <li><b>HOST SQUAD (CO-OP)</b> — zakładasz pokój i zapraszasz do ${N} marines łącznie.</li>
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
<p><b>Ranny brat</b>: marine z zerowym życiem pada i czeka na pomoc. Stań obok niego (do ${b.reviveRadius} px) przez ${b.reviveTime} s, a wstanie z ${Math.round(b.reviveHpFraction*100)}% życia. Ma na to ${b.bleedOutTime} s — potem ginie.</p>
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
  <p>Na start masz: <b>${i}</b>. Kolejne bronie odblokowują się wszystkim (żywym i powalonym) na początku kolejnych fal:</p><ul>${n}</ul>
  <p>Dodatkowo na mapie spadają <b>skrzynie z bronią</b> (co ${z(p.crates.intervalMin)}–${z(p.crates.intervalMax)}, średnio ${$(D.crates)} na falę w pojedynkę), a z zabitych Tyranidów — <b>apteczki</b> (do średnio ${$(D.medkits)} na falę w pojedynkę; więcej w większym oddziale, boss zawsze zostawia apteczkę). Każda broń ma rolę: ANTI-HORDE na roje drobnicy, ANTI-ELITE/ANTI-TANK na duże bestie.</p>
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
    <li><b>Stojąc</b> (i w zaparciu) odrzut to tylko <b>${y(M.standingMul)}</b> — strzelaj z miejsca, gdy liczy się celność.</li>
    <li><b>W marszu</b> odrzut jest pełny (${y(M.walkingMul)}), proporcjonalnie do prędkości.</li>
    <li>Najmocniej kopie <b>Meltagun</b>, w serii najbardziej rozjeżdża się <b>Heavy Bolter</b>; Miotacz ognia prawie nie ma odrzutu. Liczby — w kompendium.</li>
    <li>W grze przez sieć celownik gościa nadąża za odrzutem z opóźnieniem pingu.</li>
  </ul>
</section>
<section id="pancerz"><h2>Pancerz kierunkowy</h2>
  <p>Pancerz wspomagany najlepiej chroni z przodu. <b>Przód to kierunek, w którym celujesz</b> (mysz albo prawy kciuk; gdy na telefonie tylko idziesz — kierunek marszu; w sprincie — kierunek biegu). Liczy się, skąd przychodzi atak: przy ciosie wręcz i szarży — gdzie stoi potwór, przy pocisku — skąd nadleciał, przy wybuchu — gdzie jest jego środek.</p>
  <ul>
    <li><b>Przód</b> (±${s.frontArcDeg}° od kierunku celowania) — obrażenia <b>${y(s.front)}</b></li>
    <li><b>Boki</b> — obrażenia <b>${y(s.side)}</b></li>
    <li><b>Tył</b> (±${s.rearArcDeg}° od pleców) — obrażenia <b>${y(s.rear)}</b></li>
  </ul>
  <p><b>Rykoszet</b>: pocisk Tyranida, który trafi w przedni pancerz, może się od niego odbić — nie zadaje wtedy obrażeń, a od marine sypią się iskry. Szansa zależy od rodzaju pocisku — najsłabsze odbijają się najczęściej, mocniejsze rzadziej: ${G}.${T?` Pocisk wybuchowy (${T}) nigdy się nie odbija.`:""} Ciosy wręcz i wybuchy nie odbijają się nigdy.</p>
  <p>Przegrzanie plazmy rani zawsze tak samo, niezależnie od kierunku. Twój wybuch, który zahaczy brata, liczy się od środka wybuchu.</p>
  <p class="muted">Stałe: <code>packages/shared/src/data/armour.ts</code> (<code>MARINE_DIRECTIONAL_ARMOUR</code>, <code>MARINE_DEFLECTION</code>). Szanse rykoszetu per pocisk — w danych wrogów / tabeli w kompendium.</p>
</section>
<section id="postawa"><h2>Postawa obronna</h2>
  <p>Przytrzymaj <b>prawy przycisk myszy</b> (PC) albo <b>🛡 GUARD</b> (telefon, prawa strona), stojąc w miejscu. Każdy ruch natychmiast kończy postawę. To nie to samo co <b>zaparcie</b> ciężkiej broni (szybszy ogień / ciaśniejszy stożek po chwili bez ruchu) — postawa działa z każdą bronią i dotyczy tylko obrony.</p>
  <ul>
    <li><b>Pancerz przedni +${Math.round(k.frontArmourBonus*100)}%</b> — mnożnik obrażeń z przodu spada z ${y(s.front)} do <b>${y(k.frontMul)}</b> (ciosy wręcz, pociski i wybuchy z przedniej ćwiartki).</li>
    <li><b>Rykoszet</b>: szansa, że pocisk <em>nie</em> odbije się od przedniego pancerza, jest ×${$(k.nonDeflectFactor)} (czyli szansa odbicia rośnie: ${w(.5)} bazowe → ${w(1-k.nonDeflectFactor*(1-.5))}). Formuła: <code>1 − ${$(k.nonDeflectFactor)}·(1 − baza)</code>.</li>
    <li><b>Trafienie, które mimo to przeszło</b> (pocisk z przodu, bez rykoszetu) dostaje jeszcze <b>${y(k.landedDamageMul)}</b> obrażeń (−${Math.round((1-k.landedDamageMul)*100)}%). Ciosy wręcz i wybuchy dostają tylko twardszy przedni pancerz — bez tej dodatkowej zniżki.</li>
  </ul>
  <p class="muted">Stałe: <code>packages/shared/src/data/guard.ts</code> (<code>MARINE_GUARD</code>). Symulacja: <code>Player.guarding</code>; sieć: flaga <code>gd</code>.</p>
</section>
<section id="wrogowie"><h2>Tyranidzi</h2><ul>
  ${[...e.enemies.values()].sort((t,j)=>t.threat-j.threat).map(t=>`<li><b>${l(t.name)}</b>${t.boss?' <b class="boss">BOSS</b>':""} — ${l(t.role)}</li>`).join("")}
</ul></section>
<section id="punkty"><h2>Punkty i ranking</h2>
  <p>Zabicie daje punkty marine, który zadał ostatni cios (wartości w kompendium). Na koniec misji widzisz podsumowanie oddziału i listę wszystkich zabitych Tyranidów.</p>
  <p>Ranking (<b>HONOURED DEAD</b>) jest osobny dla każdej wersji gry (obecnie tablica <b>${l(v)}</b>${K}) i dla każdej liczby graczy. Są dwie listy: najdłuższe przetrwanie oddziału i najwyższe wyniki marines.</p>
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
  ${ye(e)}
  </details>
</section>
<footer class="muted">Nieoficjalny, niekomercyjny projekt fanowski. Nie jest powiązany z Games Workshop.</footer>`}const F=document.getElementById("rules");F.innerHTML=be(Y);location.hash==="#kompendium"&&F.querySelector("details")?.setAttribute("open","");
//# sourceMappingURL=rules-RE5i8HyX.js.map
