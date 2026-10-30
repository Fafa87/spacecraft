/**
 * A TypeScript port of the classic sfxr synthesizer (DrPetter, 2007; same
 * parameter model as jsfxr). Parameters are normalized like the original UI:
 * most are 0..1, "ramp"-style ones are -1..1.
 */

export enum Wave {
  Square = 0,
  Saw = 1,
  Sine = 2,
  Noise = 3,
}

export interface SfxrParams {
  wave: Wave;
  attack: number;
  sustain: number;
  punch: number;
  decay: number;
  baseFreq: number;
  freqLimit: number;
  freqRamp: number;
  freqDeltaRamp: number;
  vibStrength: number;
  vibSpeed: number;
  arpMod: number;
  arpSpeed: number;
  duty: number;
  dutyRamp: number;
  repeatSpeed: number;
  phaserOffset: number;
  phaserRamp: number;
  lpfFreq: number;
  lpfRamp: number;
  lpfResonance: number;
  hpfFreq: number;
  hpfRamp: number;
  volume: number;
}

export const defaultParams = (): SfxrParams => ({
  wave: Wave.Square,
  attack: 0,
  sustain: 0.3,
  punch: 0,
  decay: 0.4,
  baseFreq: 0.3,
  freqLimit: 0,
  freqRamp: 0,
  freqDeltaRamp: 0,
  vibStrength: 0,
  vibSpeed: 0,
  arpMod: 0,
  arpSpeed: 0,
  duty: 0,
  dutyRamp: 0,
  repeatSpeed: 0,
  phaserOffset: 0,
  phaserRamp: 0,
  lpfFreq: 1,
  lpfRamp: 0,
  lpfResonance: 0,
  hpfFreq: 0,
  hpfRamp: 0,
  volume: 0.5,
});

/** Deterministic noise source so renders are reproducible. */
function makeNoise(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
}

