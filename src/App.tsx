import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimaSanctuary, type SpontaneousAnimaLine } from './components/AnimaSanctuary';
import { StudioOverlay, type AppViewMode, type PressureLevel } from './components/StudioOverlay';
import {
  SPONTANEOUS_VISIBLE_MS,
  classifyArousalTier,
  classifyInputMode,
  computeNextSpontaneousDelayMs,
  normalizeAnimaTone,
  type AnimaTone,
  type ArousalTier,
  type InputZoomTelemetry,
} from './simulation/animaExpression';
import { SimulationAudioEngine } from './simulation/audioEngine';
import { clamp01, createInitialPhysiology, stepPhysiology } from './simulation/physiology';
import { AnatomyRenderer, screenToNormalized } from './simulation/renderer';
import { createInitialTissueMesh, detectAnatomicalZone, stepTissueMesh } from './simulation/tissuePhysics';
import {
  CADENCE_PRESETS,
  createInitialAutoCycle,
  createInitialVerticalRod,
  hitTestVerticalRod,
  stepVerticalRod,
  type DirectionalInput,
} from './simulation/tools';
import type {
  AnatomicalZone,
  AutoCycleConfig,
  CadencePreset,
  PhysiologicalState,
  PointerContact,
  TissueMeshState,
  VerticalRodState,
} from './simulation/types';

