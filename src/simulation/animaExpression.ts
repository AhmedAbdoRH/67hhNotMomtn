import { clamp01 } from './physiology';
import type { AnatomicalZone, CadencePreset, PhysiologicalState, TactileToolId } from './types';

export type AnimaTone = 'serene' | 'listening' | 'steady' | 'tender_smile' | 'containment';

export type AnimaPortraitKey =
  | 'serene_rest'
  | 'soft_peace'
  | 'tender_smile'
  | 'open_yearning'
  | 'dreamy_sigh'
  | 'half_lidded'
  | 'breathless_awe'
  | 'building_flush'
  | 'intense_flush'
  | 'deep_rapture'
  | 'peak_bliss'
  | 'calm_afterglow'
  | 'tender_afterglow';

export type ArousalTier = 'resting' | 'awakening' | 'building' | 'intense' | 'peak' | 'tension' | 'afterglow';

export type AnimaInputMode =
  | 'still'
  | 'slider_glide'
  | 'caress'
  | 'envelop'
  | 'rhythmic'
  | 'thrust'
  | 'tension'
  | 'peak';

export const SPONTANEOUS_VISIBLE_MS = 4000;

export interface InputZoomTelemetry {
  active: boolean;
  tool: TactileToolId;
  zone: AnatomicalZone;
  pressure: number;
  speed: number;
  rhythmQuality: number;
  circularity: number;
  isDirectGlans: boolean;
  manualGlideActive?: boolean;
  insertion?: number;
  cyclePreset?: CadencePreset;
  elapsedTime: number;
}

export const ANIMA_TONE_LABELS_AR: Record<AnimaTone, string> = {
  serene: 'سكينة بعيون مغمضة',
  listening: 'إصغاء بانتباه ودفء',
  steady: 'ثبات وطمأنينة',
  tender_smile: 'ابتسامة قرب وحنان',
  containment: 'احتواء وتهدئة للقلب',
};

export const ANIMA_PORTRAIT_LABELS_AR: Record<AnimaPortraitKey, string> = {
  serene_rest: 'سكينة وهدوء',
  soft_peace: 'دفء واطمئنان',
  tender_smile: 'ابتسامة قرب وحنان',
  open_yearning: 'إصغاء ونبض متصاعد',
  dreamy_sigh: 'تنهيدة حالمة ودفء قريب',
  half_lidded: 'تورّد وانغماس حسي',
  breathless_awe: 'تركيز لاهث وتورّد عميق',
  building_flush: 'تسارع الأنفاس والتورّد',
  intense_flush: 'ذروة الانفعال والتوهّج',
  deep_rapture: 'انغماس عميق ولحظة نشوة',
  peak_bliss: 'ذروة الارتخاء والنشوة',
  calm_afterglow: 'سكون ما بعد الذروة',
  tender_afterglow: 'هدوء حنون ونظرة دافئة',
};

export interface AnimaExpressionInput {
  tone: AnimaTone;
  physiology: Pick<
    PhysiologicalState,
    'arousal' | 'congestion' | 'moisture' | 'discomfort' | 'breathPhase' | 'breathRateBpm' | 'peakReleaseTimer' | 'emissionCount'
  >;
  input?: InputZoomTelemetry;
  isThinking?: boolean;
}

export interface AnimaExpressionState {
  tone: AnimaTone;
  arousalTier: ArousalTier;
  inputMode: AnimaInputMode;
  /** Primary portrait key representing the current facial expression */
  primaryPortrait: AnimaPortraitKey;
  /** Optional secondary portrait key for compatible smooth high-arousal blending */
  secondaryPortrait: AnimaPortraitKey | null;
  /** Cross-fade blend weight for secondaryPortrait (0..1) */
  secondaryBlend: number;
  /** Input-pattern & arousal reactive camera zoom factor (~0.99..1.14) */
  zoomScale: number;
  /** Reactive vertical focus nudge in px matching touch/arousal depth */
  zoomTranslateY: number;
  /** Portrait breathing peak scale factor (~1.015..1.035) */
  breathScale: number;
  /** Portrait breathing peak vertical shift in px (negative = lift) */
  breathTranslateY: number;
  /** Breathing cycle duration in seconds derived from breathRateBpm */
  breathDurationSec: number;
  /** Ambient warm studio glow opacity (0..1) */
  warmGlowOpacity: number;
  /** Live Arabic emotional + arousal state summary */
  moodLabelAr: string;
}

const VALID_TONES: readonly AnimaTone[] = ['serene', 'listening', 'steady', 'tender_smile', 'containment'];

export function normalizeAnimaTone(raw?: unknown): AnimaTone {
  if (typeof raw === 'string' && (VALID_TONES as readonly string[]).includes(raw)) {
    return raw as AnimaTone;
  }
  return 'serene';
}

