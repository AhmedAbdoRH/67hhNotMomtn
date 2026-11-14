import { clamp01, computeSurfaceFriction } from './physiology';
import { getToolProfile } from './tools';
import type {
  AnatomicalZone,
  MoistureBead,
  PhysiologicalState,
  PointerContact,
  SkeneDroplet,
  SpringNode,
  TissueMeshState,
} from './types';

function makeNode(
  id: string,
  restX: number,
  restY: number,
  opts: {
    mass?: number;
    stiffness?: number;
    damping?: number;
    compliance?: number;
    waveOffset?: number;
  } = {},
): SpringNode {
  return {
    id,
    restX,
    restY,
    x: restX,
    y: restY,
    vx: 0,
    vy: 0,
    mass: opts.mass ?? 1.0,
    stiffness: opts.stiffness ?? 68,
    damping: opts.damping ?? 11.5,
    compliance: opts.compliance ?? 1.0,
    waveOffset: opts.waveOffset ?? 0,
    hooked: false,
    hookOffsetX: 0,
    hookOffsetY: 0,
  };
}

export function createInitialTissueMesh(): TissueMeshState {
  // Left Labium Majus (viewer-left, -x): fleshy cushion inner margin
  // At rest, inner margins coapt gently with natural anterior/posterior taper
  const majoraLeft: SpringNode[] = [
    makeNode('majL0', -0.004, -0.47, { mass: 1.5, stiffness: 86, damping: 14.5, compliance: 0.55 }),
    makeNode('majL1', -0.017, -0.33, { mass: 1.4, stiffness: 70, damping: 13.0, compliance: 0.9 }),
    makeNode('majL2', -0.025, -0.14, { mass: 1.35, stiffness: 62, damping: 12.2, compliance: 1.1 }),
    makeNode('majL3', -0.021, 0.07, { mass: 1.35, stiffness: 60, damping: 12.0, compliance: 1.15 }),
    makeNode('majL4', -0.015, 0.27, { mass: 1.4, stiffness: 64, damping: 12.6, compliance: 1.0 }),
    makeNode('majL5', -0.009, 0.41, { mass: 1.45, stiffness: 76, damping: 13.5, compliance: 0.72 }),
    makeNode('majL6', -0.003, 0.50, { mass: 1.6, stiffness: 94, damping: 15.0, compliance: 0.45 }),
  ];

  // Right Labium Majus (viewer-right, +x): subtle natural asymmetry in contour
  const majoraRight: SpringNode[] = [
    makeNode('majR0', 0.005, -0.46, { mass: 1.5, stiffness: 86, damping: 14.5, compliance: 0.55 }),
    makeNode('majR1', 0.016, -0.32, { mass: 1.4, stiffness: 72, damping: 13.0, compliance: 0.9 }),
    makeNode('majR2', 0.021, -0.12, { mass: 1.35, stiffness: 64, damping: 12.2, compliance: 1.1 }),
    makeNode('majR3', 0.019, 0.08, { mass: 1.35, stiffness: 62, damping: 12.0, compliance: 1.15 }),
    makeNode('majR4', 0.014, 0.28, { mass: 1.4, stiffness: 66, damping: 12.6, compliance: 1.0 }),
    makeNode('majR5', 0.008, 0.42, { mass: 1.45, stiffness: 78, damping: 13.5, compliance: 0.72 }),
    makeNode('majR6', 0.003, 0.50, { mass: 1.6, stiffness: 94, damping: 15.0, compliance: 0.45 }),
  ];

  // Left Labium Minus (viewer-left, -x): noticeably longer, softer, wavy/crenulated edge peeking gently at rest
  const minoraLeft: SpringNode[] = [
    makeNode('minL0', -0.006, -0.40, { mass: 0.72, stiffness: 66, damping: 9.8, compliance: 0.65, waveOffset: -0.002 }),
    makeNode('minL1', -0.014, -0.29, { mass: 0.65, stiffness: 52, damping: 8.8, compliance: 1.05, waveOffset: -0.009 }),
    makeNode('minL2', -0.010, -0.17, { mass: 0.60, stiffness: 46, damping: 8.2, compliance: 1.25, waveOffset: -0.014 }),
    makeNode('minL3', -0.007, -0.04, { mass: 0.58, stiffness: 44, damping: 8.0, compliance: 1.35, waveOffset: -0.011 }),
    makeNode('minL4', -0.005, 0.10, { mass: 0.58, stiffness: 44, damping: 8.0, compliance: 1.35, waveOffset: -0.016 }),
    makeNode('minL5', -0.007, 0.23, { mass: 0.62, stiffness: 48, damping: 8.4, compliance: 1.2, waveOffset: -0.009 }),
    makeNode('minL6', -0.009, 0.34, { mass: 0.68, stiffness: 56, damping: 9.2, compliance: 0.95, waveOffset: -0.005 }),
    makeNode('minL7', -0.003, 0.42, { mass: 0.78, stiffness: 74, damping: 11.0, compliance: 0.55, waveOffset: 0 }),
  ];

  // Right Labium Minus (viewer-right, +x): slightly shorter, narrower, distinct wave profile
  const minoraRight: SpringNode[] = [
    makeNode('minR0', 0.006, -0.39, { mass: 0.72, stiffness: 68, damping: 9.8, compliance: 0.65, waveOffset: 0.002 }),
    makeNode('minR1', 0.012, -0.28, { mass: 0.65, stiffness: 54, damping: 8.8, compliance: 1.0, waveOffset: 0.006 }),
    makeNode('minR2', 0.008, -0.16, { mass: 0.62, stiffness: 48, damping: 8.4, compliance: 1.18, waveOffset: 0.004 }),
    makeNode('minR3', 0.006, -0.03, { mass: 0.60, stiffness: 46, damping: 8.2, compliance: 1.25, waveOffset: 0.008 }),
    makeNode('minR4', 0.005, 0.10, { mass: 0.60, stiffness: 48, damping: 8.4, compliance: 1.22, waveOffset: 0.004 }),
    makeNode('minR5', 0.007, 0.22, { mass: 0.64, stiffness: 52, damping: 8.8, compliance: 1.05, waveOffset: 0.007 }),
    makeNode('minR6', 0.007, 0.33, { mass: 0.70, stiffness: 62, damping: 9.6, compliance: 0.85, waveOffset: 0.003 }),
    makeNode('minR7', 0.003, 0.41, { mass: 0.78, stiffness: 76, damping: 11.0, compliance: 0.55, waveOffset: 0 }),
  ];

  // Clitoral Prepuce (hood) nodes:
  // 0: dorsal apex, 1: left hood fold, 2: anterior rim center (retracts up), 3: right hood fold, 4: frenulum base
  const prepuce: SpringNode[] = [
    makeNode('prepApex', 0.0, -0.47, { mass: 0.8, stiffness: 80, damping: 11.5, compliance: 0.55 }),
    makeNode('prepLeft', -0.032, -0.39, { mass: 0.65, stiffness: 60, damping: 9.5, compliance: 0.95 }),
    makeNode('prepRim', 0.001, -0.348, { mass: 0.52, stiffness: 50, damping: 8.6, compliance: 1.25 }),
    makeNode('prepRight', 0.031, -0.388, { mass: 0.65, stiffness: 60, damping: 9.5, compliance: 0.95 }),
    makeNode('prepFren', 0.0, -0.305, { mass: 0.72, stiffness: 72, damping: 10.5, compliance: 0.7 }),
  ];

  const glans = makeNode('glans', 0.001, -0.368, { mass: 0.55, stiffness: 85, damping: 11.0, compliance: 0.45 });

  // Vestibule / introital walls: coapted (closed) at rest around x = ±0.004
  const vestibuleLeft: SpringNode[] = [
    makeNode('vestL0', -0.003, -0.02, { mass: 0.9, stiffness: 76, damping: 12.5, compliance: 0.75 }),
    makeNode('vestL1', -0.004, 0.08, { mass: 0.95, stiffness: 74, damping: 12.8, compliance: 0.95 }),
    makeNode('vestL2', -0.004, 0.18, { mass: 0.95, stiffness: 72, damping: 12.8, compliance: 1.0 }),
    makeNode('vestL3', -0.004, 0.28, { mass: 0.95, stiffness: 76, damping: 12.8, compliance: 0.9 }),
    makeNode('vestL4', -0.002, 0.36, { mass: 0.9, stiffness: 84, damping: 13.2, compliance: 0.65 }),
  ];

  const vestibuleRight: SpringNode[] = [
    makeNode('vestR0', 0.003, -0.02, { mass: 0.9, stiffness: 76, damping: 12.5, compliance: 0.75 }),
    makeNode('vestR1', 0.004, 0.08, { mass: 0.95, stiffness: 74, damping: 12.8, compliance: 0.95 }),
    makeNode('vestR2', 0.004, 0.18, { mass: 0.95, stiffness: 72, damping: 12.8, compliance: 1.0 }),
    makeNode('vestR3', 0.004, 0.28, { mass: 0.95, stiffness: 76, damping: 12.8, compliance: 0.9 }),
    makeNode('vestR4', 0.002, 0.36, { mass: 0.9, stiffness: 84, damping: 13.2, compliance: 0.65 }),
  ];

  return {
    majoraLeft,
    majoraRight,
    minoraLeft,
    minoraRight,
    prepuce,
    glans,
    vestibuleLeft,
    vestibuleRight,
    moistureBeads: [],
    emissionDroplets: [],
    hoodRetraction: 0.08,
    glansRecession: 0,
    cleftOpening: 0,
    introitusSwelling: 0,
    externalSwelling: 0,
    defensiveTension: 0,
    nextBeadId: 1,
    nextEmissionId: 1,
  };
}