const PRESSURE_MAP: Record<PressureLevel, number> = {
  gentle: 0.28,
  moderate: 0.48,
  firm: 0.88,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  const physiologyRef = useRef<PhysiologicalState>(createInitialPhysiology());
  const meshRef = useRef<TissueMeshState>(createInitialTissueMesh());
  const rodRef = useRef<VerticalRodState>(createInitialVerticalRod());
  const contactRef = useRef<PointerContact>({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    pressure: PRESSURE_MAP.moderate,
    zone: 'none',
    isDirectGlans: false,
    friction: 0.5,
    tool: 'rod',
    insertion: 0,
  });
  const hoveredZoneRef = useRef<AnatomicalZone>('none');
  const prevVelocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const lastPointerPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const pointerDownRef = useRef(false);
  const lastHoverCaressRef = useRef(0);
  const pointerHoverRef = useRef<{ x: number; y: number } | null>(null);
  const directionalKeysRef = useRef<DirectionalInput>({ left: false, right: false, up: false, down: false });
  const tiltKeysRef = useRef<{ ccw: boolean; cw: boolean }>({ ccw: false, cw: false });
  const shiftHeldRef = useRef(false);

  const rendererRef = useRef<AnatomyRenderer | null>(null);
  const audioRef = useRef<SimulationAudioEngine | null>(null);

  const [viewMode, setViewMode] = useState<AppViewMode>('anima');
  const [animaTone, setAnimaTone] = useState<AnimaTone>('serene');
  const [spontaneousLine, setSpontaneousLine] = useState<SpontaneousAnimaLine | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(true);

  const [showLabels, setShowLabels] = useState(false);
  const [autoCycle, setAutoCycle] = useState<AutoCycleConfig>(() => createInitialAutoCycle());
  const [showReadout, setShowReadout] = useState(false);
  const [pressureLevel, setPressureLevel] = useState<PressureLevel>('moderate');
  const [muted, setMuted] = useState(false);
  const [rodCursor, setRodCursor] = useState<'pointer' | 'grab' | 'grabbing'>('pointer');
  const [uiPhysiology, setUiPhysiology] = useState<PhysiologicalState>(() => physiologyRef.current);
  const [uiInputTelemetry, setUiInputTelemetry] = useState<InputZoomTelemetry>({
    active: false,
    tool: 'rod',
    zone: 'none',
    pressure: 0,
    speed: 0,
    rhythmQuality: 0,
    circularity: 0,
    isDirectGlans: false,
    manualGlideActive: false,
    insertion: 0,
    cyclePreset: 'harmonious',
    elapsedTime: 0,
  });
  const [uiIntroitusSwelling, setUiIntroitusSwelling] = useState(0);
  const [uiExternalSwelling, setUiExternalSwelling] = useState(0);
  const [uiZone, setUiZone] = useState<AnatomicalZone>('none');

  const manualArousalHoldUntilRef = useRef(0);
  const manualGlideUntilRef = useRef(0);
  const aiPoolRef = useRef<Partial<Record<ArousalTier, Array<{ text: string; tone: AnimaTone }>>>>({});
  const inFlightPromisesRef = useRef<Partial<Record<ArousalTier, Promise<void>>>>({});
  const recentLinesRef = useRef<string[]>([]);
  const lineIdCounterRef = useRef(1);
  const lastActiveTierRef = useRef<ArousalTier>('resting');
  const pendingTierRevealRef = useRef<boolean>(false);

  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const showLabelsRef = useRef(showLabels);
  showLabelsRef.current = showLabels;

  const autoCycleRef = useRef(autoCycle);
  autoCycleRef.current = autoCycle;

  const speechEnabledRef = useRef(speechEnabled);
  speechEnabledRef.current = speechEnabled;

  const pressureLevelRef = useRef(pressureLevel);
  pressureLevelRef.current = pressureLevel;

  const showReadoutRef = useRef(showReadout);
  showReadoutRef.current = showReadout;

  const getEffectivePressure = useCallback((pointerPressure: number, pointerType: string): number => {
    const base = PRESSURE_MAP[pressureLevelRef.current];
    const shiftBoost = shiftHeldRef.current ? 0.36 : 0;
    if (pointerType === 'pen' || (pointerType === 'touch' && pointerPressure > 0 && pointerPressure < 1)) {
      return clamp01(base * 0.5 + pointerPressure * 0.65 + shiftBoost);
    }
    return clamp01(base + shiftBoost);
  }, []);

  const syncDomDatasets = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    const p = physiologyRef.current;
    const m = meshRef.current;
    const r = rodRef.current;
    const c = contactRef.current;
    el.dataset.congestion = p.congestion.toFixed(2);
    el.dataset.moisture = p.moisture.toFixed(2);
    el.dataset.arousal = p.arousal.toFixed(2);
    el.dataset.discomfort = p.discomfort.toFixed(2);
    el.dataset.introitusSwelling = m.introitusSwelling.toFixed(2);
    el.dataset.externalSwelling = m.externalSwelling.toFixed(2);
    el.dataset.peakProgress = p.peakProgress.toFixed(2);
    el.dataset.peakActive = p.peakReleaseTimer > 0 ? 'true' : 'false';
    el.dataset.emissionCount = String(p.emissionCount);
    el.dataset.zone = c.active ? c.zone : hoveredZoneRef.current;
    el.dataset.tool = 'rod';
    el.dataset.rodHeld = r.held ? 'true' : 'false';
    el.dataset.rodX = r.x.toFixed(2);
    el.dataset.rodY = r.y.toFixed(2);
    el.dataset.rodAngle = r.angle.toFixed(2);
    el.dataset.rodInsertion = (r.insertion ?? 0).toFixed(2);
    el.dataset.autoCycle = autoCycleRef.current.enabled ? 'true' : 'false';
    el.dataset.cadence = autoCycleRef.current.preset;
    el.dataset.cycleRate = autoCycleRef.current.rateHz.toFixed(2);
    el.dataset.speechEnabled = speechEnabledRef.current ? 'true' : 'false';
    el.dataset.viewMode = viewModeRef.current;
  }, []);

  const handleReset = useCallback(() => {
    physiologyRef.current = createInitialPhysiology();
    meshRef.current = createInitialTissueMesh();
    rodRef.current = createInitialVerticalRod();
    contactRef.current = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      pressure: PRESSURE_MAP[pressureLevelRef.current],
      zone: 'none',
      isDirectGlans: false,
      friction: 0.5,
      tool: 'rod',
      insertion: 0,
    };
    prevVelocityRef.current = { vx: 0, vy: 0 };
    lastPointerPosRef.current = null;
    pointerDownRef.current = false;
    lastHoverCaressRef.current = 0;
    pointerHoverRef.current = null;
    directionalKeysRef.current = { left: false, right: false, up: false, down: false };
    tiltKeysRef.current = { ccw: false, cw: false };
    setRodCursor('pointer');
    setUiPhysiology(physiologyRef.current);
    setUiIntroitusSwelling(0);
    setUiExternalSwelling(0);
    setUiZone('none');
    syncDomDatasets();
  }, [syncDomDatasets]);

  const handleToggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.initOnGesture();
    const nowMuted = audio.toggleMute();
    setMuted(nowMuted);
  }, []);

  const handleChangePressure = useCallback((level: PressureLevel) => {
    setPressureLevel(level);
    pressureLevelRef.current = level;
    contactRef.current.pressure = clamp01(PRESSURE_MAP[level] + (shiftHeldRef.current ? 0.36 : 0));
  }, []);

  const handleToggleAutoCycle = useCallback(() => {
    audioRef.current?.initOnGesture();
    setAutoCycle((prev) => {
      const next = { ...prev, enabled: !prev.enabled };
      autoCycleRef.current = next;
      return next;
    });
    syncDomDatasets();
  }, [syncDomDatasets]);

  const handleSelectCadencePreset = useCallback(
    (preset: CadencePreset) => {
      audioRef.current?.initOnGesture();
      const next: AutoCycleConfig = {
        enabled: true,
        preset,
        rateHz: CADENCE_PRESETS[preset].rateHz,
      };
      autoCycleRef.current = next;
      setAutoCycle(next);
      syncDomDatasets();
    },
    [syncDomDatasets],
  );

  const handleChangeCycleRate = useCallback(
    (rateHz: number) => {
      const clamped = Math.max(0.2, Math.min(2.2, Number(rateHz.toFixed(2))));
      setAutoCycle((prev) => {
        const next: AutoCycleConfig = { ...prev, rateHz: clamped };
        autoCycleRef.current = next;
        return next;
      });
      syncDomDatasets();
    },
    [syncDomDatasets],
  );

  const handleToggleSpeech = useCallback(() => {
    setSpeechEnabled((prev) => {
      const next = !prev;
      speechEnabledRef.current = next;
      if (!next) {
        setSpontaneousLine(null);
      }
      return next;
    });
    syncDomDatasets();
  }, [syncDomDatasets]);

  const handleAdjustArousal = useCallback(
    (nextArousalInput: number) => {
      const nextArousal = clamp01(nextArousalInput);
      const prev = physiologyRef.current;
      const triggerPeak = nextArousal >= 0.94;
      const updated: PhysiologicalState = {
        ...prev,
        arousal: triggerPeak ? 1.0 : nextArousal,
        congestion: clamp01(0.04 + nextArousal * 0.9),
        moisture: clamp01(0.06 + Math.pow(nextArousal, 0.85) * 0.78),
        discomfort: nextArousal > 0.2 ? Math.min(prev.discomfort, 0.12) : prev.discomfort,
        vestibuleRelaxation: clamp01(0.12 + nextArousal * 0.65),
        breathRateBpm: 13.5 + nextArousal * 11.5 + (triggerPeak ? 3.5 : 0),
        peakProgress: triggerPeak ? 1.0 : clamp01(nextArousal / 0.94),
        peakReleaseTimer: triggerPeak ? Math.max(prev.peakReleaseTimer, 3.8) : 0,
        pauseDuration: 0,
      };
      physiologyRef.current = updated;
      manualArousalHoldUntilRef.current = Number.POSITIVE_INFINITY;
      manualGlideUntilRef.current = performance.now() + 650;
      setUiPhysiology(updated);
      setUiInputTelemetry((prevInput) => ({
        ...prevInput,
        manualGlideActive: true,
        elapsedTime: updated.elapsedTime,
      }));
      syncDomDatasets();
    },
    [syncDomDatasets],
  );

  const fetchSpontaneousBatch = useCallback((tier: ArousalTier): Promise<void> => {
    if (!speechEnabledRef.current) return Promise.resolve();
    const existingPromise = inFlightPromisesRef.current[tier];
    if (existingPromise) return existingPromise;

    const phys = physiologyRef.current;
    const contact = contactRef.current;
    const currentTelemetry: InputZoomTelemetry = {
      active: contact.active,
      tool: 'rod',
      zone: contact.zone,
      pressure: contact.pressure,
      speed: Math.hypot(contact.vx, contact.vy),
      rhythmQuality: phys.rhythmQuality,
      circularity: phys.circularity,
      isDirectGlans: contact.isDirectGlans,
      manualGlideActive: performance.now() < manualGlideUntilRef.current,
      insertion: rodRef.current.insertion,
      cyclePreset: autoCycleRef.current.preset,
      elapsedTime: phys.elapsedTime,
    };
    const inputMode = classifyInputMode(currentTelemetry, phys);

    const requestPromise = (async () => {
      try {
        const res = await fetch('/api/anima/spontaneous', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier,
            arousal: Number(phys.arousal.toFixed(2)),
            discomfort: Number(phys.discomfort.toFixed(2)),
            peakActive: phys.peakReleaseTimer > 0,
            inputMode,
            cadence: autoCycleRef.current.preset,
            tool: 'rod',
            zone: currentTelemetry.zone,
            recentLines: recentLinesRef.current.slice(-10),
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { items?: Array<{ text?: unknown; tone?: unknown }> };
        if (!Array.isArray(data.items)) return;

        const existing = aiPoolRef.current[tier] ?? [];
        const seen = new Set([...existing.map((e) => e.text), ...recentLinesRef.current]);
        const fresh = data.items
          .map((it) => ({
            text: typeof it?.text === 'string' ? it.text.trim() : '',
            tone: normalizeAnimaTone(it?.tone),
          }))
          .filter((it) => it.text.length > 0 && !seen.has(it.text));

        if (fresh.length > 0) {
          aiPoolRef.current[tier] = [...existing, ...fresh].slice(-12);
        }
      } catch {
        // Quietly retry on next interval if transient network/API latency occurs
      } finally {
        delete inFlightPromisesRef.current[tier];
      }
    })();

    inFlightPromisesRef.current[tier] = requestPromise;
    return requestPromise;
  }, []);

  const currentTier = classifyArousalTier(uiPhysiology);

  const inputActiveRef = useRef(false);
  inputActiveRef.current = uiInputTelemetry.active;

  // Prefetch AI phrases when entering an arousal tier & run randomized spontaneous appearance scheduler
  useEffect(() => {
    if (!speechEnabled) {
      setSpontaneousLine(null);
      return;
    }
    if (viewMode === 'studio') return;
    let disposed = false;
    let timerId: number | null = null;

    const pool = aiPoolRef.current[currentTier] ?? [];
    if (pool.length <= 1) {
      void fetchSpontaneousBatch(currentTier);
    }

    if (lastActiveTierRef.current !== currentTier) {
      lastActiveTierRef.current = currentTier;
      pendingTierRevealRef.current = true;
    }

    const scheduleNext = (immediateOnChange: boolean) => {
      if (disposed || !speechEnabledRef.current) return;
      const delayMs = immediateOnChange
        ? Math.round(350 + Math.random() * 550)
        : computeNextSpontaneousDelayMs(currentTier, inputActiveRef.current);

      timerId = window.setTimeout(async () => {
        if (disposed || !speechEnabledRef.current) return;
        let currentPool = aiPoolRef.current[currentTier] ?? [];
        if (currentPool.length === 0) {
          await fetchSpontaneousBatch(currentTier);
          if (disposed || !speechEnabledRef.current) return;
          currentPool = aiPoolRef.current[currentTier] ?? [];
        }
        if (currentPool.length > 0) {
          const pickIdx = Math.floor(Math.random() * currentPool.length);
          const picked = currentPool[pickIdx];
          aiPoolRef.current[currentTier] = currentPool.filter((_, idx) => idx !== pickIdx);
          recentLinesRef.current = [...recentLinesRef.current.slice(-12), picked.text];
          setAnimaTone(picked.tone);
          setSpontaneousLine({
            id: lineIdCounterRef.current++,
            text: picked.text,
            tone: picked.tone,
            tier: currentTier,
          });
          if ((aiPoolRef.current[currentTier]?.length ?? 0) <= 1) {
            void fetchSpontaneousBatch(currentTier);
          }
        } else {
          scheduleNext(false);
        }
      }, delayMs);
    };

    if (!spontaneousLine) {
      const immediateReveal = pendingTierRevealRef.current;
      pendingTierRevealRef.current = false;
      scheduleNext(immediateReveal);
    }

    return () => {
      disposed = true;
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [currentTier, viewMode, speechEnabled, spontaneousLine, fetchSpontaneousBatch]);

  // Strict 4-second auto-dismiss timer whenever a spontaneous AI sentence is visible
  useEffect(() => {
    if (!spontaneousLine) return;
    const hideTimer = window.setTimeout(() => {
      setSpontaneousLine(null);
    }, SPONTANEOUS_VISIBLE_MS);
    return () => clearTimeout(hideTimer);
  }, [spontaneousLine]);

  useEffect(() => {
    rendererRef.current = new AnatomyRenderer();
    audioRef.current = new SimulationAudioEngine();

    const updateDirectionKey = (key: string, pressed: boolean): boolean => {
      const lower = key.toLowerCase();
      if (key === 'ArrowLeft' || lower === 'a') {
        directionalKeysRef.current.left = pressed;
        return true;
      }
      if (key === 'ArrowRight' || lower === 'd') {
        directionalKeysRef.current.right = pressed;
        return true;
      }
      if (key === 'ArrowUp' || lower === 'w') {
        directionalKeysRef.current.up = pressed;
        return true;
      }
      if (key === 'ArrowDown' || lower === 's') {
        directionalKeysRef.current.down = pressed;
        return true;
      }
      return false;
    };

    const updateTiltKey = (key: string, pressed: boolean): boolean => {
      const lower = key.toLowerCase();
      if (lower === 'q' || key === '[') {
        tiltKeysRef.current.ccw = pressed;
        return true;
      }
      if (lower === 'e' || key === ']') {
        tiltKeysRef.current.cw = pressed;
        return true;
      }
      return false;
    };

    const isTextInputFocused = () => {
      const active = document.activeElement;
      if (!active) return false;
      const tag = active.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement).isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextInputFocused()) return;
      if (e.key === 'Shift') {
        shiftHeldRef.current = true;
        contactRef.current.pressure = clamp01(PRESSURE_MAP[pressureLevelRef.current] + 0.36);
      } else if (updateDirectionKey(e.key, true)) {
        audioRef.current?.initOnGesture();
        e.preventDefault();
      } else if (updateTiltKey(e.key, true)) {
        audioRef.current?.initOnGesture();
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftHeldRef.current = false;
        contactRef.current.pressure = PRESSURE_MAP[pressureLevelRef.current];
      } else {
        updateDirectionKey(e.key, false);
        updateTiltKey(e.key, false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      audioRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cssWidth = canvas.clientWidth || 0;
    let cssHeight = canvas.clientHeight || 0;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      cssWidth = Math.max(0, rect.width);
      cssHeight = Math.max(0, rect.height);
      if (cssWidth <= 1 || cssHeight <= 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);

    let rafId = 0;
    let timerId: number | null = null;
    let disposed = false;
    let lastTime = performance.now();
    let uiSyncAccum = 0;

    const frame = (now: number) => {
      if (disposed) return;
      const frameStart = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const frameDt = Math.min(Math.max(rawDt, 0.001), 0.15);
      const subSteps = frameDt > 0.05 ? Math.ceil(frameDt / 0.045) : 1;
      const dt = frameDt / subSteps;

      if (viewModeRef.current !== 'anima' && (cssWidth <= 1 || cssHeight <= 1)) {
        resizeCanvas();
      }

      const contact = contactRef.current;
      contact.tool = 'rod';

      const dirs = directionalKeysRef.current;
      const hasDirInput = dirs.left || dirs.right || dirs.up || dirs.down;
      const tiltInput = (tiltKeysRef.current.cw ? 1 : 0) - (tiltKeysRef.current.ccw ? 1 : 0);
      const isAutoCycling = viewModeRef.current !== 'anima' && autoCycleRef.current.enabled;

      for (let stepIdx = 0; stepIdx < subSteps; stepIdx++) {
        // Step graspable & automatic cyclic anatomical member
        if (rodRef.current.held) {
          rodRef.current = stepVerticalRod(rodRef.current, {
            dt,
            pointerPos: pointerHoverRef.current,
            tiltInput,
          });
          contact.active = true;
          contact.x = rodRef.current.x;
          contact.y = rodRef.current.y;
          contact.vx = rodRef.current.vx;
          contact.vy = rodRef.current.vy;
          contact.insertion = rodRef.current.insertion;
          contact.pressure = clamp01(
            PRESSURE_MAP[pressureLevelRef.current] + rodRef.current.insertion * 0.22 + (shiftHeldRef.current ? 0.36 : 0),
          );
          lastHoverCaressRef.current = now;
        } else if (hasDirInput || tiltInput !== 0) {
          rodRef.current = stepVerticalRod(rodRef.current, {
            dt,
            directional: dirs,
            tiltInput,
          });
          contact.active = true;
          contact.x = rodRef.current.x;
          contact.y = rodRef.current.y;
          contact.vx = rodRef.current.vx;
          contact.vy = rodRef.current.vy;
          contact.insertion = rodRef.current.insertion;
          contact.pressure = clamp01(
            PRESSURE_MAP[pressureLevelRef.current] + rodRef.current.insertion * 0.22 + (shiftHeldRef.current ? 0.36 : 0),
          );
          lastHoverCaressRef.current = now;
        } else if (isAutoCycling) {
          rodRef.current = stepVerticalRod(rodRef.current, {
            dt,
            autoCycle: autoCycleRef.current,
            arousal: physiologyRef.current.arousal,
            tiltInput,
          });
          contact.active = true;
          contact.x = rodRef.current.x;
          contact.y = rodRef.current.y;
          contact.vx = rodRef.current.vx;
          contact.vy = rodRef.current.vy;
          contact.insertion = rodRef.current.insertion;
          contact.pressure = clamp01(
            PRESSURE_MAP[pressureLevelRef.current] + rodRef.current.insertion * 0.24 + (shiftHeldRef.current ? 0.36 : 0),
          );
          lastHoverCaressRef.current = now;
        } else {
          // Gentle velocity damping & tilt smoothing on paused member
          rodRef.current = stepVerticalRod(rodRef.current, { dt, tiltInput });
          if (!pointerDownRef.current && contact.active && now - lastHoverCaressRef.current > 240) {
            contact.active = false;
            contact.vx = 0;
            contact.vy = 0;
            contact.insertion = 0;
            contact.zone = 'none';
            contact.isDirectGlans = false;
          } else if (lastPointerPosRef.current && now - lastPointerPosRef.current.time > 32) {
            contact.vx *= Math.exp(-dt * 14);
            contact.vy *= Math.exp(-dt * 14);
          }
        }

        // Refresh zone hit-test against live deformed tissue mesh
        if (contact.active) {
          const hit = detectAnatomicalZone(contact.x, contact.y, meshRef.current);
          contact.zone = hit.zone;
          contact.isDirectGlans = hit.isDirectGlans;
          hoveredZoneRef.current = hit.zone;
        }

        // Step 4 physiological channels
        const prevPhys = physiologyRef.current;
        let nextPhys = stepPhysiology(prevPhys, contact, dt, prevVelocityRef.current);
        if (
          viewModeRef.current === 'anima' &&
          !contact.active &&
          now < manualArousalHoldUntilRef.current &&
          nextPhys.peakReleaseTimer === 0
        ) {
          nextPhys = {
            ...nextPhys,
            arousal: prevPhys.arousal,
            congestion: prevPhys.congestion,
            moisture: prevPhys.moisture,
            peakProgress: prevPhys.peakProgress,
          };
        } else if (contact.active) {
          manualArousalHoldUntilRef.current = 0;
        }
        physiologyRef.current = nextPhys;
        prevVelocityRef.current = { vx: contact.vx, vy: contact.vy };

        // Step viscoelastic spring-damper mesh & moisture beads
        meshRef.current = stepTissueMesh(meshRef.current, nextPhys, contact, dt);
      }

      const nextPhys = physiologyRef.current;

      // Update procedural Web Audio synthesis
      audioRef.current?.update(nextPhys, contact);

      // Render studio-lit anatomical canvas when visible
      if (viewModeRef.current !== 'anima' && cssWidth > 1 && cssHeight > 1) {
        rendererRef.current?.render(
          ctx,
          cssWidth,
          cssHeight,
          meshRef.current,
          nextPhys,
          contact,
          hoveredZoneRef.current,
          showLabelsRef.current,
          rodRef.current,
        );
      }

      // Sync DOM data attributes & throttled UI state (~10Hz)
      uiSyncAccum += frameDt;
      if (uiSyncAccum >= 0.1) {
        uiSyncAccum = 0;
        syncDomDatasets();
        setUiPhysiology((prevUi) => {
          const same =
            Math.round(prevUi.arousal * 100) === Math.round(nextPhys.arousal * 100) &&
            Math.round(prevUi.congestion * 100) === Math.round(nextPhys.congestion * 100) &&
            Math.round(prevUi.moisture * 100) === Math.round(nextPhys.moisture * 100) &&
            Math.round(prevUi.discomfort * 100) === Math.round(nextPhys.discomfort * 100) &&
            Math.round(prevUi.breathRateBpm * 2) === Math.round(nextPhys.breathRateBpm * 2) &&
            Math.round(prevUi.peakReleaseTimer * 10) === Math.round(nextPhys.peakReleaseTimer * 10) &&
            prevUi.emissionCount === nextPhys.emissionCount;
          return same ? prevUi : nextPhys;
        });
        const speedNow = contact.active ? Math.hypot(contact.vx, contact.vy) : 0;
        const glideActive = now < manualGlideUntilRef.current;
        setUiInputTelemetry((prevTelemetry) => {
          if (
            !contact.active &&
            !prevTelemetry.active &&
            !glideActive &&
            !prevTelemetry.manualGlideActive
          ) {
            return prevTelemetry;
          }
          const insNow = rodRef.current.insertion;
          const unchanged =
            prevTelemetry.active === contact.active &&
            prevTelemetry.zone === contact.zone &&
            prevTelemetry.cyclePreset === autoCycleRef.current.preset &&
            prevTelemetry.manualGlideActive === glideActive &&
            Math.abs((prevTelemetry.insertion ?? 0) - insNow) < 0.04 &&
            Math.abs(prevTelemetry.speed - speedNow) < 0.05 &&
            Math.abs(prevTelemetry.pressure - contact.pressure) < 0.05;
          if (unchanged) return prevTelemetry;
          return {
            active: contact.active,
            tool: 'rod',
            zone: contact.zone,
            pressure: contact.pressure,
            speed: speedNow,
            rhythmQuality: nextPhys.rhythmQuality,
            circularity: nextPhys.circularity,
            isDirectGlans: contact.isDirectGlans,
            manualGlideActive: glideActive,
            insertion: insNow,
            cyclePreset: autoCycleRef.current.preset,
            elapsedTime: nextPhys.elapsedTime,
          };
        });
        setUiIntroitusSwelling((prev) =>
          Math.abs(prev - meshRef.current.introitusSwelling) < 0.01 ? prev : meshRef.current.introitusSwelling,
        );
        setUiExternalSwelling((prev) =>
          Math.abs(prev - meshRef.current.externalSwelling) < 0.01 ? prev : meshRef.current.externalSwelling,
        );
        if (showReadoutRef.current) {
          setUiZone(contact.active ? contact.zone : hoveredZoneRef.current);
        }
      }

      const renderMs = performance.now() - frameStart;
      const isAnimaOnly = viewModeRef.current === 'anima' && !contact.active;
      const isIdle =
        !contact.active &&
        !rodRef.current.held &&
        !isAutoCycling &&
        nextPhys.pauseDuration > 1.5 &&
        nextPhys.peakReleaseTimer === 0;
      const yieldMs = isAnimaOnly
        ? 120
        : isIdle
          ? 85
          : Math.max(28, Math.min(85, Math.round(renderMs * 1.4)));
      timerId = window.setTimeout(() => {
        if (!disposed) rafId = requestAnimationFrame(frame);
      }, yieldMs);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (timerId !== null) clearTimeout(timerId);
      observer.disconnect();
    };
  }, [syncDomDatasets]);

  const updatePointerCoordinates = (e: React.PointerEvent<HTMLCanvasElement>, isDown: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const norm = screenToNormalized(e.clientX, e.clientY, rect);
    const now = performance.now();

    const rod = rodRef.current;
    const isHoveringRod = hitTestVerticalRod(norm.x, norm.y, rod);
    rod.hovered = isHoveringRod;

    if (rod.held) {
      setRodCursor('grabbing');
    } else if (isHoveringRod) {
      setRodCursor('grab');
    } else {
      setRodCursor('pointer');
    }

    const insidePelvicSkinField = Math.abs(norm.x) < 0.84 && norm.y > -0.86 && norm.y < 0.84;
    pointerHoverRef.current = insidePelvicSkinField || isDown ? { x: norm.x, y: norm.y } : null;

    if (rod.held && isDown) {
      const targetX = Math.max(-0.75, Math.min(0.75, norm.x - rod.grabOffsetX));
      const targetY = Math.max(-0.74, Math.min(0.74, norm.y - rod.grabOffsetY));
      let vx = 0;
      let vy = 0;
      const prev = lastPointerPosRef.current;
      if (prev) {
        const dt = Math.max(0.004, (now - prev.time) / 1000);
        const instVx = (targetX - rod.x) / dt;
        const instVy = (targetY - rod.y) / dt;
        vx = rod.vx * 0.45 + instVx * 0.55;
        vy = rod.vy * 0.45 + instVy * 0.55;
      }
      lastPointerPosRef.current = { x: norm.x, y: norm.y, time: now };
      rod.x = targetX;
      rod.y = targetY;
      rod.vx = vx;
      rod.vy = vy;

      const distFromIntroitusX = Math.abs(rod.x - 0);
      rod.insertion = distFromIntroitusX < 0.095 ? clamp01((0.28 - (rod.y - rod.halfLength)) / 0.34) : 0;

      const hit = detectAnatomicalZone(rod.x, rod.y, meshRef.current);
      hoveredZoneRef.current = hit.zone;
      contactRef.current = {
        ...contactRef.current,
        active: true,
        x: rod.x,
        y: rod.y,
        vx,
        vy,
        pressure: getEffectivePressure(e.pressure, e.pointerType),
        zone: hit.zone,
        isDirectGlans: hit.isDirectGlans,
        tool: 'rod',
        insertion: rod.insertion,
      };
      return;
    }

    const hit = detectAnatomicalZone(norm.x, norm.y, meshRef.current);
    hoveredZoneRef.current = hit.zone;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    audioRef.current?.initOnGesture();
    pointerDownRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPointerPosRef.current = null;

    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const norm = screenToNormalized(e.clientX, e.clientY, rect);
      const rod = rodRef.current;

      if (hitTestVerticalRod(norm.x, norm.y, rod)) {
        rod.held = true;
        rod.grabOffsetX = norm.x - rod.x;
        rod.grabOffsetY = norm.y - rod.y;
        setRodCursor('grabbing');
      } else {
        rod.held = true;
        rod.grabOffsetX = 0;
        rod.grabOffsetY = 0;
        rod.x = Math.max(-0.75, Math.min(0.75, norm.x));
        rod.y = Math.max(-0.74, Math.min(0.74, norm.y));
        setRodCursor('grabbing');
      }
    }

    updatePointerCoordinates(e, true);
    syncDomDatasets();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const isPressed = e.buttons > 0 || pointerDownRef.current;
    updatePointerCoordinates(e, isPressed);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerDownRef.current = false;
    rodRef.current.held = false;
    rodRef.current.vx = 0;
    rodRef.current.vy = 0;
    setRodCursor(rodRef.current.hovered ? 'grab' : 'pointer');
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    contactRef.current = {
      ...contactRef.current,
      active: false,
      vx: 0,
      vy: 0,
      zone: 'none',
      isDirectGlans: false,
    };
    lastPointerPosRef.current = null;
    syncDomDatasets();
  };

  const handlePointerLeave = () => {
    if (!pointerDownRef.current) {
      rodRef.current.hovered = false;
      setRodCursor('pointer');
      contactRef.current = {
        ...contactRef.current,
        active: false,
        vx: 0,
        vy: 0,
        zone: 'none',
        isDirectGlans: false,
      };
      hoveredZoneRef.current = 'none';
      pointerHoverRef.current = null;
      lastPointerPosRef.current = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // Scroll wheel lets desktop users smoothly step touch force between gentle -> moderate -> firm
    if (Math.abs(e.deltaY) < 4) return;
    const order: PressureLevel[] = ['gentle', 'moderate', 'firm'];
    const idx = order.indexOf(pressureLevelRef.current);
    const nextIdx = e.deltaY < 0 ? Math.min(2, idx + 1) : Math.max(0, idx - 1);
    if (nextIdx !== idx) {
      handleChangePressure(order[nextIdx]);
    }
  };

  const cursorClass =
    rodCursor === 'grabbing'
      ? 'cursor-grabbing'
      : rodCursor === 'grab'
        ? 'cursor-grab'
        : 'cursor-pointer';

  const isAnimaFullscreen = viewMode === 'anima';
  const isSplit = viewMode === 'split';
  const isStudio = viewMode === 'studio';

  return (
    <main
      ref={mainRef}
      data-congestion="0.04"
      data-moisture="0.06"
      data-arousal="0.02"
      data-discomfort="0.00"
      data-introitus-swelling="0.00"
      data-external-swelling="0.00"
      data-peak-progress="0.02"
      data-peak-active="false"
      data-emission-count="0"
      data-zone="none"
      data-tool="rod"
      data-rod-held="false"
      data-rod-x="0.00"
      data-rod-y="0.42"
      data-rod-angle="0.00"
      data-rod-insertion="0.08"
      data-auto-cycle={autoCycle.enabled ? 'true' : 'false'}
      data-cadence={autoCycle.preset}
      data-cycle-rate={autoCycle.rateHz.toFixed(2)}
      data-speech-enabled={speechEnabled ? 'true' : 'false'}
      data-view-mode={viewMode}
      className="relative h-screen w-screen overflow-hidden bg-[#0e0c0d]"
    >
      {/* Top Floating Bar in Fullscreen Anima Mode */}
      {isAnimaFullscreen && (
        <header
          dir="rtl"
          className="font-arabic pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-4 px-3 py-2.5 sm:px-6 sm:py-3.5"
        >
          <span className="pointer-events-auto text-sm font-semibold tracking-tight text-amber-100/95 whitespace-nowrap shrink-0">
            ملاذ الأنيما
          </span>

          <div
            role="group"
            aria-label="وضع العرض"
            className="pointer-events-auto flex items-center rounded-lg border border-amber-100/15 bg-[#161110]/92 p-0.5"
          >
            {(
              [
                { id: 'anima', label: 'ملاذ الأنيما' },
                { id: 'split', label: 'عرض مزدوج' },
                { id: 'studio', label: 'المحاكاة' },
              ] as const
            ).map((item) => {
              const active = viewMode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setViewMode(item.id)}
                  aria-pressed={active}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-200 ${
                    active ? 'bg-amber-200/20 text-amber-100' : 'text-stone-300 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </header>
      )}

      <div
        className={
          isSplit
            ? 'grid h-full w-full grid-rows-2 lg:grid-cols-2 lg:grid-rows-1'
            : 'relative h-full w-full'
        }
      >
        {/* Interactive Biomechanics Canvas Pane (always mounted for continuous physiological loop) */}
        <div
          className={
            isAnimaFullscreen
              ? 'hidden'
              : isSplit
                ? 'relative h-full w-full overflow-hidden border-b border-white/10 lg:border-b-0 lg:border-r'
                : 'relative h-full w-full overflow-hidden'
          }
        >
          <canvas
            ref={canvasRef}
            data-testid="anatomy-canvas"
            aria-label="Interactive external vulvar anatomy simulation canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onWheel={handleWheel}
            className={`block h-full w-full touch-none ${cursorClass}`}
          />

          {!isAnimaFullscreen && (
            <StudioOverlay
              showLabels={showLabels}
              onToggleLabels={() => setShowLabels((v) => !v)}
              autoCycle={autoCycle}
              onToggleAutoCycle={handleToggleAutoCycle}
              onSelectCadencePreset={handleSelectCadencePreset}
              onChangeCycleRate={handleChangeCycleRate}
              onReset={handleReset}
              pressureLevel={pressureLevel}
              onChangePressure={handleChangePressure}
              muted={muted}
              onToggleMute={handleToggleMute}
              showReadout={showReadout}
              onToggleReadout={() => {
                setShowReadout((prev) => {
                  const next = !prev;
                  if (next) {
                    setUiPhysiology(physiologyRef.current);
                    setUiIntroitusSwelling(meshRef.current.introitusSwelling);
                    setUiExternalSwelling(meshRef.current.externalSwelling);
                    setUiZone(contactRef.current.active ? contactRef.current.zone : hoveredZoneRef.current);
                  }
                  return next;
                });
              }}
              physiology={uiPhysiology}
              introitusSwelling={uiIntroitusSwelling}
              externalSwelling={uiExternalSwelling}
              activeZone={uiZone}
              viewMode={viewMode}
              onChangeViewMode={(nextMode) => {
                manualArousalHoldUntilRef.current = 0;
                setViewMode(nextMode);
              }}
            />
          )}
        </div>

        {/* Anima Sanctuary Portrait & Spontaneous Above-Head Dialogue Pane */}
        {!isStudio && (
          <div className="relative h-full w-full overflow-hidden">
            <AnimaSanctuary
              physiology={uiPhysiology}
              inputTelemetry={uiInputTelemetry}
              tone={animaTone}
              spontaneousLine={spontaneousLine}
              speechEnabled={speechEnabled}
              onToggleSpeech={handleToggleSpeech}
              onDismissLine={() => setSpontaneousLine(null)}
              onAdjustArousal={isAnimaFullscreen ? handleAdjustArousal : undefined}
              onSwitchToSplit={isAnimaFullscreen ? () => setViewMode('split') : undefined}
              compact={isSplit}
            />
          </div>
        )}
      </div>
    </main>
  );
}
