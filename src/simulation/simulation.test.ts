import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialPhysiology, stepPhysiology, computeSurfaceFriction } from './physiology';
import { createInitialTissueMesh, stepTissueMesh, detectAnatomicalZone } from './tissuePhysics';
import {
  createInitialVerticalRod,
  hitTestVerticalRod,
  stepGuidedPosition,
  stepVerticalRod,
} from './tools';
import type { PointerContact } from './types';

function makeContact(overrides: Partial<PointerContact> = {}): PointerContact {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    pressure: 0.35,
    zone: 'none',
    isDirectGlans: false,
    friction: 0.5,
    ...overrides,
  };
}

test('resting anatomy starts with closed cleft and asymmetrical labia minora', () => {
  const mesh = createInitialTissueMesh();
  assert.equal(mesh.cleftOpening, 0);

  // Vestibule walls are coapted near midline (gap < 0.01)
  const midGap = mesh.vestibuleRight[2].restX - mesh.vestibuleLeft[2].restX;
  assert.ok(midGap < 0.01, `expected closed vestibule gap, got ${midGap}`);

  // Left and right labia minora have distinct wave offsets / asymmetry
  const leftWave = Math.abs(mesh.minoraLeft[4].waveOffset);
  const rightWave = Math.abs(mesh.minoraRight[4].waveOffset);
  assert.notEqual(leftWave, rightWave);
});

test('gentle circular indirect prepuce stimulation builds arousal, congestion, and moisture without discomfort', () => {
  let phys = createInitialPhysiology();
  let prevVel = { vx: 0.3, vy: 0 };

  for (let i = 0; i < 180; i++) {
    const theta = i * 0.14;
    const vx = -Math.sin(theta) * 0.38;
    const vy = Math.cos(theta) * 0.38;
    const contact = makeContact({
      active: true,
      x: Math.cos(theta) * 0.03,
      y: -0.39 + Math.sin(theta) * 0.03,
      vx,
      vy,
      pressure: 0.36,
      zone: 'prepuce',
      isDirectGlans: false,
    });
    phys = stepPhysiology(phys, contact, 0.05, prevVel);
    prevVel = { vx, vy };
  }

  assert.ok(phys.arousal > 0.35, `expected arousal > 0.35, got ${phys.arousal}`);
  assert.ok(phys.congestion > 0.2, `expected congestion > 0.2, got ${phys.congestion}`);
  assert.ok(phys.moisture > 0.15, `expected moisture > 0.15, got ${phys.moisture}`);
  assert.ok(phys.discomfort < 0.05, `expected low discomfort, got ${phys.discomfort}`);
});

test('direct continuous hard glans pressure causes saturation, discomfort, and drops arousal', () => {
  let phys = createInitialPhysiology();
  phys = { ...phys, arousal: 0.55, congestion: 0.45, moisture: 0.4 };

  const startArousal = phys.arousal;
  for (let i = 0; i < 120; i++) {
    const contact = makeContact({
      active: true,
      x: 0,
      y: -0.365,
      vx: 0.1,
      vy: 0.05,
      pressure: 0.92,
      zone: 'glans',
      isDirectGlans: true,
    });
    phys = stepPhysiology(phys, contact, 0.05, { vx: 0.1, vy: 0.05 });
  }

  assert.ok(phys.clitoralSaturation > 0.6, `expected high saturation, got ${phys.clitoralSaturation}`);
  assert.ok(phys.discomfort > 0.15, `expected elevated discomfort, got ${phys.discomfort}`);
  assert.ok(phys.arousal < startArousal, `expected arousal to drop under overload (${phys.arousal} vs ${startArousal})`);
});

test('dry high-speed vestibule friction increases discomfort compared to lubricated slow motion', () => {
  const dryFriction = computeSurfaceFriction(0.05, 0.7, 'vestibule');
  const wetFriction = computeSurfaceFriction(0.85, 0.7, 'vestibule');
  assert.ok(dryFriction > wetFriction * 2, `expected dry friction (${dryFriction}) >> wet friction (${wetFriction})`);

  let dryPhys = createInitialPhysiology();
  dryPhys = { ...dryPhys, moisture: 0.06, vestibuleRelaxation: 0.12 };
  for (let i = 0; i < 60; i++) {
    dryPhys = stepPhysiology(
      dryPhys,
      makeContact({
        active: true,
        x: 0,
        y: 0.1,
        vx: 0,
        vy: 1.5,
        pressure: 0.85,
        zone: 'vestibule',
      }),
      0.05,
      { vx: 0, vy: 1.5 },
    );
  }
  assert.ok(dryPhys.discomfort > 0.25, `expected discomfort from dry fast rubbing, got ${dryPhys.discomfort}`);
});

