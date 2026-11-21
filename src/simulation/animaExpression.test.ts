import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPONTANEOUS_VISIBLE_MS,
  classifyArousalTier,
  computeAnimaExpression,
  computeNextSpontaneousDelayMs,
  normalizeAnimaTone,
} from './animaExpression';
import { createInitialPhysiology } from './physiology';

test('normalizeAnimaTone validates known tones and defaults safely', () => {
  assert.equal(normalizeAnimaTone('serene'), 'serene');
  assert.equal(normalizeAnimaTone('listening'), 'listening');
  assert.equal(normalizeAnimaTone('steady'), 'steady');
  assert.equal(normalizeAnimaTone('tender_smile'), 'tender_smile');
  assert.equal(normalizeAnimaTone('containment'), 'containment');
  assert.equal(normalizeAnimaTone('unknown_tone'), 'serene');
  assert.equal(normalizeAnimaTone(undefined), 'serene');
});

test('resting expressions select appropriate real portraits per conversational tone', () => {
  const rest = createInitialPhysiology();

  const serene = computeAnimaExpression({ tone: 'serene', physiology: rest });
  const listening = computeAnimaExpression({ tone: 'listening', physiology: rest });
  const steady = computeAnimaExpression({ tone: 'steady', physiology: rest });
  const smile = computeAnimaExpression({ tone: 'tender_smile', physiology: rest });
  const contain = computeAnimaExpression({ tone: 'containment', physiology: rest });

  assert.equal(serene.primaryPortrait, 'serene_rest');
  assert.equal(listening.primaryPortrait, 'open_yearning');
  assert.equal(steady.primaryPortrait, 'tender_smile');
  assert.equal(smile.primaryPortrait, 'tender_smile');
  assert.equal(contain.primaryPortrait, 'soft_peace');
});

test('arousal progression transitions cleanly across all 13 portraits including newly generated expressions', () => {
  const rest = createInitialPhysiology();

  const awakening = computeAnimaExpression({
    tone: 'serene',
    physiology: { ...rest, arousal: 0.2, congestion: 0.2 },
  });
  const dreamy = computeAnimaExpression({
    tone: 'serene',
    physiology: { ...rest, arousal: 0.32, congestion: 0.3 },
  });
  const halfLidded = computeAnimaExpression({
    tone: 'serene',
    physiology: { ...rest, arousal: 0.46, congestion: 0.44 },
  });
  const breathless = computeAnimaExpression({
    tone: 'serene',
    physiology: { ...rest, arousal: 0.6, congestion: 0.55 },
  });
  const building = computeAnimaExpression({
    tone: 'serene',
    physiology: { ...rest, arousal: 0.78, congestion: 0.74 },
  });
  const high = computeAnimaExpression({
    tone: 'serene',
    physiology: { ...rest, arousal: 0.88, congestion: 0.84 },
  });
  const deepRapturePeak = computeAnimaExpression({
    tone: 'serene',
    physiology: { ...rest, arousal: 1.0, congestion: 0.92, peakReleaseTimer: 3.4, breathRateBpm: 28 },
  });
  const peak = computeAnimaExpression({
    tone: 'serene',
    physiology: { ...rest, arousal: 1.0, congestion: 0.92, peakReleaseTimer: 1.8, breathRateBpm: 28 },
  });
  const afterglow = computeAnimaExpression({
    tone: 'serene',
    physiology: { ...rest, arousal: 0.45, congestion: 0.6, peakReleaseTimer: 0.2 },
  });

  assert.equal(awakening.primaryPortrait, 'open_yearning');
  assert.equal(dreamy.primaryPortrait, 'dreamy_sigh');
  assert.equal(halfLidded.primaryPortrait, 'half_lidded');
  assert.equal(breathless.primaryPortrait, 'breathless_awe');

  assert.equal(building.primaryPortrait, 'building_flush');
  assert.equal(building.secondaryPortrait, 'intense_flush');
  assert.ok(building.secondaryBlend > 0.3);

  assert.equal(high.primaryPortrait, 'intense_flush');
  assert.equal(high.secondaryPortrait, 'deep_rapture');

  assert.equal(deepRapturePeak.primaryPortrait, 'deep_rapture');
  assert.equal(peak.primaryPortrait, 'peak_bliss');
  assert.ok(peak.warmGlowOpacity > awakening.warmGlowOpacity);
  assert.ok(peak.breathScale > awakening.breathScale);
  assert.ok(peak.breathDurationSec < awakening.breathDurationSec);

  assert.equal(afterglow.primaryPortrait, 'calm_afterglow');
  assert.equal(afterglow.secondaryPortrait, 'tender_afterglow');
  assert.ok(afterglow.secondaryBlend > 0.7);
});