/**
 * Hit-tests a normalized anatomical point against current deformed mesh positions
 * to identify the exact sensory zone and whether the glans is directly exposed/touched.
 */
export function detectAnatomicalZone(
  x: number,
  y: number,
  mesh: TissueMeshState,
): { zone: AnatomicalZone; isDirectGlans: boolean } {
  const glans = mesh.glans;
  const prepRim = mesh.prepuce[2];

  // Check clitoral glans & prepuce region
  const distToGlans = Math.hypot((x - glans.x) * 1.15, (y - glans.y) * 1.25);
  const effectiveExposure = clamp01(mesh.hoodRetraction * 1.15 - mesh.glansRecession * 0.65);

  if (distToGlans < 0.052) {
    // Exposed below the prepuce rim or uncovered by retraction
    const isBelowRim = y > prepRim.y - 0.015;
    if (isBelowRim && effectiveExposure > 0.26) {
      return { zone: 'glans', isDirectGlans: true };
    }
    return { zone: 'prepuce', isDirectGlans: false };
  }

  // Prepuce / hood broader area
  if (y >= -0.52 && y <= -0.30 && Math.abs(x) < 0.095) {
    return { zone: 'prepuce', isDirectGlans: false };
  }

  // Mons pubis
  if (y < -0.52 && Math.abs(x) < 0.42) {
    return { zone: 'mons', isDirectGlans: false };
  }

  // Urethral meatus (secluded anterior vestibule above introitus)
  const urethraDist = Math.hypot((x - 0.004) * 1.3, (y - -0.145) * 1.2);
  if (urethraDist < 0.042 && mesh.cleftOpening > 0.14) {
    return { zone: 'urethra', isDirectGlans: false };
  }

  // Posterior fourchette & perineal body
  if (y > 0.37 && y <= 0.49 && Math.abs(x) < 0.11) {
    return { zone: 'fourchette', isDirectGlans: false };
  }
  if (y > 0.49 && Math.abs(x) < 0.34) {
    return { zone: 'perineum', isDirectGlans: false };
  }

  // Compare against deformed left/right minora and vestibule positions
  // Find nearest vestibule / minora / majora y-slice
  const minoraLeftX = sampleChainXAtY(mesh.minoraLeft, y);
  const minoraRightX = sampleChainXAtY(mesh.minoraRight, y);
  const majoraLeftX = sampleChainXAtY(mesh.majoraLeft, y);
  const majoraRightX = sampleChainXAtY(mesh.majoraRight, y);

  if (y >= -0.28 && y <= 0.38) {
    // Inside parted inner cleft -> vestibule
    if (x > minoraLeftX + 0.016 && x < minoraRightX - 0.016 && mesh.cleftOpening > 0.1) {
      return { zone: 'vestibule', isDirectGlans: false };
    }
    // Near left labium minus
    if (x >= majoraLeftX - 0.015 && x <= Math.max(minoraLeftX + 0.025, 0.015) && x < 0.025) {
      return { zone: 'labia_minor_left', isDirectGlans: false };
    }
    // Near right labium minus
    if (x <= majoraRightX + 0.015 && x >= Math.min(minoraRightX - 0.025, -0.015) && x > -0.025) {
      return { zone: 'labia_minor_right', isDirectGlans: false };
    }
  }

  // Labia majora cushions
  if (y >= -0.52 && y <= 0.54) {
    if (x < 0 && x >= -0.38) {
      return { zone: 'labia_major_left', isDirectGlans: false };
    }
    if (x >= 0 && x <= 0.38) {
      return { zone: 'labia_major_right', isDirectGlans: false };
    }
  }

  return { zone: 'none', isDirectGlans: false };
}