test('hood retracts at mild arousal and glans recedes slightly under high congestion', () => {
  const physMild = { ...createInitialPhysiology(), arousal: 0.45, congestion: 0.35 };
  let meshMild = createInitialTissueMesh();
  for (let i = 0; i < 60; i++) {
    meshMild = stepTissueMesh(meshMild, physMild, makeContact(), 0.03);
  }
  assert.ok(meshMild.hoodRetraction > 0.25, `expected hood retraction at mild arousal, got ${meshMild.hoodRetraction}`);
  assert.equal(meshMild.glansRecession, 0);

  const physHigh = { ...createInitialPhysiology(), arousal: 0.9, congestion: 0.92 };
  let meshHigh = createInitialTissueMesh();
  for (let i = 0; i < 90; i++) {
    meshHigh = stepTissueMesh(meshHigh, physHigh, makeContact(), 0.03);
  }
  assert.ok(meshHigh.glansRecession > 0.4, `expected glans recession at high congestion, got ${meshHigh.glansRecession}`);
});

test('dragging left labium majus deforms left side asymmetrically and snaps back when released', () => {
  const phys = createInitialPhysiology();
  let mesh = createInitialTissueMesh();
  const restLeftX = mesh.majoraLeft[3].restX;
  const restRightX = mesh.majoraRight[3].restX;

  // Drag left labium outward (-x)
  for (let i = 0; i < 25; i++) {
    const contact = makeContact({
      active: true,
      x: -0.05 - i * 0.004,
      y: 0.08,
      vx: -0.35,
      vy: 0,
      pressure: 0.55,
      zone: 'labia_major_left',
    });
    mesh = stepTissueMesh(mesh, phys, contact, 0.02);
  }

  const leftDisp = Math.abs(mesh.majoraLeft[3].x - restLeftX);
  const rightDisp = Math.abs(mesh.majoraRight[3].x - restRightX);
  assert.ok(leftDisp > 0.02, `expected left labium displacement > 0.02, got ${leftDisp}`);
  assert.ok(leftDisp > rightDisp * 3, `expected asymmetrical deformation (left=${leftDisp}, right=${rightDisp})`);

  // Release and allow spring-damper return
  for (let i = 0; i < 100; i++) {
    mesh = stepTissueMesh(mesh, phys, makeContact({ active: false }), 0.02);
  }
  const settledDisp = Math.abs(mesh.majoraLeft[3].x - restLeftX);
  assert.ok(settledDisp < 0.005, `expected elastic return near rest, got ${settledDisp}`);
});

test('moisture beads spawn at elevated lubrication and move downward under gravity', () => {
  const phys = { ...createInitialPhysiology(), arousal: 0.78, congestion: 0.7, moisture: 0.85 };
  let mesh = createInitialTissueMesh();

  for (let i = 0; i < 40; i++) {
    mesh = stepTissueMesh(mesh, phys, makeContact(), 0.03);
  }

  assert.ok(mesh.moistureBeads.length >= 3, `expected moisture beads to form, got ${mesh.moistureBeads.length}`);
  const firstBeadStartY = mesh.moistureBeads[0].y;

  for (let i = 0; i < 60; i++) {
    mesh = stepTissueMesh(mesh, phys, makeContact(), 0.03);
  }
  const tracked = mesh.moistureBeads.find((b) => b.id === 1);
  if (tracked) {
    assert.ok(tracked.y > firstBeadStartY, `expected bead to slide downward (+y): ${tracked.y} > ${firstBeadStartY}`);
  }
});

test('urethral meatus is distinct above vestibule when labia are parted', () => {
  const mesh = createInitialTissueMesh();
  mesh.cleftOpening = 0.5;
  const urethraHit = detectAnatomicalZone(0.004, -0.145, mesh);
  assert.equal(urethraHit.zone, 'urethra');
});

