# Voice chat (opt-in per room)

The **host** decides: the squad room has a **🎙 CZAT GŁOSOWY** switch (P2P rooms only, default
**off**, lobby phase). The choice travels to everyone as an optional `voice: true` field of the
existing `lobby` message (absent = off, so the wire protocol stays v5 and old clients ignore it).
Joiners see an indicator in the room. While it is on, every player gets the overlay (already in
the room and in game) and taps **🎙 GŁOS** to grant the mic — or just listens. Solo and dedicated
rooms never have voice. While it is off nothing of the voice code is loaded (the overlay is a
lazy chunk, ~4.5 kB gz).

The voice transport is detached from the game netcode: `attachVoice(conn)` (in `connCleanup`)
only follows `session.lobby.voice` and mounts/unmounts the overlay.

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
- Dev override: `?voice=1` shows the overlay in this tab of a P2P room even without the host's
  switch (not remembered; the prototype's `localStorage['sms.voice']` is cleared).
  `?voicePlayback=element` falls back to `<audio>` playback.

## Testing

- `npx vitest run packages/client/test/voice.test.ts` – pure helpers.
- `npx tsx scripts/voice-check.ts` – the real game flow in headless Chrome with a fake mic:
  toggle off → no voice chunk requested; host toggles on → 3 players tap 🎙 GŁOS in a running
  mission: slots, mesh, audio bytes and levels, mute, PTT, leave and rejoin; screenshots in
  `docs/review/voice-optin-*.png`. Uses the TURN servers from `.env.production`
  (`VOICE_TURN=0` disables, `VOICE_RELAY=1` forces relay). `CLIENT_URL=…` tests a running build
  (e.g. `vite preview`) instead of the Vite dev server.
- Manual: `npm run dev`, open `/voice-lab.html?room=TEST&name=A` in two tabs.

## Before release

Real iPhone/Android tests (audio session ducking/earpiece routing, background/lock, echo on
speakerphone), ducking game SFX while someone talks.
