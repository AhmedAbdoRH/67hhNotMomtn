import { getToolProfile } from './tools';
import type { PhysiologicalState, PointerContact } from './types';

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function createInitialPhysiology(): PhysiologicalState {
  return {
    congestion: 0.04,
    moisture: 0.06,
    arousal: 0.02,
    discomfort: 0,
    clitoralSaturation: 0,
    vestibuleRelaxation: 0.12,
    pauseDuration: 0,
    circularity: 0,
    rhythmQuality: 0,
    breathPhase: 0,
    breathRateBpm: 13.5,
    pulsePhase: 0,
    elapsedTime: 0,
    peakProgress: 0.02,
    peakReleaseTimer: 0,
    emissionCount: 0,
  };
}

/**
 * Computes effective friction coefficient based on current moisture and contact pressure.
 * Dry tissue + heavy pressure = high resistance/drag; lubricated tissue = smooth glide.
 */
export function computeSurfaceFriction(moisture: number, pressure: number, zone: PointerContact['zone']): number {
  const zoneLubricationBonus =
    zone === 'vestibule' || zone === 'urethra' || zone === 'labia_minor_left' || zone === 'labia_minor_right'
      ? 1.0
      : zone === 'prepuce' || zone === 'glans'
        ? 0.88
        : 0.35; // outer skin (majora, mons, perineum) stays drier

  const effectiveMoisture = clamp01(moisture * zoneLubricationBonus);
  const baseDryFriction = 0.85;
  const wetMinFriction = 0.09;
  const friction = baseDryFriction - (baseDryFriction - wetMinFriction) * Math.pow(effectiveMoisture, 0.78);
  return clamp01(friction * (0.65 + 0.5 * pressure));
}

export interface MotionAnalysis {
  speed: number;
  prevVx: number;
  prevVy: number;
}

/**
 * Steps the 4 independent physiological channels:
 * 1. Arousal / Pleasure (non-linear: rewards gentle circular indirect prepuce touch, rhythm, pauses)
 * 2. Congestion / Vasocongestion (vascular lag: pools slowly, lingers after touch stops)
 * 3. Moisture / Lubrication (transudation tied to arousal + time)
 * 4. Discomfort / Sensory Overload (dry fast friction, direct hard glans pressure, unrelaxed force)
 */