export function sampleChainXAtY(nodes: SpringNode[], targetY: number): number {
  if (nodes.length === 0) return 0;
  if (targetY <= nodes[0].y) return nodes[0].x;
  if (targetY >= nodes[nodes.length - 1].y) return nodes[nodes.length - 1].x;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (targetY >= a.y && targetY <= b.y) {
      const span = b.y - a.y;
      if (Math.abs(span) < 1e-5) return a.x;
      const t = (targetY - a.y) / span;
      return a.x + (b.x - a.x) * t;
    }
  }
  return nodes[nodes.length - 1].x;
}

function stepChainSprings(
  nodes: SpringNode[],
  targetOffsets: Array<{ dx: number; dy: number }>,
  contact: PointerContact,
  dt: number,
  options: {
    stiffnessScale: number;
    dampingScale: number;
    couplingStrength: number;
    breakawayDistance: number;
    allowHook: boolean;
    sideSign?: -1 | 0 | 1;
  },
) {
  const { stiffnessScale, dampingScale, couplingStrength, breakawayDistance, allowHook, sideSign = 0 } = options;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const targetX = node.restX + targetOffsets[i].dx;
    const targetY = node.restY + targetOffsets[i].dy;

    // 1. Restoring viscoelastic spring force F = -k(x - x_target) - c*v
    let fx = -node.stiffness * stiffnessScale * (node.x - targetX) - node.damping * dampingScale * node.vx;
    let fy = -node.stiffness * stiffnessScale * (node.y - targetY) - node.damping * dampingScale * node.vy;

    // 2. Neighbor tissue continuity coupling along the anatomical fold
    if (i > 0) {
      const prev = nodes[i - 1];
      const restDx = node.restX - prev.restX;
      const restDy = node.restY - prev.restY;
      fx += couplingStrength * ((prev.x + restDx) - node.x);
      fy += couplingStrength * ((prev.y + restDy) - node.y);
    }
    if (i < nodes.length - 1) {
      const next = nodes[i + 1];
      const restDx = node.restX - next.restX;
      const restDy = node.restY - next.restY;
      fx += couplingStrength * ((next.x + restDx) - node.x);
      fy += couplingStrength * ((next.y + restDy) - node.y);
    }

    // 3. Direct tactile interaction + catching/hooking hysteresis
    if (contact.active) {
      const toolProfile = getToolProfile(contact.tool);
      const dxToNode = node.x - contact.x;
      const dyToNode = node.y - contact.y;
      const dist = Math.hypot(dxToNode, dyToNode);

      // Asymmetrical side isolation: only strongly affect nodes near cursor, never mirror to opposite side
      const influenceRadius = toolProfile.influenceRadius;
      const sigma = Math.max(0.045, influenceRadius * 0.47);
      // When pointer is clearly on one side of the midline, isolate force to that side unless pressing directly in the midline cleft
      const isOppositeSide =
        sideSign !== 0 &&
        !node.hooked &&
        ((sideSign === -1 && contact.x > 0.015) || (sideSign === 1 && contact.x < -0.015));
      const sideFactor = isOppositeSide ? 0 : 1.0;

      if ((dist < influenceRadius || node.hooked) && sideFactor > 0.1) {
        const proximity = Math.exp(-(dist * dist) / (2 * sigma * sigma)) * sideFactor;

        if (allowHook && toolProfile.allowHook && !node.hooked && dist < 0.075 && contact.pressure > 0.12) {
          // Catch/hook onto the tissue fold briefly
          node.hooked = true;
          node.hookOffsetX = node.x - contact.x;
          node.hookOffsetY = node.y - contact.y;
        }

        if (node.hooked) {
          const desiredX = contact.x + node.hookOffsetX;
          const desiredY = contact.y + node.hookOffsetY;
          const stretch = Math.hypot(desiredX - targetX, desiredY - targetY);

          // Slip/breakaway when stretch exceeds moisture-modulated threshold -> elastic snap back
          if (stretch > breakawayDistance || contact.pressure < 0.08 || !toolProfile.allowHook) {
            node.hooked = false;
          } else {
            const hookGrip = 220 * (0.45 + 0.55 * contact.friction) * (0.55 + 0.45 * contact.pressure);
            fx += hookGrip * (desiredX - node.x);
            fy += hookGrip * (desiredY - node.y);
          }
        }

        // Local lateral displacement / parting + directional drag scaled by active tool
        const pushStrength = (34 + 54 * contact.pressure) * node.compliance * proximity * toolProfile.displacementScale;
        const dragScale = toolProfile.displacementScale;
        let pushX = 0;
        if (sideSign !== 0 && dist > 0.005) {
          // Gentle outward parting when pressing near midline cleft; otherwise follow directional drag
          const inMidlineCleft = Math.abs(contact.x) < 0.025;
          const radialSign = inMidlineCleft ? sideSign : Math.sign(dxToNode) || sideSign;
          pushX = radialSign * pushStrength * (inMidlineCleft ? 0.55 : 0.22);
          pushX += contact.vx * 36 * (0.35 + 0.65 * contact.friction) * proximity * dragScale;
        } else {
          pushX = contact.vx * 28 * (0.3 + 0.7 * contact.friction) * proximity * dragScale;
        }
        const pushY = contact.vy * 28 * (0.3 + 0.7 * contact.friction) * proximity * dragScale;

        fx += pushX;
        fy += pushY;
      }
    } else {
      node.hooked = false;
    }

    // Semi-implicit Euler integration (stable & crisp)
    const ax = fx / node.mass;
    const ay = fy / node.mass;
    node.vx += ax * dt;
    node.vy += ay * dt;

    // Velocity clamp for numerical stability
    const maxV = 3.5;
    const vMag = Math.hypot(node.vx, node.vy);
    if (vMag > maxV) {
      node.vx = (node.vx / vMag) * maxV;
      node.vy = (node.vy / vMag) * maxV;
    }

    node.x += node.vx * dt;
    node.y += node.vy * dt;
  }
}

