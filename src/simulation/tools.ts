import type { TactileToolId } from './types';

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
};

export const TACTILE_TOOL_ORDER: TactileToolId[] = ['finger', 'brush', 'palm', 'probe'];

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
