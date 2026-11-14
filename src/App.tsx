import { useCallback, useEffect, useRef, useState } from 'react';
import { StudioOverlay, type PressureLevel } from './components/StudioOverlay';
import { SimulationAudioEngine } from './simulation/audioEngine';
import { clamp01, createInitialPhysiology, stepPhysiology } from './simulation/physiology';
import { AnatomyRenderer, screenToNormalized } from './simulation/renderer';
import { createInitialTissueMesh, detectAnatomicalZone, stepTissueMesh } from './simulation/tissuePhysics';
import { stepGuidedPosition, type DirectionalInput } from './simulation/tools';
import type {
  AnatomicalZone,
  PhysiologicalState,
  PointerContact,
  TactileToolId,
  TissueMeshState,
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
    tool: 'finger',
  });
  const hoveredZoneRef = useRef<AnatomicalZone>('none');
  const prevVelocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const lastPointerPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const pointerDownRef = useRef(false);
  const lastHoverCaressRef = useRef(0);
  const pointerHoverRef = useRef<{ x: number; y: number } | null>(null);
  const directionalKeysRef = useRef<DirectionalInput>({ left: false, right: false, up: false, down: false });
  const shiftHeldRef = useRef(false);

  const rendererRef = useRef<AnatomyRenderer | null>(null);
  const audioRef = useRef<SimulationAudioEngine | null>(null);

  const [showLabels, setShowLabels] = useState(false);
  const [showFinger, setShowFinger] = useState(true);
  const [activeTool, setActiveTool] = useState<TactileToolId>('finger');
  const [showReadout, setShowReadout] = useState(false);
  const [pressureLevel, setPressureLevel] = useState<PressureLevel>('moderate');
  const [muted, setMuted] = useState(false);
  const [uiPhysiology, setUiPhysiology] = useState<PhysiologicalState>(() => physiologyRef.current);
  const [uiIntroitusSwelling, setUiIntroitusSwelling] = useState(0);
  const [uiExternalSwelling, setUiExternalSwelling] = useState(0);
  const [uiZone, setUiZone] = useState<AnatomicalZone>('none');

  const showLabelsRef = useRef(showLabels);
  showLabelsRef.current = showLabels;

  const showFingerRef = useRef(showFinger);
  showFingerRef.current = showFinger;

  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

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

  const handleReset = useCallback(() => {
    physiologyRef.current = createInitialPhysiology();
    meshRef.current = createInitialTissueMesh();
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
      tool: activeToolRef.current,
    };
    prevVelocityRef.current = { vx: 0, vy: 0 };
    lastPointerPosRef.current = null;
    pointerDownRef.current = false;
    lastHoverCaressRef.current = 0;
    pointerHoverRef.current = null;
    directionalKeysRef.current = { left: false, right: false, up: false, down: false };
    setUiPhysiology(physiologyRef.current);
    setUiIntroitusSwelling(0);
    setUiExternalSwelling(0);
    setUiZone('none');
  }, []);

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

  const handleChangeTool = useCallback((tool: TactileToolId) => {
    setActiveTool(tool);
    activeToolRef.current = tool;
    contactRef.current.tool = tool;
    setShowFinger(true);
    showFingerRef.current = true;
    if (!pointerHoverRef.current && !contactRef.current.active) {
      pointerHoverRef.current = { x: -0.14, y: 0.04 };
    }
  }, []);

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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftHeldRef.current = true;
        contactRef.current.pressure = clamp01(PRESSURE_MAP[pressureLevelRef.current] + 0.36);
      } else if (updateDirectionKey(e.key, true)) {
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

    let cssWidth = canvas.clientWidth || window.innerWidth;
    let cssHeight = canvas.clientHeight || window.innerHeight;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      cssWidth = Math.max(1, rect.width);
      cssHeight = Math.max(1, rect.height);
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
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const contact = contactRef.current;
      contact.tool = activeToolRef.current;

      // Support continuous directional steering with Arrow / WASD keys
      const dirs = directionalKeysRef.current;
      if (dirs.left || dirs.right || dirs.up || dirs.down) {
        const origin = contact.active
          ? { x: contact.x, y: contact.y }
          : pointerHoverRef.current ?? { x: -0.14, y: 0.04 };
        const stepped = stepGuidedPosition(origin, dirs, dt);
        contact.active = true;
        contact.x = stepped.x;
        contact.y = stepped.y;
        contact.vx = stepped.vx;
        contact.vy = stepped.vy;
        contact.pressure = clamp01(PRESSURE_MAP[pressureLevelRef.current] + (shiftHeldRef.current ? 0.36 : 0));
        pointerHoverRef.current = { x: stepped.x, y: stepped.y };
        lastHoverCaressRef.current = now;
      } else if (!pointerDownRef.current && contact.active && now - lastHoverCaressRef.current > 240) {
        // End hover-glide caress smoothly once pointer/keyboard stops moving
        contact.active = false;
        contact.vx = 0;
        contact.vy = 0;
        contact.zone = 'none';
        contact.isDirectGlans = false;
      } else if (lastPointerPosRef.current && now - lastPointerPosRef.current.time > 32) {
        contact.vx *= Math.exp(-dt * 14);
        contact.vy *= Math.exp(-dt * 14);
      }

      // Refresh zone hit-test against live deformed tissue mesh
      if (contact.active) {
        const hit = detectAnatomicalZone(contact.x, contact.y, meshRef.current);
        contact.zone = hit.zone;
        contact.isDirectGlans = hit.isDirectGlans;
        hoveredZoneRef.current = hit.zone;
      }

      // Step 4 physiological channels
      const nextPhys = stepPhysiology(physiologyRef.current, contact, dt, prevVelocityRef.current);
      physiologyRef.current = nextPhys;
      prevVelocityRef.current = { vx: contact.vx, vy: contact.vy };

      // Step viscoelastic spring-damper mesh & moisture beads
      meshRef.current = stepTissueMesh(meshRef.current, nextPhys, contact, dt);

      // Update procedural Web Audio synthesis
      audioRef.current?.update(nextPhys, contact);

      // Render studio-lit anatomical canvas
      rendererRef.current?.render(
        ctx,
        cssWidth,
        cssHeight,
        meshRef.current,
        nextPhys,
        contact,
        hoveredZoneRef.current,
        showLabelsRef.current,
        showFingerRef.current,
        pointerHoverRef.current,
        activeToolRef.current,
      );

      // Sync DOM data attributes & throttled UI state (~10Hz) for arousal meter & readout
      uiSyncAccum += dt;
      if (uiSyncAccum >= 0.1) {
        uiSyncAccum = 0;
        if (mainRef.current) {
          mainRef.current.dataset.congestion = nextPhys.congestion.toFixed(2);
          mainRef.current.dataset.moisture = nextPhys.moisture.toFixed(2);
          mainRef.current.dataset.arousal = nextPhys.arousal.toFixed(2);
          mainRef.current.dataset.discomfort = nextPhys.discomfort.toFixed(2);
          mainRef.current.dataset.introitusSwelling = meshRef.current.introitusSwelling.toFixed(2);
          mainRef.current.dataset.externalSwelling = meshRef.current.externalSwelling.toFixed(2);
          mainRef.current.dataset.peakProgress = nextPhys.peakProgress.toFixed(2);
          mainRef.current.dataset.peakActive = nextPhys.peakReleaseTimer > 0 ? 'true' : 'false';
          mainRef.current.dataset.emissionCount = String(nextPhys.emissionCount);
          mainRef.current.dataset.zone = contact.active ? contact.zone : hoveredZoneRef.current;
          mainRef.current.dataset.tool = activeToolRef.current;
        }
        setUiPhysiology(nextPhys);
        setUiIntroitusSwelling(meshRef.current.introitusSwelling);
        setUiExternalSwelling(meshRef.current.externalSwelling);
        if (showReadoutRef.current) {
          setUiZone(contact.active ? contact.zone : hoveredZoneRef.current);
        }
      }

      const renderMs = performance.now() - frameStart;
      const isIdle = !contact.active && nextPhys.pauseDuration > 1.5;
      const yieldMs = isIdle ? 40 : renderMs > 8 ? 22 : 10;
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
  }, []);

  const updatePointerCoordinates = (e: React.PointerEvent<HTMLCanvasElement>, isDown: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const norm = screenToNormalized(e.clientX, e.clientY, rect);
    const now = performance.now();

    const hit = detectAnatomicalZone(norm.x, norm.y, meshRef.current);
    hoveredZoneRef.current = hit.zone;

    const insidePelvicSkinField = Math.abs(norm.x) < 0.84 && norm.y > -0.86 && norm.y < 0.84;
    pointerHoverRef.current = insidePelvicSkinField || isDown ? { x: norm.x, y: norm.y } : null;

    let vx = 0;
    let vy = 0;
    const prev = lastPointerPosRef.current;
    if (prev) {
      const dt = Math.max(0.004, (now - prev.time) / 1000);
      const instVx = (norm.x - prev.x) / dt;
      const instVy = (norm.y - prev.y) / dt;
      vx = contactRef.current.vx * 0.45 + instVx * 0.55;
      vy = contactRef.current.vy * 0.45 + instVy * 0.55;
    }
    lastPointerPosRef.current = { x: norm.x, y: norm.y, time: now };

    const speed = Math.hypot(vx, vy);

    if (isDown) {
      contactRef.current = {
        ...contactRef.current,
        active: true,
        x: norm.x,
        y: norm.y,
        vx,
        vy,
        pressure: getEffectivePressure(e.pressure, e.pointerType),
        zone: hit.zone,
        isDirectGlans: hit.isDirectGlans,
      };
    } else if (insidePelvicSkinField && speed > 0.015) {
      // Feather-light surface caress when gliding across the pelvic skin, vulva, or clitoris
      lastHoverCaressRef.current = now;
      contactRef.current = {
        ...contactRef.current,
        active: true,
        x: norm.x,
        y: norm.y,
        vx,
        vy,
        pressure: 0.28,
        zone: hit.zone,
        isDirectGlans: hit.isDirectGlans,
      };
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    audioRef.current?.initOnGesture();
    pointerDownRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    lastPointerPosRef.current = null;
    updatePointerCoordinates(e, true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const isPressed = e.buttons > 0 || pointerDownRef.current;
    updatePointerCoordinates(e, isPressed);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerDownRef.current = false;
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
  };

  const handlePointerLeave = () => {
    if (!pointerDownRef.current) {
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
      data-tool="finger"
      className="relative h-screen w-screen overflow-hidden bg-[#0e0c0d]"
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
        className="block h-full w-full cursor-pointer touch-none"
      />

      <StudioOverlay
        showLabels={showLabels}
        onToggleLabels={() => setShowLabels((v) => !v)}
        showFinger={showFinger}
        onToggleFinger={() => setShowFinger((v) => !v)}
        activeTool={activeTool}
        onChangeTool={handleChangeTool}
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
      />
    </main>
  );
}
