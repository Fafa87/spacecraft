/**
 * Dev-only harness (`/voice-lab.html?room=ABCD&name=X`, not part of the production build):
 * runs VoiceChat on its own, without a game, for headless two/three-tab tests.
 */
import { VoiceChat } from './VoiceChat.js';
import { voicePeerOptions } from './peerOptions.js';

const q = new URLSearchParams(location.search);
const out = document.getElementById('out')!;
const btn = document.getElementById('go') as HTMLButtonElement;
let vc: VoiceChat | null = null;
(window as unknown as { __voice: () => VoiceChat | null }).__voice = () => vc;
btn.onclick = async () => {
  vc = new VoiceChat({
    roomCode: q.get('room') ?? 'TEST',
    name: q.get('name') ?? 'lab',
    peerOptions: await voicePeerOptions(),
    mode: (q.get('mode') as 'open' | 'ptt') ?? 'open',
    rescanMs: 3000,
  });
  vc.on(
    () =>
      (out.textContent = JSON.stringify(
        { state: vc!.state, slot: vc!.slot, peers: vc!.peers() },
        null,
        1,
      )),
  );
  await vc.start();
};