test('tactile stimulation builds vasocongestion that swells and parts cleft while discomfort contracts tissue', () => {
  let phys = createInitialPhysiology();
  let mesh = createInitialTissueMesh();
  let prevVel = { vx: 0.3, vy: 0 };

  // Gentle circular tactile stimulation builds arousal & congestion
  for (let i = 0; i < 160; i++) {
    const theta = i * 0.15;
    const vx = -Math.sin(theta) * 0.36;
    const vy = Math.cos(theta) * 0.36;
    const contact = makeContact({
      active: true,
      x: Math.cos(theta) * 0.025,
      y: -0.38 + Math.sin(theta) * 0.025,
      vx,
      vy,
      pressure: 0.35,
      zone: 'prepuce',
      isDirectGlans: false,
    });
    phys = stepPhysiology(phys, contact, 0.05, prevVel);
    mesh = stepTissueMesh(mesh, phys, contact, 0.03);
    prevVel = { vx, vy };
  }

  // Release contact and allow spring-damper equilibrium to reflect physiological swelling/opening
  for (let i = 0; i < 40; i++) {
    mesh = stepTissueMesh(mesh, phys, makeContact({ active: false }), 0.03);
  }

  assert.ok(mesh.cleftOpening > 0.1, `expected cleft parting from tactile vasocongestion, got ${mesh.cleftOpening}`);
  const arousedVestibuleGap = mesh.vestibuleRight[2].x - mesh.vestibuleLeft[2].x;
  const restVestibuleGap = mesh.vestibuleRight[2].restX - mesh.vestibuleLeft[2].restX;
  assert.ok(
    arousedVestibuleGap > restVestibuleGap,
    `expected vestibule relaxation opening (${arousedVestibuleGap}) > rest (${restVestibuleGap})`,
  );

  // Discomfort contracts tissue opening back down
  const discomfortPhys = { ...phys, discomfort: 0.85, vestibuleRelaxation: 0.1 };
  for (let i = 0; i < 50; i++) {
    mesh = stepTissueMesh(mesh, discomfortPhys, makeContact({ active: false }), 0.03);
  }
  const tenseVestibuleGap = mesh.vestibuleRight[2].x - mesh.vestibuleLeft[2].x;
  assert.ok(
    tenseVestibuleGap < arousedVestibuleGap,
    `expected discomfort contraction (${tenseVestibuleGap}) < aroused (${arousedVestibuleGap})`,
  );
});

test('completing arousal meter triggers Skene gland release and periurethral emission droplets', () => {
  let phys = createInitialPhysiology();
  let mesh = createInitialTissueMesh();
  let prevVel = { vx: 0.35, vy: 0 };
  let sawPeakActive = false;
  let maxDroplets = 0;

  // Sustained gentle circular stimulation until meter reaches completion
  for (let i = 0; i < 420; i++) {
    const theta = i * 0.16;
    const vx = -Math.sin(theta) * 0.38;
    const vy = Math.cos(theta) * 0.38;
    const contact = makeContact({
      active: true,
      x: Math.cos(theta) * 0.025,
      y: -0.38 + Math.sin(theta) * 0.025,
      vx,
      vy,
      pressure: 0.36,
      zone: 'prepuce',
      isDirectGlans: false,
    });
    phys = stepPhysiology(phys, contact, 0.05, prevVel);
    mesh = stepTissueMesh(mesh, phys, contact, 0.03);
    prevVel = { vx, vy };
    if (phys.peakReleaseTimer > 0) {
      sawPeakActive = true;
    }
    if (mesh.emissionDroplets.length > maxDroplets) {
      maxDroplets = mesh.emissionDroplets.length;
    }
  }

  assert.equal(sawPeakActive, true, 'expected peakReleaseTimer to activate upon arousal meter completion');
  assert.ok(phys.emissionCount >= 1, `expected emissionCount >= 1, got ${phys.emissionCount}`);
  assert.ok(maxDroplets >= 4, `expected Skene gland emission droplets >= 4, got ${maxDroplets}`);
  assert.ok(phys.moisture > 0.65, `expected elevated moisture after Skene release, got ${phys.moisture}`);
});

