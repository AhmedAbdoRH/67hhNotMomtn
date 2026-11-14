import { clamp01 } from './physiology';
import type { PhysiologicalState, PointerContact } from './types';

export class SimulationAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Slip & moisture friction nodes
  private frictionGain: GainNode | null = null;
  private frictionFilterLow: BiquadFilterNode | null = null;
  private frictionFilterHigh: BiquadFilterNode | null = null;

  // Respiration breath nodes
  private breathGain: GainNode | null = null;
  private breathFilter: BiquadFilterNode | null = null;

  // Subtle vocal hum & breathy arousal sigh/moan nodes
  private humOsc: OscillatorNode | null = null;
  private humOsc2: OscillatorNode | null = null;
  private humFormant1: BiquadFilterNode | null = null;
  private humFormant2: BiquadFilterNode | null = null;
  private humFormant3: BiquadFilterNode | null = null;
  private vocalBreathGain: GainNode | null = null;
  private humGain: GainNode | null = null;

  private initialized = false;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.72, now, 0.04);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public initOnGesture(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    if (this.initialized) return;

    const ctx = this.ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.72;
    this.masterGain.connect(ctx.destination);

    // Create looping pink-ish noise buffer (3 seconds)
    const sampleRate = ctx.sampleRate;
    const bufferSize = sampleRate * 3;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }

    // 1. Slip & Moisture Friction Synthesizer
    const frictionNoise = ctx.createBufferSource();
    frictionNoise.buffer = noiseBuffer;
    frictionNoise.loop = true;

    this.frictionFilterLow = ctx.createBiquadFilter();
    this.frictionFilterLow.type = 'bandpass';
    this.frictionFilterLow.frequency.value = 520;
    this.frictionFilterLow.Q.value = 1.8;

    this.frictionFilterHigh = ctx.createBiquadFilter();
    this.frictionFilterHigh.type = 'bandpass';
    this.frictionFilterHigh.frequency.value = 1650;
    this.frictionFilterHigh.Q.value = 1.4;

    this.frictionGain = ctx.createGain();
    this.frictionGain.gain.value = 0;

    frictionNoise.connect(this.frictionFilterLow);
    frictionNoise.connect(this.frictionFilterHigh);
    this.frictionFilterLow.connect(this.frictionGain);
    this.frictionFilterHigh.connect(this.frictionGain);
    this.frictionGain.connect(this.masterGain);
    frictionNoise.start();

    // 2. Organic Respiration Noise Synthesizer
    const breathNoise = ctx.createBufferSource();
    breathNoise.buffer = noiseBuffer;
    breathNoise.loop = true;

    this.breathFilter = ctx.createBiquadFilter();
    this.breathFilter.type = 'bandpass';
    this.breathFilter.frequency.value = 640;
    this.breathFilter.Q.value = 1.25;

    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;

    breathNoise.connect(this.breathFilter);
    this.breathFilter.connect(this.breathGain);
    this.breathGain.connect(this.masterGain);
    breathNoise.start();

    // 3. Organic Vocal / Breathy Sigh & Moan Layer (warm multi-formant tract)
    this.humOsc = ctx.createOscillator();
    this.humOsc.type = 'sawtooth';
    this.humOsc.frequency.value = 162;

    this.humOsc2 = ctx.createOscillator();
    this.humOsc2.type = 'triangle';
    this.humOsc2.frequency.value = 324;

    const oscMix = ctx.createGain();
    oscMix.gain.value = 0.42;

    // Breathy glottal aspiration blended through vocal formants for natural sigh/moan realism
    const vocalBreathNoise = ctx.createBufferSource();
    vocalBreathNoise.buffer = noiseBuffer;
    vocalBreathNoise.loop = true;

    this.vocalBreathGain = ctx.createGain();
    this.vocalBreathGain.gain.value = 0.14;

    this.humFormant1 = ctx.createBiquadFilter();
    this.humFormant1.type = 'bandpass';
    this.humFormant1.frequency.value = 460;
    this.humFormant1.Q.value = 4.6;

    this.humFormant2 = ctx.createBiquadFilter();
    this.humFormant2.type = 'bandpass';
    this.humFormant2.frequency.value = 1040;
    this.humFormant2.Q.value = 5.4;

    this.humFormant3 = ctx.createBiquadFilter();
    this.humFormant3.type = 'bandpass';
    this.humFormant3.frequency.value = 2350;
    this.humFormant3.Q.value = 4.5;

    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;

    this.humOsc.connect(oscMix);
    this.humOsc2.connect(oscMix);
    vocalBreathNoise.connect(this.vocalBreathGain);
    this.vocalBreathGain.connect(this.humFormant1);
    this.vocalBreathGain.connect(this.humFormant2);
    oscMix.connect(this.humFormant1);
    oscMix.connect(this.humFormant2);
    oscMix.connect(this.humFormant3);
    this.humFormant1.connect(this.humGain);
    this.humFormant2.connect(this.humGain);
    this.humFormant3.connect(this.humGain);
    this.humGain.connect(this.masterGain);

    this.humOsc.start();
    this.humOsc2.start();
    vocalBreathNoise.start();

    this.initialized = true;
  }

  public update(physiology: PhysiologicalState, contact: PointerContact): void {
    if (!this.initialized || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const speed = contact.active ? Math.hypot(contact.vx, contact.vy) : 0;
    const { moisture, arousal, discomfort, breathPhase, pauseDuration, peakReleaseTimer } = physiology;
    const peakBoost = peakReleaseTimer > 0 ? clamp01(peakReleaseTimer / 1.8) : 0;

    // 1. Update Slip & Moisture Audio (plus subtle fluid rush during Skene's gland release)
    if (this.frictionGain && this.frictionFilterLow && this.frictionFilterHigh) {
      const activeMotion = contact.active && contact.zone !== 'none' ? clamp01(speed * 1.15) : 0;
      const pressureBoost = 0.35 + 0.65 * contact.pressure;

      // Wet tissue lowers resonant frequency into smooth fluid glide; dry tissue raises crisp skin friction
      const lowFreq = 260 + (1 - moisture) * 440 + Math.min(400, speed * 220);
      const highFreq = 820 + (1 - moisture) * 1450 + Math.min(600, speed * 300);

      // Moisture increases smooth low glide; dryness increases sharp high Q rustle
      this.frictionFilterLow.frequency.setTargetAtTime(lowFreq, now, 0.04);
      this.frictionFilterLow.Q.setTargetAtTime(1.4 + moisture * 2.8, now, 0.05);
      this.frictionFilterHigh.frequency.setTargetAtTime(highFreq, now, 0.04);
      this.frictionFilterHigh.Q.setTargetAtTime(0.9 + (1 - moisture) * 2.1, now, 0.05);

      const peakFluidPulse =
        peakBoost > 0 ? (0.04 + Math.max(0, Math.sin((2.8 - peakReleaseTimer) * Math.PI * 2.4)) * 0.05) * peakBoost : 0;
      const targetFrictionGain =
        activeMotion * pressureBoost * (0.045 + moisture * 0.045 + discomfort * 0.03) + peakFluidPulse;
      this.frictionGain.gain.setTargetAtTime(targetFrictionGain, now, 0.035);
    }

    // 2. Update Respiration Breath Audio
    // Asymmetric respiratory envelope: 0..PI*0.85 inhale, PI*0.85..2*PI exhale
    const cycle = breathPhase;
    const isInhale = cycle < Math.PI * 0.85;
    const exhaleProgress = isInhale ? 0 : (cycle - Math.PI * 0.85) / (Math.PI * 1.15);
    const breathWave = isInhale
      ? Math.sin((cycle / (Math.PI * 0.85)) * Math.PI)
      : Math.sin(exhaleProgress * Math.PI);

    const exhaleMultiplier = isInhale ? 0.68 : 1.15;
    const breathIntensity = (0.012 + arousal * 0.058 + discomfort * 0.025 + peakBoost * 0.035) * breathWave * exhaleMultiplier;

    if (this.breathGain && this.breathFilter) {
      const breathCenterFreq = isInhale
        ? 720 + arousal * 320 + discomfort * 260
        : 510 + arousal * 220 + discomfort * 180;
      this.breathFilter.frequency.setTargetAtTime(breathCenterFreq, now, 0.06);
      this.breathGain.gain.setTargetAtTime(clamp01(breathIntensity) * 0.34, now, 0.05);
    }

    // 3. Organic Vocalized Exhalations / Sighs & Moans (multi-formant with falling exhale pitch contour)
    if (
      this.humOsc &&
      this.humOsc2 &&
      this.humFormant1 &&
      this.humFormant2 &&
      this.humFormant3 &&
      this.vocalBreathGain &&
      this.humGain
    ) {
      // Natural downward sigh inflection across the exhale + gentle vibrato
      const sighInflection = !isInhale ? (1 - exhaleProgress * 1.45) * (12 + arousal * 22) : -8;
      const pitchBase = 168 + arousal * 44 + peakBoost * 24 + sighInflection + discomfort * 18;
      const vibrato = Math.sin(physiology.elapsedTime * 5.6) * (1.4 + arousal * 2.4 + peakBoost * 1.5);
      const f0 = Math.max(118, pitchBase + vibrato);

      this.humOsc.frequency.setTargetAtTime(f0, now, 0.06);
      this.humOsc2.frequency.setTargetAtTime(f0 * 2.0, now, 0.06);

      // Vowel shift: soft closed hum -> open breathy "ah/uh" formant as arousal and peak rise
      const openness = clamp01((arousal - 0.25) / 0.75 + peakBoost * 0.35);
      this.humFormant1.frequency.setTargetAtTime(360 + openness * 290, now, 0.07);
      this.humFormant2.frequency.setTargetAtTime(860 + openness * 360, now, 0.07);
      this.humFormant3.frequency.setTargetAtTime(2200 + openness * 320, now, 0.07);
      this.vocalBreathGain.gain.setTargetAtTime(0.12 + openness * 0.16, now, 0.06);

      const pauseFade = pauseDuration > 4.5 ? Math.exp(-(pauseDuration - 4.5) * 0.4) : 1.0;
      const arousalPresence = arousal > 0.22 ? clamp01((arousal - 0.22) / 0.78) : 0;
      const exhaleWindow = !isInhale ? Math.pow(breathWave, 1.05) : 0.08 + peakBoost * 0.22;
      const peakVocalBoost = peakBoost * (0.55 + 0.45 * Math.abs(Math.sin((2.8 - peakReleaseTimer) * Math.PI * 2.2)));
      const targetHumGain =
        (arousalPresence * 0.11 + peakVocalBoost * 0.08) * exhaleWindow * pauseFade * (1 - discomfort * 0.78);

      this.humGain.gain.setTargetAtTime(targetHumGain, now, 0.05);
    }
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