export function stepPhysiology(
  prev: PhysiologicalState,
  contact: PointerContact,
  dt: number,
  prevVelocity: { vx: number; vy: number } = { vx: 0, vy: 0 },
): PhysiologicalState {
  const safeDt = Math.min(Math.max(dt, 0), 0.1);
  if (safeDt === 0) return prev;

  const toolProfile = getToolProfile(contact.tool);
  const speed = contact.active ? Math.hypot(contact.vx, contact.vy) : 0;
  const pressure = contact.active ? clamp01(contact.pressure * toolProfile.pressureScale) : 0;

  // Measure curvature / circularity via normalized cross-product between previous and current velocity
  let instantCircularity = 0;
  const prevSpeed = Math.hypot(prevVelocity.vx, prevVelocity.vy);
  if (contact.active && speed > 0.04 && prevSpeed > 0.04) {
    const cross = Math.abs(prevVelocity.vx * contact.vy - prevVelocity.vy * contact.vx);
    const sinTheta = cross / (speed * prevSpeed);
    // Gentle curved trajectories (sinTheta ~ 0.15..0.85) score highest without penalizing smooth arcs
    instantCircularity = clamp01(sinTheta * 1.45);
  }

  const circularity = contact.active
    ? prev.circularity + (instantCircularity - prev.circularity) * Math.min(1, safeDt * 3.2)
    : prev.circularity * Math.exp(-safeDt * 1.4);

  // Track pauses vs active motion
  const isMoving = contact.active && speed > 0.03;
  const pauseDuration = isMoving ? 0 : prev.pauseDuration + safeDt;

  // Rhythm quality rewards moderate speeds (0.12..0.85 norm units/s) and brief pauses (0.4..2.5s)
  const idealSpeedFactor = isMoving
    ? Math.exp(-Math.pow((speed - 0.42) / 0.55, 2))
    : prev.pauseDuration < 2.5 && prev.arousal > 0.15
      ? 0.55
      : 0;
  const rhythmQuality = prev.rhythmQuality + (idealSpeedFactor - prev.rhythmQuality) * Math.min(1, safeDt * 2.0);

  // Friction calculation
  const friction = contact.active
    ? computeSurfaceFriction(prev.moisture, pressure, contact.zone)
    : 0;

  // --- Channel 4: Discomfort & Clitoral Saturation ---
  let clitoralSaturation = prev.clitoralSaturation;
  let discomfortGain = 0;
  let discomfortDecay = 0.14;

  if (contact.active) {
    // 1) Direct glans stimulation without hood shielding + heavy/continuous pressure
    if (contact.isDirectGlans || contact.zone === 'glans') {
      const excessPressure = Math.max(0, pressure - 0.34) / 0.66;
      const pressureLoad = Math.max(0.06, Math.pow(excessPressure, 1.35));
      const staticPenalty = speed < 0.08 && pressure > 0.45 ? 0.18 : 0;
      const directIntensity = (contact.isDirectGlans ? 1.0 : 0.45) * pressureLoad;
      // Gentle circular touch stays below sensory overload; firm/static direct pressure saturates quickly
      clitoralSaturation = clamp01(
        clitoralSaturation + safeDt * (0.28 * directIntensity + staticPenalty - (pressure <= 0.4 ? 0.04 : 0)),
      );
      if (clitoralSaturation > 0.52) {
        // Sensory threshold breached: discomfort escalates steeply and arousal drops
        discomfortGain += (clitoralSaturation - 0.52) * 1.25 * (0.45 + pressure);
      }
    } else {
      // Indirect or off-glans touch allows clitoral saturation to recover slowly
      clitoralSaturation = clamp01(clitoralSaturation - safeDt * 0.16);
    }

    // 2) Dry friction penalty on sensitive mucosal surfaces (vestibule, minora, urethra)
    const isSensitiveMucosa =
      contact.zone === 'vestibule' ||
      contact.zone === 'urethra' ||
      contact.zone === 'labia_minor_left' ||
      contact.zone === 'labia_minor_right' ||
      contact.zone === 'fourchette';

    if (isSensitiveMucosa) {
      const dryness = 1 - prev.moisture;
      if (dryness > 0.35 && speed > 0.45) {
        discomfortGain += (dryness - 0.35) * (speed - 0.4) * (0.65 + 0.9 * pressure) * 0.55;
      }
    }

    // 3) Unrelaxed vestibular force penalty
    if (contact.zone === 'vestibule' || contact.zone === 'urethra') {
      const resistance = 1 - prev.vestibuleRelaxation;
      if (pressure > 0.55 && resistance > 0.35) {
        discomfortGain += (pressure - 0.5) * (resistance - 0.3) * 0.65;
      }
      if (contact.zone === 'urethra' && pressure > 0.45) {
        // Urethral meatus is delicate to firm direct pressure
        discomfortGain += (pressure - 0.45) * 0.38;
      }
    }

    if (discomfortGain > 0.01) {
      discomfortDecay = 0.02;
    } else if (pressure < 0.45 && speed < 0.5) {
      // Gentle soothing touch lets discomfort subside faster
      discomfortDecay = 0.16;
    }
  } else {
    // Releasing contact recovers saturation and discomfort
    clitoralSaturation = clamp01(clitoralSaturation - safeDt * 0.24);
    discomfortDecay = 0.22;
  }

  const scaledDiscomfortGain = discomfortGain * toolProfile.discomfortScale;
  const discomfort = clamp01(prev.discomfort + (scaledDiscomfortGain - prev.discomfort * discomfortDecay) * safeDt * 1.4);

  // --- Vestibular Muscular Relaxation & Anatomical Proximity Fields ---
  const clitoralProximity = contact.active
    ? Math.exp(-(Math.pow((contact.x - 0.001) / 0.24, 2) + Math.pow((contact.y - -0.368) / 0.26, 2)))
    : 0;
  const vulvarProximity = contact.active
    ? Math.exp(-(Math.pow(contact.x / 0.28, 2) + Math.pow((contact.y - 0.04) / 0.44, 2)))
    : 0;
  const pelvicSkinProximity = contact.active
    ? Math.exp(-(Math.pow(contact.x / 0.78, 2) + Math.pow((contact.y + 0.04) / 0.88, 2)))
    : 0;
  const anatomicalProximity = Math.max(clitoralProximity, vulvarProximity * 0.92, pelvicSkinProximity * 0.42);

  let relaxationDelta = 0;
  if (contact.active) {
    const gentleTouch = pressure <= 0.62 && speed <= 1.25 && discomfort < 0.25;
    if (gentleTouch && (anatomicalProximity > 0.14 || contact.zone !== 'none')) {
      relaxationDelta =
        ((0.14 + 0.09 * anatomicalProximity) * (0.45 + 0.55 * prev.arousal) +
          Math.max(0, toolProfile.relaxationBonus) * 0.22) *
        (toolProfile.relaxationBonus < 0 ? 0.92 : 1.0);
    } else if (discomfort > 0.3) {
      relaxationDelta = -0.28 * discomfort;
    }
  } else {
    // Slowly returns toward resting baseline (0.12 + arousal bonus)
    const targetRest = 0.12 + 0.45 * prev.arousal;
    relaxationDelta = (targetRest - prev.vestibuleRelaxation) * 0.15;
  }
  const vestibuleRelaxation = clamp01(prev.vestibuleRelaxation + relaxationDelta * safeDt);

  // --- Channel 3: Arousal / Pleasure (non-linear & proximity-graded caress response) ---
  let arousalGain = 0;
  let arousalDrop = 0;

  if (contact.active) {
    const isDirectGlansZone = contact.isDirectGlans || contact.zone === 'glans';
    // Optimal caress pressure curve: sensitive glans peaks at gentle touch; outer skin/cushions remain responsive to moderate/firm touch
    const pressureBell = isDirectGlansZone
      ? Math.exp(-Math.pow((pressure - 0.34) / 0.34, 2))
      : 0.42 + 0.58 * Math.exp(-Math.pow((pressure - 0.44) / 0.52, 2));

    // Responsive across slow, stationary, and typical mouse/touch caressing speeds (0..1.8 norm/s)
    const stationaryCaress = pressure <= 0.68 ? 0.66 : 0.45;
    const speedBell = isMoving
      ? 0.28 + 0.72 * Math.exp(-Math.pow((speed - 0.48) / 0.95, 2))
      : stationaryCaress;

    // Moisture multiplier: smooth sliding boosts sensory pleasure
    const glideFactor = 0.54 + 0.46 * (1 - Math.min(1, friction * 0.8));
    // Continuous innervation gradient: grows progressively stronger approaching vulvar cleft & clitoris
    const proximityMultiplier = 0.58 + 0.95 * anatomicalProximity + 0.35 * clitoralProximity;

    // Pause anticipation bonus: brief pause (< 3s) after building arousal gives gentle lingering resonance
    const pauseBonus = !isMoving && prev.pauseDuration > 0.2 && prev.pauseDuration < 3.0 && prev.arousal > 0.15 ? 0.045 : 0;

    if (contact.zone === 'prepuce') {
      // Indirect stimulation via prepuce builds arousal smoothly, especially with circular strokes
      const circularBoost = 0.92 + 0.68 * circularity;
      arousalGain = 0.17 * pressureBell * speedBell * circularBoost * glideFactor * (0.82 + 0.35 * clitoralProximity);
    } else if (contact.zone === 'glans') {
      // Direct glans touch builds fast initially, then drops sharply once saturated under heavy pressure
      if (clitoralSaturation < 0.52) {
        const earlySensitivity = 1 - clitoralSaturation * 1.1;
        arousalGain = 0.18 * Math.max(0, earlySensitivity) * pressureBell * (0.76 + 0.42 * circularity);
      } else {
        // Overstimulated numbness/discomfort causes arousal to drop unless released
        arousalDrop += (clitoralSaturation - 0.48) * 0.32;
      }
    } else if (contact.zone === 'labia_minor_left' || contact.zone === 'labia_minor_right') {
      arousalGain = 0.125 * pressureBell * speedBell * glideFactor * (0.88 + 0.36 * rhythmQuality) * (0.78 + 0.42 * anatomicalProximity);
    } else if (contact.zone === 'vestibule' || contact.zone === 'fourchette') {
      const relaxFactor = 0.52 + 0.48 * vestibuleRelaxation;
      arousalGain = 0.135 * pressureBell * speedBell * glideFactor * relaxFactor * (0.78 + 0.38 * vulvarProximity);
    } else if (contact.zone === 'labia_major_left' || contact.zone === 'labia_major_right' || contact.zone === 'mons') {
      arousalGain = 0.088 * pressureBell * speedBell * (0.85 + 0.32 * circularity) * proximityMultiplier;
    } else if (contact.zone === 'perineum' || pelvicSkinProximity > 0.08) {
      // Outer pelvic, perineal, and medial thigh skin caressing builds arousal clearly and intensifies toward the center
      arousalGain = 0.068 * pressureBell * speedBell * (0.85 + 0.28 * circularity) * proximityMultiplier;
    }

    arousalGain = arousalGain * toolProfile.arousalMultiplier + pauseBonus;
  } else {
    // Without touch, arousal holds briefly during a short pause, then decays gradually
    const decayRate = prev.pauseDuration < 2.0 ? 0.012 : 0.038;
    arousalDrop = prev.arousal * decayRate;
  }

  // Discomfort directly suppresses arousal
  if (discomfort > 0.18) {
    arousalDrop += discomfort * 0.26;
  }

  // Peak Skene's gland release cycle handling
  let peakReleaseTimer = prev.peakReleaseTimer;
  let emissionCount = prev.emissionCount;
  const wasPeakActive = peakReleaseTimer > 0;

  // Natural non-linear plateau & smooth approach toward peak threshold
  const headroom = 1 - Math.pow(prev.arousal, 2.8) * 0.35;
  let arousal = clamp01(prev.arousal + (arousalGain * headroom - arousalDrop) * safeDt);

  // Trigger Skene's gland / periurethral emission when arousal meter completes (>= 0.94)
  if (!wasPeakActive && arousal >= 0.94 && discomfort < 0.35) {
    peakReleaseTimer = 3.8;
    emissionCount += 1;
    arousal = 1.0;
  } else if (wasPeakActive) {
    peakReleaseTimer = Math.max(0, peakReleaseTimer - safeDt);
    // Sustain peak plateau during rhythmic release pulses, then gently resolve to ~0.58
    if (peakReleaseTimer > 1.5) {
      arousal = Math.max(arousal, 0.96);
    } else if (peakReleaseTimer === 0) {
      arousal = Math.min(arousal, 0.58);
    } else {
      arousal = clamp01(arousal - safeDt * 0.28);
    }
  }

  const peakProgress = peakReleaseTimer > 0 ? 1.0 : clamp01(arousal / 0.94);

  // --- Channel 1: Congestion (Vasocongestion) ---
  // Blood pooling lags behind arousal on rise, surges during peak release, and accelerates with warm tools
  const warmthCongestionBoost = contact.active ? toolProfile.congestionWarmthBoost * 0.22 : 0;
  const peakCongestionSurge = peakReleaseTimer > 1.0 ? 0.14 * clamp01((peakReleaseTimer - 1.0) / 2.8) : 0;
  const congestionTarget = clamp01(
    0.04 + arousal * 0.92 + peakCongestionSurge + warmthCongestionBoost - discomfort * 0.18,
  );
  const congestionRate =
    congestionTarget > prev.congestion
      ? (peakReleaseTimer > 0 ? 0.42 : 0.26 + (contact.active ? toolProfile.congestionWarmthBoost * 0.28 : 0))
      : 0.068;
  const congestion = clamp01(prev.congestion + (congestionTarget - prev.congestion) * congestionRate * safeDt * 2.2);

  // --- Channel 2: Moisture (Lubrication) ---
  // Transudation increases with arousal + congestion over time, spiking during Skene's gland release
  const peakMoistureBoost = peakReleaseTimer > 0 ? 0.28 : 0;
  const secretionTarget = clamp01(0.06 + Math.pow(arousal, 0.82) * 0.62 + congestion * 0.34 + peakMoistureBoost);
  const moistureRate = secretionTarget > prev.moisture ? (peakReleaseTimer > 0 ? 0.42 : 0.105) : 0.022;
  const moisture = clamp01(prev.moisture + (secretionTarget - prev.moisture) * moistureRate * safeDt * 2.0);

  // --- Respiratory & Vascular Micro-Pulse Coupling ---
  const targetBreathBpm = 13.5 + arousal * 11.5 + discomfort * 4.5 + (peakReleaseTimer > 0 ? 3.5 : 0);
  const breathRateBpm = prev.breathRateBpm + (targetBreathBpm - prev.breathRateBpm) * Math.min(1, safeDt * 1.6);
  const breathPhase = (prev.breathPhase + (breathRateBpm / 60) * Math.PI * 2 * safeDt) % (Math.PI * 2);

  // Pelvic vascular pulse ~ 64..104 bpm
  const pulseBpm = 64 + arousal * 30 + discomfort * 12 + (peakReleaseTimer > 0 ? 10 : 0);
  const pulsePhase = (prev.pulsePhase + (pulseBpm / 60) * Math.PI * 2 * safeDt) % (Math.PI * 2);

  return {
    congestion,
    moisture,
    arousal,
    discomfort,
    clitoralSaturation,
    vestibuleRelaxation,
    pauseDuration,
    circularity,
    rhythmQuality,
    breathPhase,
    breathRateBpm,
    pulsePhase,
    elapsedTime: prev.elapsedTime + safeDt,
    peakProgress,
    peakReleaseTimer,
    emissionCount,
  };
}