test('introitus swells with arousal and vasocongestion and recedes under discomfort', () => {
  const restMesh = createInitialTissueMesh();
  assert.equal(restMesh.introitusSwelling, 0);

  const highPhys = {
    ...createInitialPhysiology(),
    arousal: 0.82,
    congestion: 0.78,
    vestibuleRelaxation: 0.75,
    discomfort: 0,
  };
  let arousedMesh = createInitialTissueMesh();
  for (let i = 0; i < 60; i++) {
    arousedMesh = stepTissueMesh(arousedMesh, highPhys, makeContact(), 0.03);
  }

  const arousedSwelling = arousedMesh.introitusSwelling;
  assert.ok(
    arousedSwelling > 0.55,
    `expected introitusSwelling > 0.55 at high arousal, got ${arousedSwelling}`,
  );
  const arousedGap = arousedMesh.vestibuleRight[2].x - arousedMesh.vestibuleLeft[2].x;
  const restGap = restMesh.vestibuleRight[2].restX - restMesh.vestibuleLeft[2].restX;
  assert.ok(arousedGap > restGap, `expected introital opening (${arousedGap}) > rest (${restGap})`);

  const discomfortPhys = { ...highPhys, discomfort: 0.85, vestibuleRelaxation: 0.1 };
  let tenseMesh = arousedMesh;
  for (let i = 0; i < 50; i++) {
    tenseMesh = stepTissueMesh(tenseMesh, discomfortPhys, makeContact(), 0.03);
  }
  assert.ok(
    tenseMesh.introitusSwelling < arousedSwelling,
    `expected discomfort to reduce introitusSwelling (${tenseMesh.introitusSwelling} < ${arousedSwelling})`,
  );
});

test('caressing arousal sensitivity increases with proximity to vestibule and clitoris and produces rhythmic contractions', () => {
  const runGentleCaress = (x: number, y: number, zone: PointerContact['zone']) => {
    let phys = createInitialPhysiology();
    let prevVel = { vx: 0.28, vy: 0 };
    for (let i = 0; i < 60; i++) {
      const a = i * 0.16;
      const vx = -Math.sin(a) * 0.28;
      const vy = Math.cos(a) * 0.28;
      phys = stepPhysiology(
        phys,
        makeContact({
          active: true,
          x: x + Math.cos(a) * 0.015,
          y: y + Math.sin(a) * 0.015,
          vx,
          vy,
          pressure: 0.34,
          zone,
        }),
        0.05,
        prevVel,
      );
      prevVel = { vx, vy };
    }
    return phys.arousal;
  };

  const outerArousal = runGentleCaress(-0.28, -0.58, 'mons');
  const midArousal = runGentleCaress(0, 0.08, 'vestibule');
  const clitoralArousal = runGentleCaress(0, -0.38, 'prepuce');

  assert.ok(outerArousal > 0.03, `expected gentle outer mons touch to build mild arousal, got ${outerArousal}`);
  assert.ok(
    midArousal > outerArousal,
    `expected vestibule arousal (${midArousal}) > outer mons (${outerArousal})`,
  );
  assert.ok(
    clitoralArousal > midArousal,
    `expected clitoral prepuce arousal (${clitoralArousal}) > vestibule (${midArousal})`,
  );

  // Verify rhythmic contraction oscillation of glans Y during active peak release
  let mesh = createInitialTissueMesh();
  let minGlansY = Infinity;
  let maxGlansY = -Infinity;
  for (let i = 0; i < 60; i++) {
    const peakPhys = {
      ...createInitialPhysiology(),
      arousal: 1.0,
      congestion: 0.85,
      moisture: 0.8,
      vestibuleRelaxation: 0.8,
      peakReleaseTimer: Math.max(0.2, 2.8 - i * 0.04),
      pulsePhase: i * 0.25,
    };
    mesh = stepTissueMesh(mesh, peakPhys, makeContact(), 0.04);
    if (i > 10) {
      minGlansY = Math.min(minGlansY, mesh.glans.y);
      maxGlansY = Math.max(maxGlansY, mesh.glans.y);
    }
  }
  assert.ok(
    maxGlansY - minGlansY > 0.004,
    `expected rhythmic peak contractions on glans Y (${maxGlansY - minGlansY})`,
  );
});