export function classifyArousalTier(
  physiology: Pick<PhysiologicalState, 'arousal' | 'discomfort' | 'peakReleaseTimer' | 'emissionCount'>,
): ArousalTier {
  if (physiology.peakReleaseTimer > 0.9) return 'peak';
  if (physiology.peakReleaseTimer > 0) return 'afterglow';
  if (physiology.discomfort >= 0.35) return 'tension';
  const arousal = clamp01(physiology.arousal);
  if (arousal >= 0.66) return 'intense';
  if (arousal >= 0.42) return 'building';
  if (arousal >= 0.16) return 'awakening';
  if (physiology.emissionCount > 0 && arousal < 0.16) return 'afterglow';
  return 'resting';
}

export function classifyInputMode(
  input: InputZoomTelemetry | undefined,
  physiology: Pick<PhysiologicalState, 'discomfort' | 'peakReleaseTimer'>,
): AnimaInputMode {
  if (physiology.peakReleaseTimer > 0) return 'peak';
  if (
    physiology.discomfort >= 0.35 ||
    (input?.active && ((input.isDirectGlans && input.pressure > 0.62) || input.pressure > 0.85))
  ) {
    return 'tension';
  }
  if (input?.active) {
    if (input.tool === 'rod') return 'thrust';
    if (input.tool === 'palm') return 'envelop';
    if (input.tool === 'brush' || input.pressure < 0.36) return 'caress';
    return 'rhythmic';
  }
  if (input?.manualGlideActive) return 'slider_glide';
  return 'still';
}

/**
 * Computes randomized interval (ms) before showing the next spontaneous AI sentence.
 */
export function computeNextSpontaneousDelayMs(
  tier: ArousalTier,
  inputActive: boolean,
  rng: () => number = Math.random,
): number {
  const r = Math.max(0, Math.min(0.9999, rng()));
  if (tier === 'peak') {
    return Math.round(600 + r * 900);
  }
  if (tier === 'intense' || tier === 'tension') {
    return Math.round((inputActive ? 3200 : 4200) + r * 3600);
  }
  if (tier === 'building' || tier === 'awakening') {
    return Math.round((inputActive ? 3800 : 4800) + r * 4400);
  }
  return Math.round(4800 + r * 5400);
}

function selectTonePortrait(tone: AnimaTone, isThinking: boolean, emissionCount = 0): AnimaPortraitKey {
  if (isThinking) {
    return tone === 'serene' ? 'serene_rest' : 'soft_peace';
  }
  if (emissionCount > 0 && (tone === 'tender_smile' || tone === 'steady')) {
    return 'tender_afterglow';
  }
  switch (tone) {
    case 'serene':
      return 'serene_rest';
    case 'listening':
      return 'open_yearning';
    case 'steady':
      return 'tender_smile';
    case 'tender_smile':
      return 'tender_smile';
    case 'containment':
      return 'soft_peace';
  }
}

/**
 * Computes which real oil portrait expressions to display & cross-fade AND
 * calculates input-pattern-reactive zoom kinematics based on cadence, insertion, velocity, pressure, and arousal.
 */
