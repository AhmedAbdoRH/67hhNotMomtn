import type { TactileToolId, VerticalRodState } from './types';

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
    label: 'Vertical Rod',
    description: 'Elongated vertical shape you can grasp, tilt, and guide across the tissue',
    influenceRadius: 0.16,
    displacementScale: 1.18,
    allowHook: true,
    pressureScale: 1.05,
    arousalMultiplier: 1.10,
    congestionWarmthBoost: 0.14,
    relaxationBonus: 0.18,
    discomfortScale: 0.78,
  },
};

export const TACTILE_TOOL_ORDER: TactileToolId[] = ['finger', 'brush', 'palm', 'probe', 'rod'];

export function getToolProfile(tool?: TactileToolId): TactileToolProfile {
  return tool && tool in TACTILE_TOOLS ? TACTILE_TOOLS[tool] : TACTILE_TOOLS.finger;
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

export const DEFAULT_ROD_REST_POS = { x: 0.42, y: 0.06 };

export function createInitialVerticalRod(): VerticalRodState {
  return {
    x: DEFAULT_ROD_REST_POS.x,
    y: DEFAULT_ROD_REST_POS.y,
    vx: 0,
    vy: 0,
    angle: 0,
    steerAngle: 0,
    halfLength: 0.18,
    radius: 0.032,
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
  padding = 0.024,
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
}

/**
 * Updates the graspable vertical elongated rod's position, velocity, and steering tilt.
 */
export function stepVerticalRod(rod: VerticalRodState, input: VerticalRodStepInput): VerticalRodState {
  const safeDt = Math.min(Math.max(input.dt, 0), 0.05);
  if (safeDt <= 0) return rod;

  let nextX = rod.x;
  let nextY = rod.y;
  let vx = 0;
  let vy = 0;

  if (rod.held && input.pointerPos) {
    const targetX = Math.max(-0.75, Math.min(0.75, input.pointerPos.x - rod.grabOffsetX));
    const targetY = Math.max(-0.74, Math.min(0.74, input.pointerPos.y - rod.grabOffsetY));
    vx = (targetX - rod.x) / safeDt;
    vy = (targetY - rod.y) / safeDt;
    nextX = targetX;
    nextY = targetY;
  } else if (input.directional && (input.directional.left || input.directional.right || input.directional.up || input.directional.down)) {
    const stepped = stepGuidedPosition({ x: rod.x, y: rod.y }, input.directional, safeDt, 0.54);
    nextX = stepped.x;
    nextY = stepped.y;
    vx = stepped.vx;
    vy = stepped.vy;
  } else {
    vx = rod.vx * Math.exp(-safeDt * 14);
    vy = rod.vy * Math.exp(-safeDt * 14);
  }

  let nextSteerAngle = rod.steerAngle;
  if (input.tiltInput) {
    nextSteerAngle = Math.max(-0.48, Math.min(0.48, nextSteerAngle + input.tiltInput * 1.15 * safeDt));
  }

  // Subtle dynamic lean during horizontal steering while honoring user's steered angle
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
  };
}
