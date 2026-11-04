# Voice chat (prototype, behind `?voice=1`)

Fully detached from the game netcode: zero changes in `net/`, two lines in `app/App.ts`
(`attachVoice(conn)` pushed into `connCleanup`). Without the flag nothing is loaded
(the overlay is a lazy chunk, ~4.5 kB gz).

## Design
- **Separate PeerJS Peer** on the same signalling server + ICE/TURN config (`voice/peerOptions.ts`).
  The game Peer is untouched: the host treats every DataConnection as a player, so voice never uses it.
- **Slots:** each player claims the first free id `sms-voice-v1-<ROOM>-<n>` (n = 1..8;
  `unavailable-id` = taken). Higher slots call lower ones (no glare); rescan every 5 s finds rejoins.
- **Full mesh** of MediaConnections (4 players = 6 links). Callsigns travel on a short DataConnection.
- **Audio:** getUserMedia with echoCancellation / noiseSuppression / autoGainControl, mono;
  Opus tuned in SDP to 24 kbps, DTX, in-band FEC. Mic denied → listen-only.
- **Controls:** push-to-talk by default (button or hold `V`), OPEN mode with mute, per-player
  volume (WebAudio gain; works on iOS where `audio.volume` is read-only), speaking indicators.
- Flag: `?voice=1` (remembered in `localStorage['sms.voice']`, `?voice=0` clears).
  `?voicePlayback=element` falls back to `<audio>` playback.

## Testing
- `npx vitest run packages/client/test/voice.test.ts` – pure helpers.
- `npx tsx scripts/voice-check.ts` – 3 headless Chrome tabs with a fake mic: slots, mesh, audio bytes
  and levels, mute, PTT, leave and rejoin. Uses the TURN servers from `.env.production`
  (`VOICE_TURN=0` disables, `VOICE_RELAY=1` forces relay).
- Manual: `npm run dev`, open `/voice-lab.html?room=TEST&name=A` in two tabs.

## Before release
Real iPhone/Android tests (audio session ducking/earpiece routing, background/lock, echo on
speakerphone), ducking game SFX while someone talks, carry the flag in invite links or a settings
toggle, UI polish.