/**
 * Steps all viscoelastic tissue meshes, hood/glans kinematics, and gravity-driven moisture beads.
 */
export function stepTissueMesh(
  mesh: TissueMeshState,
  physiology: PhysiologicalState,
  contact: PointerContact,
  dt: number,
): TissueMeshState {
  const safeDt = Math.min(Math.max(dt, 0), 0.05);
  if (safeDt === 0) return mesh;

  const { congestion, arousal, moisture, discomfort, vestibuleRelaxation, breathPhase, pulsePhase, peakReleaseTimer } =
    physiology;

  // Defensive tension increases stiffness when discomfort rises or vestibule isn't relaxed yet
  const defensiveTension = clamp01(discomfort * 0.85 + (1 - vestibuleRelaxation) * 0.25);

  // Subtle organic micro-movements from breathing, vascular pulse, & rhythmic contractions
  const breathWave = Math.sin(breathPhase) * (0.0035 + arousal * 0.006);
  const vascularPulse = Math.sin(pulsePhase) * congestion * 0.006;
  const prePeakContraction =
    arousal > 0.40 && discomfort < 0.35
      ? Math.pow(Math.max(0, Math.sin(pulsePhase * 0.5)), 2) * clamp01((arousal - 0.40) / 0.60) * 0.014
      : 0;
  const peakPulse =
    peakReleaseTimer > 0
      ? Math.pow(Math.max(0, Math.sin((3.8 - peakReleaseTimer) * Math.PI * 2.4)), 1.45) * 0.036
      : 0;
  const totalContraction = prePeakContraction + peakPulse;

  // Vestibular bulb & introital entrance swelling driven by vasocongestion + arousal
  const introitusSwelling = clamp01((congestion * 0.65 + arousal * 0.45 - 0.10) / 0.88) * (1 - discomfort * 0.55);

  // External soft-tissue swelling (labia majora, anterior commissure, perineal fullness) coupled to arousal & release
  const peakSwellingSurge = peakReleaseTimer > 0
    ? 0.22 * clamp01(peakReleaseTimer / 3.8) + peakPulse * 3.0
    : 0;
  const targetExternalSwelling = clamp01(
    ((congestion * 0.56 + arousal * 0.44 - 0.08) / 0.86 + peakSwellingSurge) * (1 - discomfort * 0.45),
  );
  const externalSwellingRate = targetExternalSwelling > mesh.externalSwelling ? 4.2 : 1.15;
  const externalSwelling = clamp01(
    mesh.externalSwelling + (targetExternalSwelling - mesh.externalSwelling) * Math.min(1, safeDt * externalSwellingRate),
  );

  // 1. Clitoral Hood Retraction & High-Congestion Glans Recession
  // Mild arousal retracts hood; high congestion swells surrounding hood/crura so glans slightly recedes beneath
  const arousalRetract = clamp01(arousal * 0.88) * 0.54;
  let manualHoodPull = 0;
  if (contact.active && (contact.zone === 'prepuce' || contact.zone === 'glans' || contact.y < -0.25)) {
    // Upward or lateral parting near prepuce retracts hood smoothly
    const upwardPull = contact.vy < -0.01 ? clamp01(-contact.vy * 0.45) : 0;
    const lateralPart = Math.abs(contact.x) < 0.08 && contact.pressure > 0.2 ? 0.22 * contact.pressure : 0;
    manualHoodPull = clamp01(upwardPull + lateralPart);
  }
  const targetHoodRetraction = clamp01(0.08 + arousalRetract + manualHoodPull * 0.55 - discomfort * 0.18);
  mesh.hoodRetraction += (targetHoodRetraction - mesh.hoodRetraction) * Math.min(1, safeDt * 5.0);

  // High vasocongestion causes the glans to recede slightly deeper underneath the engorged prepuce
  const targetGlansRecession = congestion > 0.58 ? clamp01((congestion - 0.58) / 0.42) * 0.72 : 0;
  mesh.glansRecession += (targetGlansRecession - mesh.glansRecession) * Math.min(1, safeDt * 3.5);

  // 2. Compute physiological resting offsets (vasocongestion swelling & natural eversion/parting)
  // At rest (congestion ~0.04, no touch), cleft stays closed!
  // With tactile stimulation raising vasocongestion & arousal, majora plump/part and minora engorge/evert outward.
  const congestionDrive = clamp01((congestion - 0.12) / 0.88);
  const arousalDrive = clamp01((arousal - 0.10) / 0.90);
  const comfortGate = 1 - discomfort * 0.72;
  const congestionParting =
    (congestionDrive * 0.086 + arousalDrive * 0.036 + externalSwelling * 0.022 + totalContraction * 0.55) *
    comfortGate;

  const majoraLeftOffsets = mesh.majoraLeft.map((n, idx) => {
    const midBell = Math.sin((idx / (mesh.majoraLeft.length - 1)) * Math.PI);
    return {
      dx: -congestionParting * midBell - vascularPulse * 0.65 * midBell + discomfort * 0.014 * midBell,
      dy: breathWave * 0.65 - totalContraction * 0.35 * midBell,
    };
  });
  const majoraRightOffsets = mesh.majoraRight.map((n, idx) => {
    const midBell = Math.sin((idx / (mesh.majoraRight.length - 1)) * Math.PI);
    return {
      dx: congestionParting * midBell + vascularPulse * 0.65 * midBell - discomfort * 0.014 * midBell,
      dy: breathWave * 0.65 - totalContraction * 0.35 * midBell,
    };
  });

  const minoraLeftOffsets = mesh.minoraLeft.map((n, idx) => {
    const midBell = Math.sin((idx / (mesh.minoraLeft.length - 1)) * Math.PI);
    const engorgeX = congestion * 0.052 * midBell * comfortGate;
    return {
      dx: -congestionParting * 0.86 * midBell - engorgeX + totalContraction * 0.42 * midBell + discomfort * 0.010 * midBell,
      dy: breathWave * 0.45 + congestion * 0.016 * midBell - totalContraction * 0.30 * midBell,
    };
  });
  const minoraRightOffsets = mesh.minoraRight.map((n, idx) => {
    const midBell = Math.sin((idx / (mesh.minoraRight.length - 1)) * Math.PI);
    const engorgeX = congestion * 0.044 * midBell * comfortGate;
    return {
      dx: congestionParting * 0.86 * midBell + engorgeX - totalContraction * 0.42 * midBell - discomfort * 0.010 * midBell,
      dy: breathWave * 0.45 + congestion * 0.014 * midBell - totalContraction * 0.30 * midBell,
    };
  });

  // Prepuce offsets: rim pulls superiorly (-y) with hoodRetraction, lateral folds widen/swell with congestion
  const prepuceOffsets = [
    { dx: 0, dy: breathWave * 0.3 - mesh.hoodRetraction * 0.016 },
    { dx: -0.020 * congestion - mesh.hoodRetraction * 0.018, dy: -mesh.hoodRetraction * 0.022 },
    { dx: 0, dy: -mesh.hoodRetraction * 0.062 + mesh.glansRecession * 0.014 - totalContraction * 0.35 },
    { dx: 0.020 * congestion + mesh.hoodRetraction * 0.018, dy: -mesh.hoodRetraction * 0.022 },
    { dx: 0, dy: breathWave * 0.2 },
  ];

  // Glans target shifts slightly superiorly under hood when glansRecession rises & pulses with contractions
  const glansOffsets = [
    {
      dx: 0,
      dy: -mesh.glansRecession * 0.026 - vascularPulse * 0.45 + breathWave * 0.25 - totalContraction * 0.62,
    },
  ];

  // Vestibule remains closed at rest; opens visibly with manual stretch, arousal relaxation, and introital bulb engorgement
  const minoraSpread = Math.max(
    0,
    mesh.minoraRight[3].x - mesh.minoraLeft[3].x - (mesh.minoraRight[3].restX - mesh.minoraLeft[3].restX),
  );
  const stretchOpen = clamp01(minoraSpread * 3.8) * 0.046;
  const arousalOpen = clamp01((arousal - 0.18) / 0.82) * vestibuleRelaxation * 0.042;
  const introitusSwellOpen = introitusSwelling * (0.024 + 0.026 * vestibuleRelaxation);
  const naturalVestibuleOpen =
    (stretchOpen + arousalOpen + introitusSwellOpen - totalContraction * 0.82) *
    (0.48 + 0.52 * vestibuleRelaxation) *
    (1 - discomfort * 0.78);
  const vestibuleLeftOffsets = mesh.vestibuleLeft.map((_, idx) => {
    const bell = Math.sin((idx / (mesh.vestibuleLeft.length - 1)) * Math.PI);
    return {
      dx: -Math.max(0, naturalVestibuleOpen) * bell,
      dy: breathWave * 0.35 + introitusSwelling * 0.008 * bell - totalContraction * 0.4 * bell,
    };
  });
  const vestibuleRightOffsets = mesh.vestibuleRight.map((_, idx) => {
    const bell = Math.sin((idx / (mesh.vestibuleRight.length - 1)) * Math.PI);
    return {
      dx: Math.max(0, naturalVestibuleOpen) * bell,
      dy: breathWave * 0.35 + introitusSwelling * 0.008 * bell - totalContraction * 0.4 * bell,
    };
  });

  // Moisture reduces hooking breakaway distance (wet slides easily; dry catches longer before snapping back)
  const breakaway = 0.145 - moisture * 0.085;
  const friction = contact.active ? computeSurfaceFriction(moisture, contact.pressure, contact.zone) : 0;
  const contactWithFriction: PointerContact = { ...contact, friction };

  // Step all spring-damper chains
  stepChainSprings(mesh.majoraLeft, majoraLeftOffsets, contactWithFriction, safeDt, {
    stiffnessScale: 1.0 + discomfort * 0.45,
    dampingScale: 1.0,
    couplingStrength: 24,
    breakawayDistance: breakaway * 1.1,
    allowHook: true,
    sideSign: -1,
  });

  stepChainSprings(mesh.majoraRight, majoraRightOffsets, contactWithFriction, safeDt, {
    stiffnessScale: 1.0 + discomfort * 0.45,
    dampingScale: 1.0,
    couplingStrength: 24,
    breakawayDistance: breakaway * 1.1,
    allowHook: true,
    sideSign: 1,
  });

  stepChainSprings(mesh.minoraLeft, minoraLeftOffsets, contactWithFriction, safeDt, {
    stiffnessScale: 1.0 + congestion * 0.25 + discomfort * 0.5,
    dampingScale: 1.0,
    couplingStrength: 18,
    breakawayDistance: breakaway,
    allowHook: true,
    sideSign: -1,
  });

  stepChainSprings(mesh.minoraRight, minoraRightOffsets, contactWithFriction, safeDt, {
    stiffnessScale: 1.0 + congestion * 0.25 + discomfort * 0.5,
    dampingScale: 1.0,
    couplingStrength: 18,
    breakawayDistance: breakaway,
    allowHook: true,
    sideSign: 1,
  });

  stepChainSprings(mesh.prepuce, prepuceOffsets, contactWithFriction, safeDt, {
    stiffnessScale: 1.0 + discomfort * 0.35,
    dampingScale: 1.0,
    couplingStrength: 15,
    breakawayDistance: breakaway * 0.8,
    allowHook: true,
    sideSign: 0,
  });

  stepChainSprings([mesh.glans], glansOffsets, contactWithFriction, safeDt, {
    stiffnessScale: 1.15,
    dampingScale: 1.1,
    couplingStrength: 0,
    breakawayDistance: 0.04,
    allowHook: false,
    sideSign: 0,
  });

  // Vestibule resistance: higher stiffness when unrelaxed or uncomfortable
  const vestibuleStiffness = 1.35 - vestibuleRelaxation * 0.55 + discomfort * 1.2;
  stepChainSprings(mesh.vestibuleLeft, vestibuleLeftOffsets, contactWithFriction, safeDt, {
    stiffnessScale: vestibuleStiffness,
    dampingScale: 1.15,
    couplingStrength: 20,
    breakawayDistance: breakaway * 0.7,
    allowHook: false,
    sideSign: -1,
  });

  stepChainSprings(mesh.vestibuleRight, vestibuleRightOffsets, contactWithFriction, safeDt, {
    stiffnessScale: vestibuleStiffness,
    dampingScale: 1.15,
    couplingStrength: 20,
    breakawayDistance: breakaway * 0.7,
    allowHook: false,
    sideSign: 1,
  });

  // Enforce gentle anatomical midline non-crossing on vestibule & majora cushions (except soft overlap of minora)
  for (let i = 0; i < mesh.vestibuleLeft.length; i++) {
    if (mesh.vestibuleLeft[i].x > 0.002) mesh.vestibuleLeft[i].x = 0.002;
    if (mesh.vestibuleRight[i].x < -0.002) mesh.vestibuleRight[i].x = -0.002;
  }

  // Compute effective cleft opening for rendering & hit-testing
  const avgLabiaSpan =
    (mesh.majoraRight[2].x - mesh.majoraLeft[2].x + (mesh.majoraRight[3].x - mesh.majoraLeft[3].x)) * 0.5;
  const restSpan =
    (mesh.majoraRight[2].restX - mesh.majoraLeft[2].restX + (mesh.majoraRight[3].restX - mesh.majoraLeft[3].restX)) *
    0.5;
  const cleftOpening = clamp01((avgLabiaSpan - restSpan) / 0.19);

  // 3. Moisture Beads & Gravity-Driven Film Flow + Skene's Gland Emission Droplets
  const beads = stepMoistureBeads(mesh, physiology, safeDt);
  const emissionDroplets = stepSkeneEmissionDroplets(mesh, physiology, safeDt);

  mesh.cleftOpening = cleftOpening;
  mesh.introitusSwelling = introitusSwelling;
  mesh.externalSwelling = externalSwelling;
  mesh.defensiveTension = defensiveTension;
  mesh.moistureBeads = beads;
  mesh.emissionDroplets = emissionDroplets;

  return mesh;
}