/** Renders the effect at 44.1 kHz (8x supersampled internally, as in sfxr). */
export function renderSfxr(p: SfxrParams, seed = 1, sampleRate = 44100): Float32Array {
  const noise = makeNoise(seed);
  const out: number[] = [];
  const superSample = 8;
  // sfxr runs at 44100; for other rates we just resample by skipping.
  const rateRatio = 44100 / sampleRate;

  let fperiod = 0;
  let fmaxperiod = 0;
  let fslide = 0;
  let fdslide = 0;
  let period = 0;
  let squareDuty = 0;
  let squareSlide = 0;
  let arpTime = 0;
  let arpLimit = 0;
  let arpMod = 0;

  const reset = (restart: boolean) => {
    fperiod = 100 / (p.baseFreq * p.baseFreq + 0.001);
    period = Math.floor(fperiod);
    fmaxperiod = 100 / (p.freqLimit * p.freqLimit + 0.001);
    fslide = 1 - Math.pow(p.freqRamp, 3) * 0.01;
    fdslide = -Math.pow(p.freqDeltaRamp, 3) * 0.000001;
    squareDuty = 0.5 - p.duty * 0.5;
    squareSlide = -p.dutyRamp * 0.00005;
    arpMod = p.arpMod >= 0 ? 1 - Math.pow(p.arpMod, 2) * 0.9 : 1 + Math.pow(p.arpMod, 2) * 10;
    arpTime = 0;
    arpLimit = p.arpSpeed === 1 ? 0 : Math.floor(Math.pow(1 - p.arpSpeed, 2) * 20000 + 32);
    if (!restart) {
      // filters & envelopes are initialised once below
    }
  };
  reset(false);

  let fltp = 0;
  let fltdp = 0;
  let fltw = Math.pow(p.lpfFreq, 3) * 0.1;
  const fltwD = 1 + p.lpfRamp * 0.0001;
  let fltdmp = 5 / (1 + Math.pow(p.lpfResonance, 2) * 20) * (0.01 + fltw);
  if (fltdmp > 0.8) fltdmp = 0.8;
  let fltphp = 0;
  let flthp = Math.pow(p.hpfFreq, 2) * 0.1;
  const flthpD = 1 + p.hpfRamp * 0.0003;

  let vibPhase = 0;
  const vibSpeed = Math.pow(p.vibSpeed, 2) * 0.01;
  const vibAmp = p.vibStrength * 0.5;

  const envLength = [
    Math.floor(p.attack * p.attack * 100000),
    Math.floor(p.sustain * p.sustain * 100000),
    Math.floor(p.decay * p.decay * 100000),
  ];
  let envStage = 0;
  let envTime = 0;
  let envVol = 0;

  let phaserOffset = Math.pow(p.phaserOffset, 2) * 1020 * (p.phaserOffset < 0 ? -1 : 1);
  const phaserDelta = Math.pow(p.phaserRamp, 2) * (p.phaserRamp < 0 ? -1 : 1);
  let iphase = Math.abs(Math.floor(phaserOffset));
  let ipp = 0;
  const phaserBuffer = new Float32Array(1024);

  const noiseBuffer = new Float32Array(32);
  for (let i = 0; i < 32; i++) noiseBuffer[i] = noise();

  const repLimit = p.repeatSpeed === 0 ? 0 : Math.floor(Math.pow(1 - p.repeatSpeed, 2) * 20000 + 32);
  let repTime = 0;

  let phase = 0;
  let sampleCounter = 0;
  let acc = 0;
  const maxSamples = 44100 * 10;

  for (let t = 0; t < maxSamples; t++) {
    if (repLimit !== 0 && ++repTime >= repLimit) {
      repTime = 0;
      reset(true);
    }
    // frequency envelopes / arpeggios
    if (arpLimit !== 0 && ++arpTime >= arpLimit) {
      arpLimit = 0;
      fperiod *= arpMod;
    }
    fslide += fdslide;
    fperiod *= fslide;
    if (fperiod > fmaxperiod) {
      fperiod = fmaxperiod;
      if (p.freqLimit > 0) break;
    }
    let rfperiod = fperiod;
    if (vibAmp > 0) {
      vibPhase += vibSpeed;
      rfperiod = fperiod * (1 + Math.sin(vibPhase) * vibAmp);
    }
    period = Math.max(8, Math.floor(rfperiod));
    squareDuty = Math.min(0.5, Math.max(0, squareDuty + squareSlide));

    // volume envelope
    if (++envTime > envLength[envStage]) {
      envTime = 0;
      envStage++;
      if (envStage > 2) break;
    }
    const len = envLength[envStage] || 1;
    if (envStage === 0) envVol = envTime / len;
    else if (envStage === 1) envVol = 1 + Math.pow(1 - envTime / len, 1) * 2 * p.punch;
    else envVol = 1 - envTime / len;

    // phaser step
    phaserOffset += phaserDelta;
    iphase = Math.min(1023, Math.abs(Math.floor(phaserOffset)));

    if (flthpD !== 1) {
      flthp *= flthpD;
      flthp = Math.min(0.1, Math.max(0.00001, flthp));
    }

    let ssample = 0;
    for (let si = 0; si < superSample; si++) {
      let sample = 0;
      phase++;
      if (phase >= period) {
        phase %= period;
        if (p.wave === Wave.Noise) for (let i = 0; i < 32; i++) noiseBuffer[i] = noise();
      }
      const fp = phase / period;
      switch (p.wave) {
        case Wave.Square:
          sample = fp < squareDuty ? 0.5 : -0.5;
          break;
        case Wave.Saw:
          sample = 1 - fp * 2;
          break;
        case Wave.Sine:
          sample = Math.sin(fp * 2 * Math.PI);
          break;
        case Wave.Noise:
          sample = noiseBuffer[Math.floor((phase * 32) / period)];
          break;
      }
      // low-pass filter
      const pp = fltp;
      fltw *= fltwD;
      fltw = Math.min(0.1, Math.max(0, fltw));
      if (p.lpfFreq !== 1) {
        fltdp += (sample - fltp) * fltw;
        fltdp -= fltdp * fltdmp;
      } else {
        fltp = sample;
        fltdp = 0;
      }
      fltp += fltdp;
      // high-pass filter
      fltphp += fltp - pp;
      fltphp -= fltphp * flthp;
      sample = fltphp;
      // phaser
      phaserBuffer[ipp & 1023] = sample;
      sample += phaserBuffer[(ipp - iphase + 1024) & 1023];
      ipp = (ipp + 1) & 1023;
      ssample += sample * envVol;
    }
    ssample = (ssample / superSample) * p.volume * 2;
    acc += 1;
    if (acc >= rateRatio) {
      acc -= rateRatio;
      out.push(Math.max(-1, Math.min(1, ssample)));
    }
    sampleCounter++;
  }
  void sampleCounter;
  return Float32Array.from(out);
}