test('elevated sensory discomfort transitions to breathless_awe / intense_flush tension portraits', () => {
  const base = createInitialPhysiology();
  const mildTense = computeAnimaExpression({
    tone: 'tender_smile',
    physiology: { ...base, discomfort: 0.4 },
  });
  const strongTense = computeAnimaExpression({
    tone: 'tender_smile',
    physiology: { ...base, discomfort: 0.62 },
  });

  assert.equal(mildTense.primaryPortrait, 'breathless_awe');
  assert.equal(strongTense.primaryPortrait, 'intense_flush');
});

test('zoom animation reacts distinctly to insertion depth, cadence preset, tactile speed, and discomfort recoil', () => {
  const base = { ...createInitialPhysiology(), arousal: 0.35 };

  const still = computeAnimaExpression({
    tone: 'serene',
    physiology: base,
    input: {
      active: false,
      tool: 'rod',
      zone: 'none',
      pressure: 0,
      speed: 0,
      rhythmQuality: 0,
      circularity: 0,
      isDirectGlans: false,
      elapsedTime: 1,
    },
  });

  const shallowSlow = computeAnimaExpression({
    tone: 'serene',
    physiology: base,
    input: {
      active: true,
      tool: 'rod',
      zone: 'vestibule',
      pressure: 0.45,
      speed: 0.4,
      rhythmQuality: 0.65,
      circularity: 0.1,
      isDirectGlans: false,
      insertion: 0.15,
      cyclePreset: 'slow',
      elapsedTime: 0.2,
    },
  });

  const deepFast = computeAnimaExpression({
    tone: 'serene',
    physiology: base,
    input: {
      active: true,
      tool: 'rod',
      zone: 'vestibule',
      pressure: 0.65,
      speed: 1.2,
      rhythmQuality: 0.75,
      circularity: 0.15,
      isDirectGlans: false,
      insertion: 0.92,
      cyclePreset: 'fast',
      elapsedTime: 0.2,
    },
  });

  const glansOverload = computeAnimaExpression({
    tone: 'serene',
    physiology: base,
    input: {
      active: true,
      tool: 'rod',
      zone: 'glans',
      pressure: 0.9,
      speed: 0.1,
      rhythmQuality: 0,
      circularity: 0,
      isDirectGlans: true,
      elapsedTime: 0,
    },
  });

  const sliderGlide = computeAnimaExpression({
    tone: 'serene',
    physiology: base,
    input: {
      active: false,
      tool: 'rod',
      zone: 'none',
      pressure: 0,
      speed: 0,
      rhythmQuality: 0,
      circularity: 0,
      isDirectGlans: false,
      manualGlideActive: true,
      elapsedTime: 1,
    },
  });

  assert.equal(still.inputMode, 'still');
  assert.equal(shallowSlow.inputMode, 'thrust');
  assert.equal(deepFast.inputMode, 'thrust');
  assert.equal(glansOverload.inputMode, 'tension');
  assert.equal(sliderGlide.inputMode, 'slider_glide');

  assert.ok(shallowSlow.zoomScale > still.zoomScale);
  assert.ok(deepFast.zoomScale > shallowSlow.zoomScale, 'deeper faster insertion should zoom closer');
  assert.ok(sliderGlide.zoomScale > still.zoomScale);
  assert.ok(glansOverload.zoomScale < still.zoomScale);
});

test('arousal tier classification and spontaneous random timing stay within specification', () => {
  const rest = createInitialPhysiology();
  assert.equal(SPONTANEOUS_VISIBLE_MS, 4000);
  assert.equal(classifyArousalTier(rest), 'resting');
  assert.equal(classifyArousalTier({ ...rest, arousal: 0.25 }), 'awakening');
  assert.equal(classifyArousalTier({ ...rest, arousal: 0.5 }), 'building');
  assert.equal(classifyArousalTier({ ...rest, arousal: 0.78 }), 'intense');
  assert.equal(classifyArousalTier({ ...rest, arousal: 1.0, peakReleaseTimer: 2.5 }), 'peak');
  assert.equal(classifyArousalTier({ ...rest, arousal: 0.5, discomfort: 0.45 }), 'tension');

  const minDelay = computeNextSpontaneousDelayMs('awakening', true, () => 0);
  const maxDelay = computeNextSpontaneousDelayMs('awakening', true, () => 0.99);
  assert.ok(minDelay >= 3500 && maxDelay <= 8500 && maxDelay > minDelay);
});