function stepSkeneEmissionDroplets(
  mesh: TissueMeshState,
  physiology: PhysiologicalState,
  dt: number,
): SkeneDroplet[] {
  const { peakReleaseTimer } = physiology;
  const droplets = mesh.emissionDroplets;

  // Emit rhythmic periurethral / Skene's gland fluid pulses while peakReleaseTimer > 0
  if (peakReleaseTimer > 0.25) {
    // Rhythmic pulse gate (~2.4 Hz) simulating involuntary pelvic-floor expulsion waves
    const pulseWave = Math.sin((3.8 - peakReleaseTimer) * Math.PI * 2.4);
    const desiredPerStep = pulseWave > -0.25 ? 3 : 1;

    for (let k = 0; k < desiredPerStep && droplets.length < 68; k++) {
      const id = mesh.nextEmissionId++;
      // Three paraurethral origins: left Skene duct (-0.007, -0.140), meatus (0.004, -0.145), right Skene duct (0.015, -0.140)
      const originChoice = id % 3;
      const originX = originChoice === 0 ? -0.007 : originChoice === 1 ? 0.004 : 0.015;
      const originY = originChoice === 1 ? -0.145 : -0.140;

      // Natural outward & downward fluid fan across vestibule and lower labia
      const spreadSeed = (((id * 1.6180339) % 1) - 0.5) * 2;
      const lateralV = spreadSeed * 0.165 + (originX - 0.004) * 2.6;
      const downV = 0.32 + ((id * 0.31) % 0.22) + Math.max(0, pulseWave) * 0.22;

      droplets.push({
        id,
        x: originX,
        y: originY,
        prevX: originX,
        prevY: originY,
        vx: lateralV,
        vy: downV,
        radius: 0.0075 + ((id * 0.23) % 0.007),
        alpha: 0.90,
        age: 0,
      });
    }
  }

  const gravity = 0.38;
  const kept: SkeneDroplet[] = [];

  for (let i = 0; i < droplets.length; i++) {
    const d = droplets[i];
    d.prevX = d.x;
    d.prevY = d.y;
    d.age += dt;

    // Gravity accelerates fluid downward over vestibule & fourchette while surface drag slows lateral drift
    d.vy += gravity * dt;
    d.vx *= Math.exp(-dt * 1.8);
    d.vy *= Math.exp(-dt * 0.9);

    d.x += d.vx * dt;
    d.y += d.vy * dt;

    if (d.y > 0.44 || d.age > 2.2) {
      d.alpha -= dt * 0.95;
    }

    if (d.alpha > 0.02 && d.y < 0.72) {
      kept.push(d);
    }
  }

  return kept;
}

