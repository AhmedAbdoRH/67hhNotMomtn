import type { AutoCycleConfig, CadencePreset, TactileToolId, VerticalRodState } from './types';

export interface TactileToolProfile {
  id: TactileToolId;
  label: string;
  description: string;
  /** Spatial influence radius in normalized anatomical units */
  influenceRadius: number;
  /** Tissue displacement / parting multiplier */
  displacementScale: number;
  /** Whether the tool catches/hooks tissue folds during drag */
  allowHook: boolean;
  /** Effective contact pressure scaling */
  pressureScale: number;
  /** Sensory arousal gain multiplier */
  arousalMultiplier: number;
  /** Vascular warmth boost accelerating vasocongestion & external swelling */
  congestionWarmthBoost: number;
  /** Muscular relaxation bonus (e.g., warm palm soothing) */
  relaxationBonus: number;
  /** Surface friction & sensory discomfort scaling */
  discomfortScale: number;
}

export const TACTILE_TOOLS: Record<TactileToolId, TactileToolProfile> = {
  finger: {
    id: 'finger',
    label: 'Finger',
    description: 'Balanced surface palpation and tissue parting',
    influenceRadius: 0.17,
    displacementScale: 1.0,
    allowHook: true,
    pressureScale: 1.0,
    arousalMultiplier: 1.0,
    congestionWarmthBoost: 0,
    relaxationBonus: 0,
    discomfortScale: 1.0,
  },
  brush: {
    id: 'brush',
    label: 'Soft Brush',
    description: 'Feather-light wide skin sweeps with minimal friction',
    influenceRadius: 0.21,
    displacementScale: 0.42,
    allowHook: false,
    pressureScale: 0.58,
    arousalMultiplier: 1.15,
    congestionWarmthBoost: 0.18,
    relaxationBonus: 0.28,
    discomfortScale: 0.32,
  },
  palm: {
    id: 'palm',
    label: 'Warm Palm',
    description: 'Broad soothing warmth accelerating vasocongestion and swelling',
    influenceRadius: 0.28,
    displacementScale: 0.85,
    allowHook: false,
    pressureScale: 0.78,
    arousalMultiplier: 0.96,
    congestionWarmthBoost: 0.52,
    relaxationBonus: 0.65,
    discomfortScale: 0.38,
  },
  probe: {
    id: 'probe',
    label: 'Tactile Probe',
    description: 'Localized rounded clinical tip for focused sensory mapping',
    influenceRadius: 0.11,
    displacementScale: 1.24,
    allowHook: true,
    pressureScale: 1.14,
    arousalMultiplier: 1.08,
    congestionWarmthBoost: 0,
    relaxationBonus: -0.05,
    discomfortScale: 1.15,
  },
  rod: {
    id: 'rod',
    label: 'Rhythmic Member',
    description: 'Anatomical cyclic member moving automatically in and out with adjustable cadence',
    influenceRadius: 0.17,
    displacementScale: 1.22,
    allowHook: true,
    pressureScale: 1.02,
    arousalMultiplier: 1.24,
    congestionWarmthBoost: 0.24,
    relaxationBonus: 0.26,
    discomfortScale: 0.64,
  },
};

export const TACTILE_TOOL_ORDER: TactileToolId[] = ['rod'];

export interface CadencePresetSpec {
  id: CadencePreset;
  labelAr: string;
  rateHz: number;
  strokeDepth: number;
}

export const CADENCE_PRESETS: Record<CadencePreset, CadencePresetSpec> = {
  slow: {
    id: 'slow',
    labelAr: 'بطيء',
    rateHz: 0.38,
    strokeDepth: 0.78,
  },
  harmonious: {
    id: 'harmonious',
    labelAr: 'متناغم',
    rateHz: 0.82,
    strokeDepth: 0.92,
  },
  fast: {
    id: 'fast',
    labelAr: 'سريع',
    rateHz: 1.55,
    strokeDepth: 1.0,
  },
};

export function createInitialAutoCycle(): AutoCycleConfig {
  return {
    enabled: true,
    preset: 'harmonious',
    rateHz: CADENCE_PRESETS.harmonious.rateHz,
  };
}