test('touching and rubbing outer pelvic skin and labia majora measurably raises arousal and congestion', () => {
  // 1. Stationary touch & hold on labia majora skin (moderate pressure)
  let heldMajora = createInitialPhysiology();
  for (let i = 0; i < 80; i++) {
    heldMajora = stepPhysiology(
      heldMajora,
      makeContact({
        active: true,
        x: -0.16,
        y: 0.05,
        vx: 0,
        vy: 0,
        pressure: 0.48,
        zone: 'labia_major_left',
      }),
      0.05,
      { vx: 0, vy: 0 },
    );
  }
  assert.ok(heldMajora.arousal > 0.18, `expected stationary skin touch on majora to raise arousal > 0.18, got ${heldMajora.arousal}`);
  assert.ok(heldMajora.congestion > 0.12, `expected congestion > 0.12, got ${heldMajora.congestion}`);
  assert.ok(heldMajora.discomfort < 0.05, `expected negligible discomfort, got ${heldMajora.discomfort}`);

  // 2. Natural-speed rubbing across outer pelvic skin (zone: 'none', speed ~ 1.1 norm/s)
  let outerSkin = createInitialPhysiology();
  let prevVel = { vx: 1.1, vy: 0 };
  for (let i = 0; i < 80; i++) {
    const theta = i * 0.25;
    const vx = -Math.sin(theta) * 1.1;
    const vy = Math.cos(theta) * 1.1;
    outerSkin = stepPhysiology(
      outerSkin,
      makeContact({
        active: true,
        x: 0.44 + Math.cos(theta) * 0.05,
        y: 0.08 + Math.sin(theta) * 0.05,
        vx,
        vy,
        pressure: 0.28,
        zone: 'none',
      }),
      0.05,
      prevVel,
    );
    prevVel = { vx, vy };
  }
  assert.ok(outerSkin.arousal > 0.12, `expected outer skin rubbing to raise arousal > 0.12, got ${outerSkin.arousal}`);
  assert.ok(heldMajora.arousal > outerSkin.arousal, `expected labia majora (${heldMajora.arousal}) > outer skin (${outerSkin.arousal})`);
});

test('external swelling rises with arousal, surges during peak release, and recedes gradually afterward', () => {
  const restMesh = createInitialTissueMesh();
  assert.equal(restMesh.externalSwelling, 0);

  let mesh = createInitialTissueMesh();
  const arousedPhys = {
    ...createInitialPhysiology(),
    arousal: 0.72,
    congestion: 0.68,
    vestibuleRelaxation: 0.7,
    peakReleaseTimer: 0,
  };
  for (let i = 0; i < 60; i++) {
    mesh = stepTissueMesh(mesh, arousedPhys, makeContact(), 0.03);
  }
  const arousedExternal = mesh.externalSwelling;
  assert.ok(arousedExternal > 0.55, `expected externalSwelling > 0.55 at high arousal, got ${arousedExternal}`);

  // Active peak release surges external swelling even higher
  const peakPhys = {
    ...arousedPhys,
    arousal: 1.0,
    congestion: 0.92,
    peakReleaseTimer: 3.1,
  };
  for (let i = 0; i < 20; i++) {
    mesh = stepTissueMesh(mesh, peakPhys, makeContact(), 0.03);
  }
  const peakExternal = mesh.externalSwelling;
  assert.ok(
    peakExternal > arousedExternal,
    `expected externalSwelling during release (${peakExternal}) > pre-release (${arousedExternal})`,
  );

  // Post-release detumescence lowers external swelling gradually
  const resolvedPhys = {
    ...createInitialPhysiology(),
    arousal: 0.35,
    congestion: 0.30,
    peakReleaseTimer: 0,
  };
  for (let i = 0; i < 80; i++) {
    mesh = stepTissueMesh(mesh, resolvedPhys, makeContact(), 0.03);
  }
  assert.ok(
    mesh.externalSwelling < arousedExternal,
    `expected post-release externalSwelling (${mesh.externalSwelling}) < pre-release (${arousedExternal})`,
  );
});

test('selectable tactile tools produce distinct physiological responses and directional steering clamps to bounds', () => {
  // 1. Directional steering moves and clamps cleanly
  const moved = stepGuidedPosition({ x: 0, y: 0 }, { left: false, right: true, up: true, down: false }, 0.25, 0.52);
  assert.equal(moved.moving, true);
  assert.ok(moved.x > 0 && moved.y < 0);
  const clamped = stepGuidedPosition({ x: 0.74, y: -0.77 }, { left: false, right: true, up: true, down: false }, 0.5, 0.52);
  assert.equal(clamped.x, 0.75);
  assert.equal(clamped.y, -0.78);

  // 2. Warm palm boosts vasocongestion & vestibular relaxation more than default finger on outer majora
  const runTool = (tool: PointerContact['tool']) => {
    let phys = createInitialPhysiology();
    for (let i = 0; i < 70; i++) {
      phys = stepPhysiology(
        phys,
        makeContact({
          active: true,
          x: -0.14,
          y: 0.06,
          vx: 0.25,
          vy: 0.1,
          pressure: 0.45,
          zone: 'labia_major_left',
          tool,
        }),
        0.05,
        { vx: 0.25, vy: 0.1 },
      );
    }
    return phys;
  };

  const fingerPhys = runTool('finger');
  const palmPhys = runTool('palm');
  const brushPhys = runTool('brush');
  assert.ok(palmPhys.congestion > fingerPhys.congestion, `expected warm palm congestion (${palmPhys.congestion}) > finger (${fingerPhys.congestion})`);
  assert.ok(palmPhys.vestibuleRelaxation > fingerPhys.vestibuleRelaxation, `expected warm palm relaxation (${palmPhys.vestibuleRelaxation}) > finger (${fingerPhys.vestibuleRelaxation})`);
  assert.ok(brushPhys.arousal > 0.15, `expected soft brush sweep arousal > 0.15, got ${brushPhys.arousal}`);

  // 3. Soft brush causes far less dry fast mucosal discomfort than tactile probe
  const runDryFast = (tool: PointerContact['tool']) => {
    let phys = { ...createInitialPhysiology(), moisture: 0.06, vestibuleRelaxation: 0.15 };
    for (let i = 0; i < 45; i++) {
      phys = stepPhysiology(
        phys,
        makeContact({
          active: true,
          x: 0,
          y: 0.12,
          vx: 0,
          vy: 1.4,
          pressure: 0.8,
          zone: 'vestibule',
          tool,
        }),
        0.05,
        { vx: 0, vy: 1.4 },
      );
    }
    return phys.discomfort;
  };
  assert.ok(runDryFast('brush') < runDryFast('probe') * 0.45, 'expected brush discomfort << probe discomfort on dry fast vestibule pass');
});

