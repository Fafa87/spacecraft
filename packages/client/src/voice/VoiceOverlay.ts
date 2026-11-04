import { VoiceChat } from './VoiceChat.js';
import { voicePeerOptions } from './peerOptions.js';

export interface VoiceOverlayOptions {
  roomCode: string;
  name: string;
}

const CSS = `
.vx{position:fixed;top:calc(env(safe-area-inset-top,0px) + 6px);left:50%;transform:translateX(-50%);
z-index:50;display:flex;gap:6px;align-items:center;font:600 12px/1.2 system-ui,sans-serif;color:#e8dcc0;
user-select:none;-webkit-user-select:none;touch-action:none;pointer-events:auto}
.vx button{font:inherit;color:inherit;background:rgba(20,16,12,.78);border:1px solid #8a7140;border-radius:14px;
padding:6px 10px;min-height:30px;cursor:pointer}
.vx button.on{background:#7a1d12;border-color:#e0a050}
.vx .me.talk,.vx .p.talk{box-shadow:0 0 0 2px #6fe07a}
.vx .p{background:rgba(20,16,12,.78);border:1px solid #5a4a30;border-radius:12px;padding:4px 8px;max-width:9em;
overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vx .p.wait{opacity:.5}
.vx .err{color:#f0a080}`;

/**
 * Minimal voice HUD: one button to join voice (the required user gesture), then a mic button
 * (hold = push-to-talk, or tap = mute toggle in open-mic mode), a PTT/OPEN switch, and one
 * chip per squadmate that lights up while they speak (tap a chip: volume 100% → 50% → 0%).
 * Keyboard: hold V to talk. Lives in its own DOM node on <body>; nothing in the game UI changes.
 */
export function mountVoiceOverlay(o: VoiceOverlayOptions): () => void {
  const style = document.createElement('style');
  style.textContent = CSS;
  const root = document.createElement('div');
  root.className = 'vx';
  document.head.appendChild(style);
  document.body.appendChild(root);
  let vc: VoiceChat | null = null;
  const offs: Array<() => void> = [];

  const stopEv = (e: Event) => e.stopPropagation();
  for (const t of ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'click'])
    root.addEventListener(t, stopEv);

  const render = () => {
    root.replaceChildren();
    if (!vc || vc.state === 'idle' || vc.state === 'stopped') {
      const b = document.createElement('button');
      b.textContent = vc?.error ? `🎙 GŁOS (${vc.error})` : '🎙 GŁOS';
      b.onclick = () => void join();
      root.append(b);
      return;
    }
    if (vc.state === 'starting') {
      const s = document.createElement('span');
      s.className = 'p wait';
      s.textContent = '🎙 łączenie…';
      root.append(s);
      return;
    }
    const v = vc;
    const mic = document.createElement('button');
    mic.className = `me${v.transmitting ? ' on' : ''}${v.localSpeaking ? ' talk' : ''}`;
    mic.textContent = v.listenOnly
      ? '🔇 tylko słuchasz'
      : v.mode === 'ptt'
        ? v.pttDown
          ? '🎙 MÓWISZ'
          : '🎙 przytrzymaj'
        : v.muted
          ? '🔇 wyciszony'
          : '🎙 mikrofon';
    if (!v.listenOnly) {
      if (v.mode === 'ptt') {
        mic.onpointerdown = (e) => (mic.setPointerCapture?.(e.pointerId), v.pushToTalk(true));
        mic.onpointerup = mic.onpointercancel = () => v.pushToTalk(false);
      } else mic.onclick = () => v.setMuted(!v.muted);
    }
    const mode = document.createElement('button');
    mode.textContent = v.mode === 'ptt' ? 'PTT' : 'OPEN';
    mode.title = 'Przełącz: push-to-talk / otwarty mikrofon';
    mode.onclick = () => v.setMode(v.mode === 'ptt' ? 'open' : 'ptt');
    const leave = document.createElement('button');
    leave.textContent = '✕';
    leave.title = 'Wyjdź z głosu';
    leave.onclick = () => {
      v.stop();
      vc = null;
      render();
    };
    root.append(mic, mode);
    for (const p of v.peers()) {
      const c = document.createElement('span');
      c.className = `p${p.speaking ? ' talk' : ''}${p.state !== 'connected' ? ' wait' : ''}`;
      c.textContent = `${p.volume === 0 ? '🔇' : p.volume < 1 ? '🔉' : '🔊'} ${p.name}`;
      c.onclick = () => v.setPeerVolume(p.id, p.volume >= 1 ? 0.5 : p.volume > 0 ? 0 : 1);
      root.append(c);
    }
    root.append(leave);
  };

  // Re-render is cheap (a handful of nodes) but not while a PTT pointer is held on the button.
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (vc?.pttDown && vc.mode === 'ptt') return patchTalking();
      render();
    });
  };
  const patchTalking = () => {
    const mic = root.querySelector<HTMLElement>('.me');
    if (mic && vc) {
      mic.classList.toggle('on', vc.transmitting);
      mic.classList.toggle('talk', vc.localSpeaking);
      mic.textContent = '🎙 MÓWISZ';
    }
  };

  async function join(): Promise<void> {
    vc?.stop();
    const peerOptions = await voicePeerOptions();
    const playback =
      new URLSearchParams(location.search).get('voicePlayback') === 'element'
        ? 'element'
        : 'webaudio';
    vc = new VoiceChat({ roomCode: o.roomCode, name: o.name, peerOptions, playback });
    offs.push(vc.on(schedule));
    render();
    await vc.start();
    render();
  }

  const key = (down: boolean) => (e: KeyboardEvent) => {
    if (e.code !== 'KeyV' || e.repeat || !vc || vc.mode !== 'ptt') return;
    if ((e.target as HTMLElement | null)?.closest?.('input,textarea')) return;
    vc.pushToTalk(down);
  };
  const kd = key(true);
  const ku = key(false);
  addEventListener('keydown', kd);
  addEventListener('keyup', ku);
  const blur = () => vc?.pushToTalk(false);
  addEventListener('blur', blur);

  render();
  return () => {
    removeEventListener('keydown', kd);
    removeEventListener('keyup', ku);
    removeEventListener('blur', blur);
    for (const f of offs) f();
    vc?.stop();
    vc = null;
    root.remove();
    style.remove();
  };
}