export function getToolProfile(tool?: TactileToolId): TactileToolProfile {
  return tool && tool in TACTILE_TOOLS ? TACTILE_TOOLS[tool] : TACTILE_TOOLS.rod;
}

export interface DirectionalInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/**
 * Steps a steered tool coordinate smoothly within the pelvic anatomical canvas bounds.
 */
export function stepGuidedPosition(
  pos: { x: number; y: number },
  input: DirectionalInput,
  dt: number,
  speedNormPerSec = 0.52,
): { x: number; y: number; vx: number; vy: number; moving: boolean } {
  const dirX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dirY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const mag = Math.hypot(dirX, dirY);

  if (mag === 0 || dt <= 0) {
    return { x: pos.x, y: pos.y, vx: 0, vy: 0, moving: false };
  }

  const vx = (dirX / mag) * speedNormPerSec;
  const vy = (dirY / mag) * speedNormPerSec;
  const nextX = Math.max(-0.75, Math.min(0.75, pos.x + vx * dt));
  const nextY = Math.max(-0.78, Math.min(0.76, pos.y + vy * dt));

  return { x: nextX, y: nextY, vx, vy, moving: true };
}

export const INTROITUS_ENTRY_ANCHOR = { x: 0, y: 0.175 };
export const DEFAULT_ROD_REST_POS = { x: 0, y: 0.42 };

export function createInitialVerticalRod(): VerticalRodState {
  return {
    x: DEFAULT_ROD_REST_POS.x,
    y: DEFAULT_ROD_REST_POS.y,
    vx: 0,
    vy: 0,
    angle: 0,
    steerAngle: 0,
    halfLength: 0.25,
    radius: 0.044,
    insertion: 0.08,
    cyclePhase: 0,
    held: false,
    hovered: false,
    grabOffsetX: 0,
    grabOffsetY: 0,
  };
}

/**
 * Hit-tests a normalized point against the rotated capsule geometry of the vertical elongated shape.
 */
export function hitTestVerticalRod(
  px: number,
  py: number,
  rod: VerticalRodState,
  padding = 0.028,
): boolean {
  const dx = px - rod.x;
  const dy = py - rod.y;
  const cos = Math.cos(-rod.angle);
  const sin = Math.sin(-rod.angle);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const segHalf = Math.max(0.01, rod.halfLength - rod.radius);
  const clampedY = Math.max(-segHalf, Math.min(segHalf, localY));
  const dist = Math.hypot(localX, localY - clampedY);
  return dist <= rod.radius + padding;
}

export interface VerticalRodStepInput {
  dt: number;
  pointerPos?: { x: number; y: number } | null;
  directional?: DirectionalInput;
  /** -1 = tilt counter-clockwise (Q), +1 = tilt clockwise (E), 0 = none */
  tiltInput?: number;
  /** Optional automated cyclic insertion config */
  autoCycle?: AutoCycleConfig;
  /** Current arousal (0..1) subtly deepens harmonious rhythm */
  arousal?: number;
}

/**
 * Updates the graspable & cyclic member's insertion depth, position, velocity, and steering tilt.
 */
