import { describe, expect, it } from 'vitest';
import {
  clampVolume,
  callTargets,
  rms,
  slotOf,
  transmitting,
  tuneOpus,
  unavailablePeerOf,
  updateSpeaking,
  voiceFlag,
  voicePeerId,
} from '../src/voice/core.js';

const SDP = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111 63 9',
  'a=rtpmap:111 opus/48000/2',
  'a=rtcp-fb:111 transport-cc',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=rtpmap:63 red/48000/2',
  '',
].join('\r\n');

describe('voice slots', () => {
  it('builds and parses room slot ids', () => {
    expect(voicePeerId('ABCD', 3)).toBe('sms-voice-v1-ABCD-3');
    expect(slotOf('ABCD', 'sms-voice-v1-ABCD-3')).toBe(3);
    expect(slotOf('ABCD', 'sms-voice-v1-WXYZ-3')).toBeNull();
    expect(slotOf('ABCD', 'sms-v1-ABCD')).toBeNull();
    expect(slotOf('ABCD', 'sms-voice-v1-ABCD-x')).toBeNull();
  });
  it('each pair is called exactly once, by the higher slot', () => {
    expect(callTargets('R', 1)).toEqual([]);
    expect(callTargets('R', 3)).toEqual(['sms-voice-v1-R-1', 'sms-voice-v1-R-2']);
    const calls = new Set<string>();
    for (let me = 1; me <= 4; me++)
      for (const id of callTargets('R', me)) calls.add([slotOf('R', id), me].sort().join('-'));
    expect(calls.size).toBe(6); // 4 players → 6 links, no duplicates
  });
  it('extracts the absent peer from PeerJS errors', () => {
    expect(unavailablePeerOf('Could not connect to peer sms-voice-v1-AB-2')).toBe(
      'sms-voice-v1-AB-2',
    );
    expect(unavailablePeerOf('Lost connection to server.')).toBeNull();
  });
});

describe('opus tuning', () => {
  it('merges speech params into the existing fmtp line', () => {
    const out = tuneOpus(SDP, 24000);
    expect(out).toContain(
      'a=fmtp:111 minptime=10;useinbandfec=1;maxaveragebitrate=24000;stereo=0;usedtx=1',
    );
    expect(out.match(/a=fmtp:111/g)).toHaveLength(1);
    expect(out.split('\r\n')).toHaveLength(SDP.split('\r\n').length); // CRLF kept intact
    expect(out).not.toMatch(/[^\r]\n|\r[^\n]/);
    expect(out).toContain('a=rtpmap:63 red/48000/2');
  });
  it('adds an fmtp line when missing and leaves non-opus SDP alone', () => {
    const noFmtp = SDP.replace('a=fmtp:111 minptime=10;useinbandfec=1\r\n', '');
    expect(tuneOpus(noFmtp, 32000)).toMatch(
      /a=rtpmap:111 opus\/48000\/2\r\na=fmtp:111 maxaveragebitrate=32000;/,
    );
    expect(tuneOpus('v=0\r\nm=video 9\r\n')).toBe('v=0\r\nm=video 9\r\n');
  });
});

describe('levels and speaking indicator', () => {
  it('rms', () => {
    expect(rms([])).toBe(0);
    expect(rms([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
  });
  it('holds the speaking flag briefly after the voice drops', () => {
    let st = { speaking: false, lastLoud: 0 };
    st = updateSpeaking(st, 0.0001, 0); // -80 dB
    expect(st.speaking).toBe(false);
    st = updateSpeaking(st, 0.1, 100); // -20 dB
    expect(st.speaking).toBe(true);
    st = updateSpeaking(st, 0, 300);
    expect(st.speaking).toBe(true);
    st = updateSpeaking(st, 0, 450);
    expect(st.speaking).toBe(false);
  });
});

describe('mic gating and flag', () => {
  it('transmits per mode', () => {
    expect(transmitting('open', false, false)).toBe(true);
    expect(transmitting('open', true, true)).toBe(false);
    expect(transmitting('ptt', false, false)).toBe(false);
    expect(transmitting('ptt', false, true)).toBe(true);
    expect(transmitting('ptt', true, true)).toBe(false);
  });
  it('?voice=1 enables and remembers, ?voice=0 forgets, default off', () => {
    expect(voiceFlag('', null)).toEqual({ on: false });
    expect(voiceFlag('?voice=1', null)).toEqual({ on: true, store: '1' });
    expect(voiceFlag('?join=AB', '1')).toEqual({ on: true });
    expect(voiceFlag('?voice=0', '1')).toEqual({ on: false, store: null });
  });
  it('clamps volume', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(5)).toBe(2);
    expect(clampVolume(NaN)).toBe(1);
  });
});
