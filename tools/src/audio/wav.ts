/** Encodes mono float samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

/** Decodes a 16-bit PCM mono/stereo WAV (used by tests and override validation). */
export function decodeWav(buf: Buffer): {
  sampleRate: number;
  channels: number;
  samples: Float32Array;
} {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('not a WAV file');
  let off = 12;
  let sampleRate = 0;
  let channels = 1;
  let bits = 16;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(off + 10);
      sampleRate = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    } else if (id === 'data') {
      if (bits !== 16) throw new Error('only 16-bit WAV supported');
      const n = size / 2;
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
      return { sampleRate, channels, samples };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

/** Peak-normalizes in place to `peak` and returns the array. */
export function normalize(samples: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  if (max > 1e-6) {
    const k = peak / max;
    for (let i = 0; i < samples.length; i++) samples[i] *= k;
  }
  return samples;
}