export function stepVerticalRod(rod: VerticalRodState, input: VerticalRodStepInput): VerticalRodState {
  const safeDt = Math.min(Math.max(input.dt, 0), 0.05);
  if (safeDt <= 0) return rod;

  let nextX = rod.x;
  let nextY = rod.y;
  let vx = 0;
  let vy = 0;
  let nextInsertion = rod.insertion;
  let nextCyclePhase = rod.cyclePhase;

  const hasDirectional = Boolean(
    input.directional &&
      (input.directional.left || input.directional.right || input.directional.up || input.directional.down),
  );

  if (rod.held && input.pointerPos) {
    const targetX = Math.max(-0.75, Math.min(0.75, input.pointerPos.x - rod.grabOffsetX));
    const targetY = Math.max(-0.74, Math.min(0.74, input.pointerPos.y - rod.grabOffsetY));
    vx = (targetX - rod.x) / safeDt;
    vy = (targetY - rod.y) / safeDt;
    nextX = targetX;
    nextY = targetY;
    const distFromIntroitusX = Math.abs(nextX - INTROITUS_ENTRY_ANCHOR.x);
    if (distFromIntroitusX < 0.095) {
      const tipY = nextY - rod.halfLength;
      nextInsertion = Math.max(0, Math.min(1, (0.28 - tipY) / 0.34));
    } else {
      nextInsertion = 0;
    }
  } else if (hasDirectional && input.directional) {
    const stepped = stepGuidedPosition({ x: rod.x, y: rod.y }, input.directional, safeDt, 0.54);
    nextX = stepped.x;
    nextY = stepped.y;
    vx = stepped.vx;
    vy = stepped.vy;
    const distFromIntroitusX = Math.abs(nextX - INTROITUS_ENTRY_ANCHOR.x);
    if (distFromIntroitusX < 0.095) {
      const tipY = nextY - rod.halfLength;
      nextInsertion = Math.max(0, Math.min(1, (0.28 - tipY) / 0.34));
    } else {
      nextInsertion = 0;
    }
  } else if (input.autoCycle?.enabled) {
    const rate = Math.max(0.2, Math.min(2.4, input.autoCycle.rateHz));
    const preset = input.autoCycle.preset;
    const arousalBoost = 1 + (input.arousal ?? 0) * 0.1;

    // Organic cadence waveform: harmonious gently lingers at full depth; slow glides smoothly; fast drives briskly
    const baseOmega = Math.PI * 2 * rate;
    const waveMod =
      preset === 'harmonious'
        ? 1 + 0.18 * Math.cos(rod.cyclePhase)
        : preset === 'slow'
          ? 1 + 0.08 * Math.cos(rod.cyclePhase)
          : 1;
    nextCyclePhase = (rod.cyclePhase + baseOmega * waveMod * safeDt) % (Math.PI * 2);

    const depthMax = CADENCE_PRESETS[preset].strokeDepth * arousalBoost;
    const rawSine = 0.5 - 0.5 * Math.cos(nextCyclePhase);
    // Smooth plateau rounding at peak depth in harmonious mode
    const shaped = preset === 'harmonious' ? Math.pow(rawSine, 0.85) : rawSine;
    nextInsertion = Math.max(0.04, Math.min(1.0, 0.04 + shaped * Math.min(0.96, depthMax)));

    // Align smoothly toward midline introitus anchor as cyclic motion runs
    const targetX = INTROITUS_ENTRY_ANCHOR.x + Math.sin(nextCyclePhase * 0.5) * 0.008;
    // Center Y glides upward (negative Y) as insertion increases so shaft travels in and out of introitus
    const withdrawnCenterY = 0.54;
    const insertedCenterY = 0.24;
    const targetY = withdrawnCenterY - nextInsertion * (withdrawnCenterY - insertedCenterY);

    nextX = rod.x + (targetX - rod.x) * Math.min(1, safeDt * 9.5);
    nextY = rod.y + (targetY - rod.y) * Math.min(1, safeDt * 14);
    vx = (nextX - rod.x) / safeDt;
    vy = (nextY - rod.y) / safeDt;
  } else {
    vx = rod.vx * Math.exp(-safeDt * 14);
    vy = rod.vy * Math.exp(-safeDt * 14);
    nextInsertion = rod.insertion * Math.exp(-safeDt * 4);
  }

  let nextSteerAngle = rod.steerAngle;
  if (input.tiltInput) {
    nextSteerAngle = Math.max(-0.48, Math.min(0.48, nextSteerAngle + input.tiltInput * 1.15 * safeDt));
  }

  const motionLean = Math.max(-0.18, Math.min(0.18, vx * 0.14));
  const targetAngle = Math.max(-0.55, Math.min(0.55, nextSteerAngle + motionLean));
  const nextAngle = rod.angle + (targetAngle - rod.angle) * Math.min(1, safeDt * 10);

  return {
    ...rod,
    x: nextX,
    y: nextY,
    vx,
    vy,
    angle: nextAngle,
    steerAngle: nextSteerAngle,
    insertion: nextInsertion,
    cyclePhase: nextCyclePhase,
  };
}