test('vertical elongated rod can be hit-tested, grasped with offset, steered, tilted, and deforms tissue along vertical span', () => {
  const rod = createInitialVerticalRod();
  assert.equal(rod.angle, 0);
  assert.equal(rod.held, false);
  assert.ok(rod.halfLength > rod.radius * 4, 'rod should be clearly elongated vertically');

  // 1. Capsule hit-testing along vertical shaft
  assert.equal(hitTestVerticalRod(rod.x, rod.y, rod), true);
  assert.equal(hitTestVerticalRod(rod.x, rod.y - rod.halfLength + 0.02, rod), true);
  assert.equal(hitTestVerticalRod(rod.x, rod.y + rod.halfLength - 0.02, rod), true);
  assert.equal(hitTestVerticalRod(rod.x + 0.25, rod.y, rod), false);

  // 2. Grasping with anchor offset preserves relative hold point during drag
  const heldRod = {
    ...rod,
    held: true,
    grabOffsetX: 0.01,
    grabOffsetY: 0.08,
  };
  const dragged = stepVerticalRod(heldRod, {
    dt: 0.02,
    pointerPos: { x: 0.01, y: 0.12 },
  });
  assert.ok(Math.abs(dragged.x - 0) < 1e-6);
  assert.ok(Math.abs(dragged.y - 0.04) < 1e-6);
  assert.ok(dragged.vx < 0, 'dragging left from 0.42 to 0 should yield negative vx');

  // 3. Directional steering & tilt clamping
  let steered = { ...rod };
  for (let i = 0; i < 40; i++) {
    steered = stepVerticalRod(steered, {
      dt: 0.03,
      directional: { left: true, right: false, up: true, down: false },
      tiltInput: 1,
    });
  }
  assert.ok(steered.x < rod.x - 0.2, 'directional left should steer rod toward midline');
  assert.ok(steered.y < rod.y - 0.2, 'directional up should steer rod superiorly');
  assert.ok(steered.steerAngle > 0.2 && steered.steerAngle <= 0.48, `expected clamped tilt, got ${steered.steerAngle}`);

  // 4. Elongated vertical contact at midline cleft parts multiple vertical majora nodes symmetrically
  let mesh = createInitialTissueMesh();
  const phys = createInitialPhysiology();
  for (let i = 0; i < 20; i++) {
    mesh = stepTissueMesh(
      mesh,
      phys,
      makeContact({
        active: true,
        x: 0,
        y: 0.06,
        vx: 0,
        vy: 0.15,
        pressure: 0.55,
        zone: 'vestibule',
        tool: 'rod',
      }),
      0.02,
    );
  }
  const upperGap = mesh.majoraRight[2].x - mesh.majoraLeft[2].x;
  const lowerGap = mesh.majoraRight[4].x - mesh.majoraLeft[4].x;
  const restUpperGap = mesh.majoraRight[2].restX - mesh.majoraLeft[2].restX;
  const restLowerGap = mesh.majoraRight[4].restX - mesh.majoraLeft[4].restX;
  assert.ok(upperGap > restUpperGap + 0.02, 'expected vertical rod to part upper cleft nodes');
  assert.ok(lowerGap > restLowerGap + 0.015, 'expected vertical rod to part lower cleft nodes');
});