function stepMoistureBeads(mesh: TissueMeshState, physiology: PhysiologicalState, dt: number): MoistureBead[] {
  const { moisture, arousal } = physiology;
  const beads = mesh.moistureBeads;

  // Target bead count scales smoothly with moisture (0 at dry baseline -> up to 14 cohesive beads in vestibule)
  const desiredCount = moisture > 0.18 ? Math.floor((moisture - 0.15) * 16) : 0;

  // Deterministic pseudo-random helper using nextBeadId so unit tests stay predictable
  if (beads.length < desiredCount && moisture > 0.2) {
    const id = mesh.nextBeadId++;
    // Spawn near Bartholin/periurethral vestibule zone (-0.12 .. +0.16)
    const phase = ((id * 1.6180339) % 1) * 2 - 1;
    const spawnY = -0.10 + ((id * 0.37) % 0.24);
    const spawnX = phase * 0.018 * (0.4 + mesh.cleftOpening);
    beads.push({
      id,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      radius: 0.0055 + moisture * 0.0055,
      volume: 0.3 + moisture * 0.5,
      alpha: 0.1,
    });
  }

  const gravity = 0.14; // downward (+y) in studio view
  const kept: MoistureBead[] = [];

  for (let i = 0; i < beads.length; i++) {
    const b = beads[i];
    // Volume grows gradually with arousal/moisture
    b.volume = clamp01(b.volume + dt * (0.04 + arousal * 0.09) - dt * 0.025);
    b.radius = 0.0048 + b.volume * 0.0068;

    // Surface tension holds small beads in place until volume + moisture overcome adhesion
    const slideThreshold = 0.42 - moisture * 0.22;
    if (b.volume > slideThreshold) {
      const accelY = gravity * (b.volume - slideThreshold) * 1.8;
      b.vy += accelY * dt;
      // Viscous drag along mucosal film
      b.vy *= Math.exp(-dt * 3.8);
      // Slight lateral channeling along medial labia minora fold
      b.vx += (-b.x * 1.2) * dt;
      b.vx *= Math.exp(-dt * 6.0);
    } else {
      b.vy *= Math.exp(-dt * 8.0);
      b.vx *= Math.exp(-dt * 8.0);
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Fade in gently; fade out as bead drains past posterior fourchette
    if (b.y > 0.38 || moisture < 0.12) {
      b.alpha -= dt * 0.85;
    } else {
      const targetAlpha = Math.min(0.85, 0.25 + moisture * 0.65);
      b.alpha += (targetAlpha - b.alpha) * Math.min(1, dt * 3.5);
    }

    if (b.alpha > 0.02 && b.y < 0.52) {
      kept.push(b);
    }
  }

  return kept;
}