export function computeAnimaExpression(inputData: AnimaExpressionInput): AnimaExpressionState {
  const { tone, physiology, input, isThinking = false } = inputData;

  const arousal = clamp01(physiology.arousal);
  const congestion = clamp01(physiology.congestion);
  const discomfort = clamp01(physiology.discomfort);
  const peakActive = physiology.peakReleaseTimer > 0;
  const arousalTier = classifyArousalTier(physiology);
  const inputMode = classifyInputMode(input, physiology);

  const tonePortrait = selectTonePortrait(tone, isThinking, physiology.emissionCount);

  let primaryPortrait: AnimaPortraitKey = tonePortrait;
  let secondaryPortrait: AnimaPortraitKey | null = null;
  let secondaryBlend = 0;

  if (peakActive) {
    if (physiology.peakReleaseTimer > 2.8) {
      primaryPortrait = 'deep_rapture';
      secondaryPortrait = 'peak_bliss';
      secondaryBlend = clamp01((3.8 - physiology.peakReleaseTimer) / 1.0);
    } else if (physiology.peakReleaseTimer > 1.1) {
      primaryPortrait = 'peak_bliss';
    } else {
      primaryPortrait = 'calm_afterglow';
      secondaryPortrait = 'tender_afterglow';
      secondaryBlend = clamp01((1.1 - physiology.peakReleaseTimer) / 1.1);
    }
  } else if (discomfort >= 0.35) {
    primaryPortrait = discomfort >= 0.52 ? 'intense_flush' : 'breathless_awe';
  } else if (arousal >= 0.84) {
    primaryPortrait = 'intense_flush';
    secondaryPortrait = 'deep_rapture';
    secondaryBlend = clamp01((arousal - 0.84) / 0.14);
  } else if (arousal >= 0.72) {
    primaryPortrait = 'building_flush';
    secondaryPortrait = 'intense_flush';
    secondaryBlend = clamp01((arousal - 0.72) / 0.12);
  } else if (arousal >= 0.56) {
    primaryPortrait = 'breathless_awe';
  } else if (arousal >= 0.42) {
    primaryPortrait = 'half_lidded';
  } else if (arousal >= 0.28) {
    primaryPortrait = 'dreamy_sigh';
  } else if (arousal >= 0.16) {
    primaryPortrait = 'open_yearning';
  } else {
    primaryPortrait = tonePortrait;
  }

  // --- Input-Pattern Reactive Zoom Kinematics (reacts across cadence, insertion depth, velocity, pressure, rhythm & peak) ---
  const t = input?.elapsedTime ?? 0;
  const speed = input ? Math.min(2.2, Math.max(0, input.speed)) : 0;
  const pressure = input ? clamp01(input.pressure) : 0;
  const circularity = input ? clamp01(input.circularity) : 0;
  const rhythmQuality = input ? clamp01(input.rhythmQuality) : 0;
  const insertion = input ? clamp01(input.insertion ?? 0) : 0;
  const zoneWeight =
    input?.zone === 'prepuce' || input?.zone === 'glans' || input?.zone === 'vestibule'
      ? 1.0
      : input?.zone === 'labia_minor_left' || input?.zone === 'labia_minor_right'
        ? 0.88
        : 0.72;

  const baseArousalZoom = 1.0 + arousal * 0.048;
  let patternZoomDelta = 0;
  let patternYDelta = 0;

  switch (inputMode) {
    case 'peak':
      patternZoomDelta = 0.068 + 0.018 * Math.sin(physiology.breathPhase);
      patternYDelta = -6;
      break;
    case 'tension':
      patternZoomDelta = -0.014 + 0.008 * Math.sin(t * 14);
      patternYDelta = 4;
      break;
    case 'thrust': {
      // Rhythmic cyclic member in/out zoom coupled directly to insertion depth & stroke speed
      const cadenceBias =
        input?.cyclePreset === 'fast'
          ? 0.012
          : input?.cyclePreset === 'harmonious'
            ? 0.008
            : 0.004;
      patternZoomDelta =
        (0.022 +
          insertion * 0.042 +
          Math.min(0.028, speed * 0.018) +
          pressure * 0.012 +
          cadenceBias) *
        zoneWeight;
      patternYDelta = -2.5 - insertion * 5.0;
      break;
    }
    case 'envelop':
      patternZoomDelta = (0.044 + pressure * 0.022 + 0.008 * Math.sin(t * 1.9)) * zoneWeight;
      patternYDelta = -3.5;
      break;
    case 'caress':
      patternZoomDelta =
        (0.026 + circularity * 0.014 + 0.011 * (0.5 + 0.5 * Math.sin(t * 2.3))) * zoneWeight;
      patternYDelta = -2.5;
      break;
    case 'rhythmic':
      patternZoomDelta =
        (0.024 +
          rhythmQuality * 0.018 +
          Math.min(0.025, speed * 0.018) +
          0.013 * Math.sin(t * (4.0 + speed * 3.0))) *
        zoneWeight;
      patternYDelta = -3;
      break;
    case 'slider_glide':
      patternZoomDelta = 0.026 + arousal * 0.012;
      patternYDelta = -2.5;
      break;
    case 'still':
    default:
      patternZoomDelta = 0;
      patternYDelta = 0;
      break;
  }

  const zoomScale = Number(Math.max(0.985, Math.min(1.14, baseArousalZoom + patternZoomDelta)).toFixed(4));
  const zoomTranslateY = Number((-arousal * 4 + patternYDelta).toFixed(2));

  const breathScale = Number((1.012 + arousal * 0.014 + (peakActive ? 0.008 : 0)).toFixed(4));
  const breathTranslateY = Number((-2.5 - arousal * 5 - (peakActive ? 2.5 : 0)).toFixed(2));
  const bpm = Math.max(10, Math.min(34, physiology.breathRateBpm || 14));
  const breathDurationSec = Number((60 / bpm).toFixed(2));

  const warmGlowOpacity = clamp01(
    0.22 + arousal * 0.46 + congestion * 0.16 + (input?.active ? 0.1 : 0) + (peakActive ? 0.24 : 0),
  );

  let moodLabelAr = ANIMA_TONE_LABELS_AR[tone];
  if (isThinking) {
    moodLabelAr = 'تستمع وتتفكّر بهدوء...';
  } else if (peakActive) {
    moodLabelAr = ANIMA_PORTRAIT_LABELS_AR[primaryPortrait];
  } else if (discomfort >= 0.35) {
    moodLabelAr = 'توتّر حسي يحتاج إيقاعاً أهدأ';
  } else if (arousal >= 0.16) {
    moodLabelAr = ANIMA_PORTRAIT_LABELS_AR[primaryPortrait];
  }

  return {
    tone,
    arousalTier,
    inputMode,
    primaryPortrait,
    secondaryPortrait,
    secondaryBlend,
    zoomScale,
    zoomTranslateY,
    breathScale,
    breathTranslateY,
    breathDurationSec,
    warmGlowOpacity,
    moodLabelAr,
  };
}
