import { clamp01 } from './physiology';
import type {
  AnatomicalZone,
  PhysiologicalState,
  PointerContact,
  SpringNode,
  TissueMeshState,
  VerticalRodState,
} from './types';

export interface ViewportTransform {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  scale: number;
}

export function computeViewportTransform(width: number, height: number): ViewportTransform {
  const scale = Math.min(width / 1.78, height / 1.95);
  return {
    width,
    height,
    centerX: width * 0.5,
    centerY: height * 0.49,
    scale,
  };
}

export function screenToNormalized(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  const vt = computeViewportTransform(rect.width, rect.height);
  return {
    x: (clientX - rect.left - vt.centerX) / vt.scale,
    y: (clientY - rect.top - vt.centerY) / vt.scale,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(c1: [number, number, number], c2: [number, number, number], t: number): string {
  const k = clamp01(t);
  const r = Math.round(lerp(c1[0], c2[0], k));
  const g = Math.round(lerp(c1[1], c2[1], k));
  const b = Math.round(lerp(c1[2], c2[2], k));
  return `rgb(${r}, ${g}, ${b})`;
}

function lerpRgba(c1: [number, number, number], c2: [number, number, number], t: number, alpha: number): string {
  const k = clamp01(t);
  const r = Math.round(lerp(c1[0], c2[0], k));
  const g = Math.round(lerp(c1[1], c2[1], k));
  const b = Math.round(lerp(c1[2], c2[2], k));
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha).toFixed(3)})`;
}

/** Smooth Catmull-Rom spline path through normalized points */
function traceSmoothCurve(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
  vt: ViewportTransform,
  moveToFirst = true,
) {
  if (pts.length < 2) return;
  const toPx = (p: { x: number; y: number }) => ({
    x: vt.centerX + p.x * vt.scale,
    y: vt.centerY + p.y * vt.scale,
  });

  const p0 = toPx(pts[0]);
  if (moveToFirst) {
    ctx.moveTo(p0.x, p0.y);
  } else {
    ctx.lineTo(p0.x, p0.y);
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const pPrev = toPx(pts[Math.max(0, i - 1)]);
    const pCurr = toPx(pts[i]);
    const pNext = toPx(pts[i + 1]);
    const pNext2 = toPx(pts[Math.min(pts.length - 1, i + 2)]);

    const cp1x = pCurr.x + (pNext.x - pPrev.x) / 6;
    const cp1y = pCurr.y + (pNext.y - pPrev.y) / 6;
    const cp2x = pNext.x - (pNext2.x - pCurr.x) / 6;
    const cp2y = pNext.y - (pNext2.y - pCurr.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, pNext.x, pNext.y);
  }
}

export class AnatomyRenderer {
  private skinGrainPattern: CanvasPattern | null = null;
  private backdropCanvas: HTMLCanvasElement | null = null;
  private backdropKey = '';
  private vignetteCanvas: HTMLCanvasElement | null = null;
  private vignetteKey = '';

  private ensurePatterns(ctx: CanvasRenderingContext2D) {
    if (this.skinGrainPattern) return;
    if (typeof document === 'undefined') return;

    // Tileable dermal micro-texture (baked into cached studio backdrop)
    const skinTile = document.createElement('canvas');
    skinTile.width = 192;
    skinTile.height = 192;
    const sctx = skinTile.getContext('2d');
    if (sctx) {
      let seed = 1337;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      for (let i = 0; i < 2400; i++) {
        const px = rand() * 192;
        const py = rand() * 192;
        const r = 0.45 + rand() * 1.1;
        const isLight = rand() > 0.52;
        sctx.fillStyle = isLight
          ? `rgba(255, 232, 220, ${(0.015 + rand() * 0.025).toFixed(3)})`
          : `rgba(72, 34, 28, ${(0.018 + rand() * 0.032).toFixed(3)})`;
        sctx.beginPath();
        sctx.arc(px, py, r, 0, Math.PI * 2);
        sctx.fill();
      }
      sctx.strokeStyle = 'rgba(85, 42, 36, 0.025)';
      sctx.lineWidth = 0.6;
      for (let i = 0; i < 160; i++) {
        const px = rand() * 192;
        const py = rand() * 192;
        const angle = rand() * Math.PI;
        const len = 2 + rand() * 5;
        sctx.beginPath();
        sctx.moveTo(px, py);
        sctx.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len);
        sctx.stroke();
      }
      this.skinGrainPattern = ctx.createPattern(skinTile, 'repeat');
    }
  }

  private renderBackdropCached(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    congestion: number,
  ) {
    if (typeof document === 'undefined') return;
    const key = `${Math.round(vt.width)}x${Math.round(vt.height)}`;

    if (!this.backdropCanvas) {
      this.backdropCanvas = document.createElement('canvas');
    }

    if (this.backdropKey !== key) {
      this.backdropKey = key;
      this.backdropCanvas.width = Math.max(1, Math.round(vt.width));
      this.backdropCanvas.height = Math.max(1, Math.round(vt.height));
      const bctx = this.backdropCanvas.getContext('2d');
      if (bctx) {
        const bgGrad = bctx.createRadialGradient(
          vt.centerX - vt.scale * 0.12,
          vt.centerY - vt.scale * 0.18,
          vt.scale * 0.15,
          vt.centerX,
          vt.centerY,
          Math.max(vt.width, vt.height) * 0.78,
        );
        bgGrad.addColorStop(0, '#1d1819');
        bgGrad.addColorStop(0.55, '#120f10');
        bgGrad.addColorStop(1, '#090708');
        bctx.fillStyle = bgGrad;
        bctx.fillRect(0, 0, vt.width, vt.height);

        this.drawPelvicFrame(bctx, vt, 0.15, 0);
      }
    }

    ctx.drawImage(this.backdropCanvas, 0, 0, vt.width, vt.height);

    if (congestion > 0.06) {
      const blushGrad = ctx.createRadialGradient(
        vt.centerX,
        vt.centerY - vt.scale * 0.04,
        vt.scale * 0.05,
        vt.centerX,
        vt.centerY,
        vt.scale * 0.75,
      );
      blushGrad.addColorStop(0, `rgba(196, 88, 96, ${(congestion * 0.16).toFixed(3)})`);
      blushGrad.addColorStop(0.55, `rgba(164, 72, 78, ${(congestion * 0.08).toFixed(3)})`);
      blushGrad.addColorStop(1, 'rgba(164, 72, 78, 0)');
      ctx.fillStyle = blushGrad;
      ctx.fillRect(0, 0, vt.width, vt.height);
    }
  }

  private renderVignetteCached(ctx: CanvasRenderingContext2D, vt: ViewportTransform) {
    if (typeof document === 'undefined') return;
    const w = Math.max(1, Math.round(vt.width));
    const h = Math.max(1, Math.round(vt.height));
    const key = `${w}x${h}`;

    if (!this.vignetteCanvas) {
      this.vignetteCanvas = document.createElement('canvas');
    }
    if (this.vignetteKey !== key) {
      this.vignetteKey = key;
      this.vignetteCanvas.width = w;
      this.vignetteCanvas.height = h;
      const vctx = this.vignetteCanvas.getContext('2d');
      if (vctx) {
        const vig = vctx.createRadialGradient(
          vt.centerX,
          vt.centerY,
          vt.scale * 0.78,
          vt.centerX,
          vt.centerY,
          vt.scale * 1.45,
        );
        vig.addColorStop(0, 'rgba(9, 7, 8, 0)');
        vig.addColorStop(0.68, 'rgba(9, 7, 8, 0.28)');
        vig.addColorStop(1, 'rgba(9, 7, 8, 0.92)');
        vctx.fillStyle = vig;
        vctx.fillRect(0, 0, w, h);
      }
    }
    ctx.drawImage(this.vignetteCanvas, 0, 0, vt.width, vt.height);
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    mesh: TissueMeshState,
    physiology: PhysiologicalState,
    contact: PointerContact,
    hoveredZone: AnatomicalZone,
    showLabels: boolean,
    rod: VerticalRodState | null = null,
  ) {
    this.ensurePatterns(ctx);
    const vt = computeViewportTransform(width, height);
    const { congestion } = physiology;

    ctx.save();

    // 1. Cached Studio Backdrop + Pelvic Anatomical Frame
    this.renderBackdropCached(ctx, vt, congestion);

    // 1b. Dynamic External Vascular Swelling (anterior commissure, outer cushions, perineal fullness)
    if (mesh.externalSwelling > 0.02) {
      this.drawExternalSwellingFlush(ctx, vt, mesh, physiology);
    }

    // 2. Deep Vestibule, Urethral Meatus, & Introitus (Closed at Rest, Revealed by Parting)
    this.drawVestibuleAndUrethra(ctx, vt, mesh, physiology);

    // 3. Labia Minora (Non-Symmetrical, Delicate Wavy Folds)
    this.drawLabiaMinora(ctx, vt, mesh, physiology);

    // 4. Clitoral Frenulum, Glans, & Retractable Prepuce (Hood)
    this.drawClitoralComplex(ctx, vt, mesh, physiology);

    // 5. Labia Majora (Volumetric Fleshy Cushions with Soft Studio Lighting & Micro-Texture)
    this.drawLabiaMajora(ctx, vt, mesh, physiology);

    // 6. Cohesive Moisture Films, Gravity-Driven Beads, & Skene's Gland Emission Streams
    this.drawMoistureLayer(ctx, vt, mesh, physiology);

    // 7. Cached Soft Studio Vignette Edge Blending
    this.renderVignetteCached(ctx, vt);

    // 8. Subtle Tactile Contact Caliper Ring & Rhythmic Entering/Exiting Anatomical Member
    if (contact.active || hoveredZone !== 'none') {
      this.drawContactCue(ctx, vt, contact, physiology.discomfort);
    }
    if (rod) {
      this.drawVerticalRod(ctx, vt, rod, contact, physiology.discomfort, physiology.moisture);
    }

    // 9. Optional Clinical Reference Labels
    if (showLabels) {
      this.drawAnatomicalLabels(ctx, vt, mesh);
    }

    ctx.restore();
  }

  private drawExternalSwellingFlush(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    mesh: TissueMeshState,
    physiology: PhysiologicalState,
  ) {
    const px = (x: number) => vt.centerX + x * vt.scale;
    const py = (y: number) => vt.centerY + y * vt.scale;
    const swell = mesh.externalSwelling;
    const peakBoost = physiology.peakReleaseTimer > 0 ? 0.14 : 0;

    ctx.save();

    // Anterior commissure / mons vascular fullness mound
    const monsGrad = ctx.createRadialGradient(
      px(-0.03),
      py(-0.56),
      vt.scale * 0.02,
      px(0),
      py(-0.53),
      vt.scale * (0.24 + swell * 0.09),
    );
    monsGrad.addColorStop(0, `rgba(228, 152, 142, ${(swell * (0.28 + peakBoost)).toFixed(3)})`);
    monsGrad.addColorStop(0.55, `rgba(196, 114, 108, ${(swell * 0.16).toFixed(3)})`);
    monsGrad.addColorStop(1, 'rgba(180, 104, 98, 0)');
    ctx.fillStyle = monsGrad;
    ctx.beginPath();
    ctx.ellipse(px(0), py(-0.53), vt.scale * (0.24 + swell * 0.08), vt.scale * (0.16 + swell * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();

    // Posterior fourchette / perineal soft-tissue fullness
    const perinGrad = ctx.createRadialGradient(
      px(-0.02),
      py(0.49),
      vt.scale * 0.015,
      px(0),
      py(0.50),
      vt.scale * (0.17 + swell * 0.07),
    );
    perinGrad.addColorStop(0, `rgba(218, 138, 132, ${(swell * (0.24 + peakBoost)).toFixed(3)})`);
    perinGrad.addColorStop(0.6, `rgba(176, 94, 92, ${(swell * 0.12).toFixed(3)})`);
    perinGrad.addColorStop(1, 'rgba(160, 84, 84, 0)');
    ctx.fillStyle = perinGrad;
    ctx.beginPath();
    ctx.ellipse(px(0), py(0.50), vt.scale * (0.18 + swell * 0.06), vt.scale * (0.13 + swell * 0.04), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawPelvicFrame(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    congestion: number,
    breathLift: number,
  ) {
    const px = (x: number) => vt.centerX + x * vt.scale;
    const py = (y: number) => vt.centerY + (y + breathLift) * vt.scale;

    ctx.save();

    // Base continuous pelvic, mons pubis, medial thigh, and perineal skin mass (no sharp bottom cutout)
    ctx.beginPath();
    ctx.moveTo(px(-1.05), py(-1.25));
    ctx.lineTo(px(1.05), py(-1.25));
    ctx.lineTo(px(1.05), py(1.25));
    ctx.lineTo(px(-1.05), py(1.25));
    ctx.closePath();

    // Soft studio key light from upper-left with natural pelvic/thigh falloff
    const skinGrad = ctx.createRadialGradient(
      px(-0.18),
      py(-0.46),
      vt.scale * 0.08,
      px(0.02),
      py(0.02),
      vt.scale * 1.12,
    );
    const warmFlush = congestion * 0.22;
    skinGrad.addColorStop(0, lerpRgb([222, 177, 156], [216, 158, 142], warmFlush));
    skinGrad.addColorStop(0.36, lerpRgb([200, 150, 129], [192, 134, 120], warmFlush));
    skinGrad.addColorStop(0.68, '#a6725f');
    skinGrad.addColorStop(0.92, '#5c3b32');
    skinGrad.addColorStop(1, '#261816');
    ctx.fillStyle = skinGrad;
    ctx.fill();

    // Overlay dermal micro-grain
    if (this.skinGrainPattern) {
      ctx.fillStyle = this.skinGrainPattern;
      ctx.fill();
    }

    // Smooth elliptical genitocrural / inguinal thigh creases (zero stroke banding)
    const drawSoftInguinalFold = (side: -1 | 1) => {
      ctx.save();
      ctx.translate(px(side * 0.37), py(0.12));
      ctx.rotate(side * -0.05);
      ctx.scale(0.18, 1.0);
      const foldGrad = ctx.createRadialGradient(0, 0, vt.scale * 0.02, 0, 0, vt.scale * 0.68);
      foldGrad.addColorStop(0, 'rgba(72, 36, 30, 0.26)');
      foldGrad.addColorStop(0.45, 'rgba(72, 36, 30, 0.11)');
      foldGrad.addColorStop(1, 'rgba(72, 36, 30, 0)');
      ctx.fillStyle = foldGrad;
      ctx.beginPath();
      ctx.arc(0, 0, vt.scale * 0.68, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawSoftInguinalFold(-1);
    drawSoftInguinalFold(1);

    // Subtle mons pubis soft anatomical cushion highlight
    const monsGlow = ctx.createRadialGradient(px(-0.07), py(-0.72), vt.scale * 0.03, px(0), py(-0.66), vt.scale * 0.44);
    monsGlow.addColorStop(0, 'rgba(244, 204, 184, 0.24)');
    monsGlow.addColorStop(0.55, 'rgba(214, 166, 144, 0.08)');
    monsGlow.addColorStop(1, 'rgba(180, 130, 110, 0)');
    ctx.fillStyle = monsGlow;
    ctx.beginPath();
    ctx.arc(px(0), py(-0.68), vt.scale * 0.44, 0, Math.PI * 2);
    ctx.fill();

    // Soft radial perineal body shadow below fourchette (fades smoothly to 0—no hard circle edge)
    const perineumShadow = ctx.createRadialGradient(px(0), py(0.68), vt.scale * 0.02, px(0), py(0.68), vt.scale * 0.30);
    perineumShadow.addColorStop(0, 'rgba(68, 32, 30, 0.24)');
    perineumShadow.addColorStop(0.55, 'rgba(68, 32, 30, 0.10)');
    perineumShadow.addColorStop(1, 'rgba(68, 32, 30, 0)');
    ctx.fillStyle = perineumShadow;
    ctx.beginPath();
    ctx.arc(px(0), py(0.68), vt.scale * 0.30, 0, Math.PI * 2);
    ctx.fill();

    // Soft posterior thigh cleft shadow at very bottom (natural studio depth)
    const lowerCleft = ctx.createRadialGradient(px(0), py(0.95), vt.scale * 0.02, px(0), py(0.98), vt.scale * 0.34);
    lowerCleft.addColorStop(0, 'rgba(32, 16, 15, 0.55)');
    lowerCleft.addColorStop(0.6, 'rgba(32, 16, 15, 0.22)');
    lowerCleft.addColorStop(1, 'rgba(32, 16, 15, 0)');
    ctx.fillStyle = lowerCleft;
    ctx.beginPath();
    ctx.arc(px(0), py(0.98), vt.scale * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // Faint feathered perineal midline raphe
    const rapheGrad = ctx.createLinearGradient(px(0), py(0.52), px(0), py(0.84));
    rapheGrad.addColorStop(0, 'rgba(88, 44, 38, 0.22)');
    rapheGrad.addColorStop(0.7, 'rgba(88, 44, 38, 0.14)');
    rapheGrad.addColorStop(1, 'rgba(88, 44, 38, 0)');
    ctx.strokeStyle = rapheGrad;
    ctx.lineWidth = vt.scale * 0.008;
    ctx.beginPath();
    ctx.moveTo(px(0), py(0.53));
    ctx.quadraticCurveTo(px(0.003), py(0.68), px(0), py(0.84));
    ctx.stroke();

    ctx.restore();
  }

  private drawVestibuleAndUrethra(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    mesh: TissueMeshState,
    physiology: PhysiologicalState,
  ) {
    const px = (x: number) => vt.centerX + x * vt.scale;
    const py = (y: number) => vt.centerY + y * vt.scale;
    const { congestion, moisture, discomfort } = physiology;

    ctx.save();

    // Clip inner vestibular structures cleanly inside the dynamic labia majora inner cleft
    // so when closed at rest, the urethral meatus & inner vestibule are naturally sheltered
    ctx.beginPath();
    traceSmoothCurve(ctx, mesh.majoraLeft, vt, true);
    traceSmoothCurve(ctx, [...mesh.majoraRight].reverse(), vt, false);
    ctx.closePath();
    ctx.clip();

    // Inner vestibular floor spanning between the inner minora bases
    const minL = mesh.minoraLeft;
    const minR = mesh.minoraRight;

    ctx.beginPath();
    traceSmoothCurve(ctx, minL, vt, true);
    const revR = [...minR].reverse();
    traceSmoothCurve(ctx, revR, vt, false);
    ctx.closePath();

    // Subsurface vasocongestion mucosal floor: dusty warm rose -> deep venous plum
    const vestGrad = ctx.createRadialGradient(px(0), py(0.08), vt.scale * 0.02, px(0), py(0.06), vt.scale * 0.36);
    vestGrad.addColorStop(0, lerpRgb([164, 96, 102], [116, 40, 56], congestion));
    vestGrad.addColorStop(0.65, lerpRgb([148, 82, 88], [94, 30, 44], congestion));
    vestGrad.addColorStop(1, lerpRgb([134, 72, 78], [76, 24, 36], congestion));
    ctx.fillStyle = vestGrad;
    ctx.fill();

    // Urethral Meatus & Paraurethral (Skene's) Gland Ducts: secluded above the vaginal vestibule inlet (y = -0.145)
    // Only clearly visible when cleft opens or during periurethral emission; at rest tucked inside anterior folds
    const uX = px(0.004);
    const uY = py(-0.145);
    const peakActive = physiology.peakReleaseTimer > 0 ? 1 : 0;
    const urethralVis = clamp01(Math.max((mesh.cleftOpening - 0.06) / 0.25, peakActive * 0.85));
    const urethralOpen = 0.2 + mesh.cleftOpening * 0.5 + peakActive * 0.3;

    if (urethralVis > 0.02) {
      ctx.save();
      ctx.globalAlpha = urethralVis;

      // Periurethral soft fold cushion (plumps slightly with congestion)
      const uCushion = ctx.createRadialGradient(uX - vt.scale * 0.004, uY - vt.scale * 0.004, 0, uX, uY, vt.scale * 0.034);
      uCushion.addColorStop(0, lerpRgba([188, 120, 124], [148, 62, 76], congestion, 0.85));
      uCushion.addColorStop(0.65, lerpRgba([154, 86, 92], [108, 36, 52], congestion, 0.45));
      uCushion.addColorStop(1, 'rgba(120, 55, 62, 0)');
      ctx.fillStyle = uCushion;
      ctx.beginPath();
      ctx.ellipse(uX, uY, vt.scale * 0.026, vt.scale * 0.034, 0, 0, Math.PI * 2);
      ctx.fill();

      // Secluded urethral stellate/vertical slit dimple
      ctx.fillStyle = lerpRgba([76, 30, 36], [48, 14, 22], congestion, 0.82);
      ctx.beginPath();
      ctx.ellipse(uX, uY, vt.scale * (0.0035 + 0.003 * urethralOpen), vt.scale * 0.010, 0.05, 0, Math.PI * 2);
      ctx.fill();

      // Bilateral Skene's (paraurethral) gland duct openings posterolateral to meatus
      ctx.fillStyle = lerpRgba([88, 32, 42], [44, 12, 22], congestion, 0.7 + peakActive * 0.25);
      for (const ductX of [px(-0.007), px(0.015)]) {
        ctx.beginPath();
        ctx.arc(ductX, py(-0.140), Math.max(1.0, vt.scale * (0.0022 + peakActive * 0.0016)), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // Tiny rim highlight around urethral meatus when moist
    if (moisture > 0.15) {
      ctx.strokeStyle = `rgba(255, 232, 234, ${(moisture * 0.22).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.8, vt.scale * 0.0025);
      ctx.beginPath();
      ctx.arc(uX - vt.scale * 0.002, uY - vt.scale * 0.002, vt.scale * 0.012, Math.PI * 0.9, Math.PI * 1.8);
      ctx.stroke();
    }

    // Vaginal Vestibule / Introitus Walls (closed/coapted at rest, swells & parts gradually with arousal & relaxation)
    const vL = mesh.vestibuleLeft;
    const vR = mesh.vestibuleRight;
    const introSwell = mesh.introitusSwelling;

    // Engorged vestibular bulb / introital ring cushions framing the entrance
    if (introSwell > 0.04) {
      for (const side of [-1, 1] as const) {
        const wall = side === -1 ? vL : vR;
        const bulbX = px(wall[2].x + side * (0.018 + introSwell * 0.014));
        const bulbY = py(0.175);
        const bulbR = vt.scale * (0.062 + introSwell * 0.056);
        ctx.save();
        ctx.translate(bulbX, bulbY);
        ctx.scale(0.72, 1.95);
        const bulbGrad = ctx.createRadialGradient(-vt.scale * 0.005, -vt.scale * 0.012, vt.scale * 0.008, 0, 0, bulbR);
        bulbGrad.addColorStop(0, lerpRgba([192, 106, 114], [142, 42, 64], congestion, introSwell * 0.88));
        bulbGrad.addColorStop(0.55, lerpRgba([160, 78, 88], [108, 26, 46], congestion, introSwell * 0.56));
        bulbGrad.addColorStop(1, 'rgba(92, 26, 40, 0)');
        ctx.fillStyle = bulbGrad;
        ctx.beginPath();
        ctx.arc(0, 0, bulbR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.beginPath();
    traceSmoothCurve(ctx, vL, vt, true);
    traceSmoothCurve(ctx, [...vR].reverse(), vt, false);
    ctx.closePath();

    const introitusGap = Math.max(0, vR[2].x - vL[2].x);
    const openFactor = clamp01(introitusGap / 0.08);

    const introitusGrad = ctx.createRadialGradient(
      px(0),
      py(0.17),
      vt.scale * 0.004,
      px(0),
      py(0.17),
      vt.scale * (0.045 + 0.115 * openFactor + 0.038 * introSwell),
    );
    // At rest, soft closed mucosal crease shadow; when parted, deeper warm recessed vestibule shadow
    introitusGrad.addColorStop(0, lerpRgba([62, 22, 28], [26, 6, 12], Math.max(congestion * 0.55, openFactor), 0.96));
    introitusGrad.addColorStop(0.68, lerpRgba([118, 52, 60], [64, 18, 28], congestion, 0.90));
    introitusGrad.addColorStop(1, lerpRgba([148, 78, 84], [94, 30, 44], congestion, 0.0));
    ctx.fillStyle = introitusGrad;
    ctx.fill();

    // Specular moisture highlight along swollen introital rim
    if (introSwell > 0.10 && moisture > 0.15) {
      ctx.strokeStyle = `rgba(255, 232, 236, ${(introSwell * moisture * 0.45).toFixed(3)})`;
      ctx.lineWidth = Math.max(1.2, vt.scale * (0.0038 + introSwell * 0.0045));
      for (const wall of [vL, vR]) {
        ctx.beginPath();
        traceSmoothCurve(ctx, wall.slice(1, 4), vt, true);
        ctx.stroke();
      }
    }

    // Closed midline coaptation seam & subtle hymenal/vestibular rugae
    ctx.strokeStyle = lerpRgba([68, 24, 30], [40, 12, 18], congestion, 0.65 - openFactor * 0.35);
    ctx.lineWidth = Math.max(1.0, vt.scale * 0.0045);
    ctx.beginPath();
    ctx.moveTo(px(0), py(-0.02));
    ctx.bezierCurveTo(px(-0.004), py(0.09), px(0.005), py(0.22), px(0), py(0.36));
    ctx.stroke();

    // Subtle transverse rugae / defensive tension ridges when discomfort is elevated
    if (discomfort > 0.12 || openFactor > 0.12) {
      const rugaeAlpha = 0.12 + discomfort * 0.25;
      ctx.strokeStyle = `rgba(245, 205, 205, ${rugaeAlpha.toFixed(3)})`;
      ctx.lineWidth = Math.max(0.7, vt.scale * 0.0022);
      for (let i = 0; i < 4; i++) {
        const ry = 0.05 + i * 0.068;
        const rxL = vL[Math.min(4, i + 1)].x;
        const rxR = vR[Math.min(4, i + 1)].x;
        ctx.beginPath();
        ctx.moveTo(px(rxL - 0.008), py(ry));
        ctx.quadraticCurveTo(px((rxL + rxR) * 0.5), py(ry + 0.012), px(rxR + 0.008), py(ry));
        ctx.stroke();
      }
    }

    // Posterior Fourchette fold (meeting of minora inferiorly)
    const fourchL = minL[minL.length - 1];
    const fourchR = minR[minR.length - 1];
    const fX = px((fourchL.x + fourchR.x) * 0.5);
    const fY = py((fourchL.y + fourchR.y) * 0.5);
    const fourchGrad = ctx.createRadialGradient(fX, fY - vt.scale * 0.01, 0, fX, fY, vt.scale * 0.07);
    fourchGrad.addColorStop(0, lerpRgba([162, 92, 98], [110, 38, 52], congestion, 0.72));
    fourchGrad.addColorStop(1, 'rgba(130, 68, 72, 0)');
    ctx.fillStyle = fourchGrad;
    ctx.beginPath();
    ctx.ellipse(fX, fY, vt.scale * 0.062, vt.scale * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawLabiaMinora(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    mesh: TissueMeshState,
    physiology: PhysiologicalState,
  ) {
    const px = (x: number) => vt.centerX + x * vt.scale;
    const py = (y: number) => vt.centerY + y * vt.scale;
    const { congestion, moisture, discomfort } = physiology;

    const renderSide = (nodes: SpringNode[], majoraNodes: SpringNode[], side: -1 | 1) => {
      ctx.save();

      // Build free wavy edge (with node.waveOffset modulated by tension/stretch)
      const stretchRatio = nodes.reduce((acc, n) => acc + Math.abs(n.x - n.restX), 0) / nodes.length;
      const waveDamp = Math.max(0.35, 1 - stretchRatio * 4.5);

      const freeEdge = nodes.map((n) => ({
        x: n.x + n.waveOffset * waveDamp * (1 + congestion * 0.25),
        y: n.y,
      }));

      // Outer attachment edge tucked against inner labia majora sulcus (thickens noticeably with vasocongestion)
      const outerEdge = nodes.map((n, idx) => {
        const maj = majoraNodes[Math.min(majoraNodes.length - 1, Math.round((idx / (nodes.length - 1)) * (majoraNodes.length - 1)))];
        const baseOffset = side * (0.048 + congestion * 0.052);
        return {
          x: lerp(n.x, maj.x + baseOffset, 0.60),
          y: n.y,
        };
      });

      // Soft cast shadow onto vestibule beneath free margin (feathered stroke along freeEdge)
      ctx.save();
      ctx.lineCap = 'round';
      ctx.beginPath();
      traceSmoothCurve(
        ctx,
        freeEdge.map((p) => ({ x: p.x - side * 0.004, y: p.y + 0.004 })),
        vt,
        true,
      );
      ctx.strokeStyle = 'rgba(28, 6, 12, 0.22)';
      ctx.lineWidth = vt.scale * 0.016;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      traceSmoothCurve(ctx, freeEdge, vt, true);
      traceSmoothCurve(ctx, [...outerEdge].reverse(), vt, false);
      ctx.closePath();

      // Subsurface vasocongestion gradient: outer skin-transition -> deeper mucosal free margin
      const grad = ctx.createLinearGradient(
        px(side * 0.065),
        py(-0.1),
        px(-side * 0.01),
        py(0.1),
      );
      const blanch = discomfort * 0.16;
      const outerColor = lerpRgb([196, 134, 122], [156, 76, 82], congestion);
      const midColor = lerpRgb([176, 102, 102], [116, 38, 52], congestion);
      const freeMarginColor = lerpRgb(
        [152, 82, 88],
        [92, 24, 38],
        Math.max(0, congestion - blanch),
      );

      grad.addColorStop(0, outerColor);
      grad.addColorStop(0.55, midColor);
      grad.addColorStop(1, freeMarginColor);

      ctx.fillStyle = grad;
      ctx.fill();

      // Delicate mucosal micro-creases along the labial fold
      ctx.strokeStyle = lerpRgba([92, 34, 42], [48, 10, 20], congestion, 0.24);
      ctx.lineWidth = Math.max(0.6, vt.scale * 0.0022);
      for (let i = 1; i < freeEdge.length - 1; i++) {
        const fe = freeEdge[i];
        const oe = outerEdge[i];
        ctx.beginPath();
        ctx.moveTo(px(lerp(fe.x, oe.x, 0.15)), py(fe.y));
        ctx.quadraticCurveTo(
          px(lerp(fe.x, oe.x, 0.55)),
          py(fe.y + 0.012),
          px(lerp(fe.x, oe.x, 0.85)),
          py(fe.y + 0.004),
        );
        ctx.stroke();
      }

      // Free margin soft rim & specular moisture highlight
      ctx.beginPath();
      traceSmoothCurve(ctx, freeEdge, vt, true);
      ctx.strokeStyle = lerpRgba([116, 48, 56], [62, 14, 24], congestion, 0.45);
      ctx.lineWidth = Math.max(1.0, vt.scale * 0.004);
      ctx.stroke();

      // Moist studio highlight along upper-left facing crest
      const highlightAlpha = 0.08 + moisture * 0.28 + congestion * 0.08;
      ctx.beginPath();
      traceSmoothCurve(
        ctx,
        freeEdge.map((p) => ({ x: p.x + side * 0.006, y: p.y - 0.003 })),
        vt,
        true,
      );
      ctx.strokeStyle = `rgba(255, 226, 226, ${clamp01(highlightAlpha).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.8, vt.scale * (0.003 + moisture * 0.004));
      ctx.stroke();

      ctx.restore();
    };

    // Draw right then left (left slight natural overlap if closed)
    renderSide(mesh.minoraRight, mesh.majoraRight, 1);
    renderSide(mesh.minoraLeft, mesh.majoraLeft, -1);
  }

  private drawClitoralComplex(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    mesh: TissueMeshState,
    physiology: PhysiologicalState,
  ) {
    const px = (x: number) => vt.centerX + x * vt.scale;
    const py = (y: number) => vt.centerY + y * vt.scale;
    const { congestion, moisture, discomfort } = physiology;

    const glans = mesh.glans;
    const [apex, leftFold, rim, rightFold, frenBase] = mesh.prepuce;

    ctx.save();

    // 1. Clitoral Frenulum (delicate paired bands beneath glans)
    ctx.strokeStyle = lerpRgba([174, 102, 106], [116, 40, 54], congestion, 0.75);
    ctx.lineWidth = Math.max(1.2, vt.scale * 0.0065);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px(glans.x - 0.006), py(glans.y + 0.016));
    ctx.quadraticCurveTo(px(-0.012), py(-0.32), px(mesh.minoraLeft[1].x), py(mesh.minoraLeft[1].y));
    ctx.moveTo(px(glans.x + 0.006), py(glans.y + 0.016));
    ctx.quadraticCurveTo(px(0.012), py(-0.32), px(mesh.minoraRight[1].x), py(mesh.minoraRight[1].y));
    ctx.stroke();

    // 2. Clitoral Glans (sits beneath hood; swells gently with congestion, recedes slightly at high congestion)
    const glansScale = 1 + Math.min(0.24, congestion * 0.34) - mesh.glansRecession * 0.14;
    const glansRx = vt.scale * 0.023 * glansScale;
    const glansRy = vt.scale * 0.028 * glansScale;
    const gx = px(glans.x);
    const gy = py(glans.y);

    // Soft recess shadow beneath glans corona
    const glansSocket = ctx.createRadialGradient(gx, gy, glansRx * 0.3, gx, gy, glansRx * 1.65);
    glansSocket.addColorStop(0, 'rgba(42, 10, 18, 0.65)');
    glansSocket.addColorStop(1, 'rgba(42, 10, 18, 0)');
    ctx.fillStyle = glansSocket;
    ctx.beginPath();
    ctx.arc(gx, gy, glansRx * 1.65, 0, Math.PI * 2);
    ctx.fill();

    // Volumetric glans shading
    const glansGrad = ctx.createRadialGradient(
      gx - glansRx * 0.32,
      gy - glansRy * 0.28,
      glansRx * 0.1,
      gx,
      gy,
      glansRy * 1.15,
    );
    glansGrad.addColorStop(0, lerpRgb([214, 146, 152], [174, 72, 92], congestion));
    glansGrad.addColorStop(0.58, lerpRgb([188, 104, 112], [134, 38, 58], congestion));
    glansGrad.addColorStop(1, lerpRgb([138, 62, 72], [86, 18, 34], congestion));

    ctx.fillStyle = glansGrad;
    ctx.beginPath();
    ctx.ellipse(gx, gy, glansRx, glansRy, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glans moist specular highlight (subtle studio reflection, stronger with moisture/arousal)
    ctx.fillStyle = `rgba(255, 236, 236, ${(0.18 + moisture * 0.32 - discomfort * 0.08).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(
      gx - glansRx * 0.25,
      gy - glansRy * 0.12,
      glansRx * 0.34,
      glansRy * 0.22,
      -0.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // 3. Sub-Preputial Shadow cast by the hood onto the sheltered upper glans
    ctx.beginPath();
    ctx.moveTo(px(leftFold.x), py(leftFold.y));
    ctx.quadraticCurveTo(px(rim.x), py(rim.y + 0.022), px(rightFold.x), py(rightFold.y));
    ctx.quadraticCurveTo(px(rim.x), py(rim.y - 0.015), px(leftFold.x), py(leftFold.y));
    ctx.closePath();
    ctx.fillStyle = 'rgba(32, 8, 14, 0.44)';
    ctx.fill();

    // 4. Clitoral Hood (Prepuce): rounded organic arch blending seamlessly into anterior commissure
    ctx.beginPath();
    ctx.moveTo(px(apex.x - 0.042), py(apex.y - 0.01));
    ctx.bezierCurveTo(
      px(apex.x - 0.015),
      py(apex.y - 0.025),
      px(apex.x + 0.015),
      py(apex.y - 0.025),
      px(apex.x + 0.042),
      py(apex.y - 0.01),
    );
    ctx.bezierCurveTo(
      px(rightFold.x + 0.018),
      py(rightFold.y - 0.02),
      px(rightFold.x + 0.010),
      py(rightFold.y + 0.025),
      px(rightFold.x),
      py(rightFold.y + 0.032),
    );
    ctx.quadraticCurveTo(px(rim.x), py(rim.y), px(leftFold.x), py(leftFold.y + 0.032));
    ctx.bezierCurveTo(
      px(leftFold.x - 0.010),
      py(leftFold.y + 0.025),
      px(leftFold.x - 0.018),
      py(leftFold.y - 0.02),
      px(apex.x - 0.042),
      py(apex.y - 0.01),
    );
    ctx.closePath();

    // Seamless vertical gradient fading top into anterior commissure skin
    const hoodGrad = ctx.createLinearGradient(px(rim.x), py(apex.y - 0.015), px(rim.x), py(rim.y + 0.01));
    hoodGrad.addColorStop(0, lerpRgba([206, 152, 134], [192, 132, 122], congestion, 0.0));
    hoodGrad.addColorStop(0.35, lerpRgba([198, 136, 124], [168, 92, 92], congestion, 0.85));
    hoodGrad.addColorStop(0.78, lerpRgb([184, 118, 112], [140, 62, 70], congestion));
    hoodGrad.addColorStop(1, lerpRgb([152, 86, 86], [108, 38, 48], congestion));

    ctx.fillStyle = hoodGrad;
    ctx.fill();

    // Prepuce rim crease & gentle studio highlight
    ctx.beginPath();
    ctx.moveTo(px(leftFold.x), py(leftFold.y + 0.032));
    ctx.quadraticCurveTo(px(rim.x), py(rim.y), px(rightFold.x), py(rightFold.y + 0.032));
    ctx.strokeStyle = lerpRgba([102, 42, 46], [58, 16, 24], congestion, 0.48);
    ctx.lineWidth = Math.max(1.0, vt.scale * 0.004);
    ctx.stroke();

    // Subtle specular crest on hood fold
    ctx.strokeStyle = `rgba(255, 224, 218, ${(0.12 + moisture * 0.14).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.8, vt.scale * 0.003);
    ctx.beginPath();
    ctx.moveTo(px(frenBase.x - 0.015), py(rim.y - 0.012));
    ctx.quadraticCurveTo(px(rim.x), py(rim.y - 0.018), px(frenBase.x + 0.015), py(rim.y - 0.012));
    ctx.stroke();

    ctx.restore();
  }

  private drawLabiaMajora(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    mesh: TissueMeshState,
    physiology: PhysiologicalState,
  ) {
    const px = (x: number) => vt.centerX + x * vt.scale;
    const py = (y: number) => vt.centerY + y * vt.scale;
    const { congestion, moisture, discomfort } = physiology;

    const renderCushion = (nodes: SpringNode[], side: -1 | 1) => {
      ctx.save();

      // Inner medial margin comes from the spring-damper mesh; outer boundary extends broadly with soft elliptical fade
      const innerEdge = nodes.map((n) => ({ x: n.x, y: n.y }));
      const outerBoundary = [
        { x: side * 0.004, y: -0.53 },
        { x: side * 0.14, y: -0.49 },
        { x: side * 0.28, y: -0.28 },
        { x: side * 0.32, y: 0.02 },
        { x: side * 0.26, y: 0.32 },
        { x: side * 0.12, y: 0.52 },
        { x: side * 0.004, y: 0.55 },
      ];

      // 1. Soft inner cleft occlusion shadow along the medial fold margin
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const pass of [
        { w: 0.032, offset: -0.006, a: 0.15 },
        { w: 0.016, offset: -0.003, a: 0.22 },
      ]) {
        ctx.beginPath();
        traceSmoothCurve(
          ctx,
          innerEdge.map((p) => ({ x: p.x + side * pass.offset, y: p.y + 0.003 })),
          vt,
          true,
        );
        ctx.strokeStyle = `rgba(26, 6, 10, ${pass.a})`;
        ctx.lineWidth = vt.scale * pass.w;
        ctx.stroke();
      }

      // 2. Clip to the cushion region and render a 360-degree elliptical radial volume (fades to 0 at top, bottom & sides!)
      ctx.save();
      ctx.beginPath();
      traceSmoothCurve(ctx, innerEdge, vt, true);
      traceSmoothCurve(ctx, [...outerBoundary].reverse(), vt, false);
      ctx.closePath();
      ctx.clip();

      const midNode = nodes[3];
      const extSwell = mesh.externalSwelling;
      const engorgementTint = clamp01(congestion * 0.52 + extSwell * 0.44);
      const tensionBlanch = discomfort * 0.14;
      const crestColor = lerpRgb(
        [222, 174, 152],
        [218, 132, 124],
        Math.max(0, engorgementTint - tensionBlanch),
      );
      const midFade = lerpRgba([198, 146, 126], [184, 102, 98], engorgementTint, 0.82);

      // Elongated anatomical cushion pad shading (plumps visibly with external swelling & release)
      const swellingScale = 1 + (congestion * 0.20 + extSwell * 0.28) * (1 - discomfort * 0.45);
      const cushionRadius = vt.scale * 0.215 * swellingScale;
      ctx.save();
      ctx.translate(px(midNode.x + side * (0.075 + extSwell * 0.024)), py(-0.01));
      ctx.scale(1.0 + extSwell * 0.14, 2.45);
      const cushionRad = ctx.createRadialGradient(
        -vt.scale * 0.015,
        -vt.scale * 0.03,
        vt.scale * 0.015,
        0,
        0,
        cushionRadius,
      );
      cushionRad.addColorStop(0, crestColor);
      cushionRad.addColorStop(0.45, midFade);
      cushionRad.addColorStop(0.85, `rgba(186, 126, 114, ${(0.18 + extSwell * 0.16).toFixed(3)})`);
      cushionRad.addColorStop(1, 'rgba(186, 134, 116, 0)');
      ctx.fillStyle = cushionRad;
      ctx.beginPath();
      ctx.arc(0, 0, cushionRadius, 0, Math.PI * 2);
      ctx.fill();

      // Volumetric studio key-light crest highlight proportional to external swelling
      if (extSwell > 0.08) {
        const crestGlow = ctx.createRadialGradient(
          -vt.scale * 0.02,
          -vt.scale * 0.035,
          0,
          -vt.scale * 0.01,
          -vt.scale * 0.01,
          cushionRadius * 0.65,
        );
        crestGlow.addColorStop(0, `rgba(255, 224, 214, ${(extSwell * 0.26).toFixed(3)})`);
        crestGlow.addColorStop(1, 'rgba(255, 224, 214, 0)');
        ctx.fillStyle = crestGlow;
        ctx.beginPath();
        ctx.arc(0, 0, cushionRadius * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Subtle inner medial lip transition warmth (also fades out toward top & bottom commissures)
      ctx.save();
      ctx.translate(px(midNode.x + side * 0.025), py(0.02));
      ctx.scale(0.65, 2.5);
      const lipGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, vt.scale * 0.18);
      lipGrad.addColorStop(0, lerpRgba([170, 108, 98], [138, 66, 68], congestion * 0.65, 0.78));
      lipGrad.addColorStop(0.65, lerpRgba([170, 108, 98], [138, 66, 68], congestion * 0.65, 0.28));
      lipGrad.addColorStop(1, 'rgba(165, 105, 96, 0)');
      ctx.fillStyle = lipGrad;
      ctx.beginPath();
      ctx.arc(0, 0, vt.scale * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore(); // end cushion clip

      // Soft inner medial fold crease
      ctx.beginPath();
      traceSmoothCurve(ctx, innerEdge, vt, true);
      ctx.strokeStyle = lerpRgba([106, 52, 48], [68, 22, 28], congestion * 0.6, 0.42);
      ctx.lineWidth = Math.max(1.0, vt.scale * 0.0042);
      ctx.stroke();

      // Subtle inner-edge studio specular sheen when moist
      if (moisture > 0.2) {
        ctx.beginPath();
        traceSmoothCurve(
          ctx,
          innerEdge.slice(1, -1).map((p) => ({ x: p.x + side * 0.010, y: p.y })),
          vt,
          true,
        );
        ctx.strokeStyle = `rgba(255, 228, 218, ${(moisture * 0.15).toFixed(3)})`;
        ctx.lineWidth = Math.max(1.0, vt.scale * 0.0045);
        ctx.stroke();
      }

      ctx.restore();
    };

    renderCushion(mesh.majoraLeft, -1);
    renderCushion(mesh.majoraRight, 1);
  }

  private drawMoistureLayer(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    mesh: TissueMeshState,
    physiology: PhysiologicalState,
  ) {
    const px = (x: number) => vt.centerX + x * vt.scale;
    const py = (y: number) => vt.centerY + y * vt.scale;
    const { moisture, peakReleaseTimer } = physiology;

    ctx.save();

    // 1. Continuous thin vestibular fluid film along inner sulci when lubrication builds
    if (moisture > 0.20) {
      const filmAlpha = clamp01((moisture - 0.20) / 0.80) * 0.42;
      ctx.strokeStyle = `rgba(255, 244, 244, ${filmAlpha.toFixed(3)})`;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.2, vt.scale * (0.0035 + moisture * 0.005));

      // Left and right inner sulcus fluid film ribbons
      for (const chain of [mesh.minoraLeft, mesh.minoraRight]) {
        ctx.beginPath();
        traceSmoothCurve(ctx, chain.slice(1, 6), vt, true);
        ctx.stroke();
      }
    }

    // 2. Cohesive gravity-driven moisture beads
    for (const bead of mesh.moistureBeads) {
      const bx = px(bead.x);
      const by = py(bead.y);
      const r = Math.max(2.0, bead.radius * vt.scale);

      // Soft lower contact shadow under droplet
      ctx.fillStyle = `rgba(42, 8, 16, ${(bead.alpha * 0.28).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(bx + r * 0.12, by + r * 0.38, r * 0.95, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();

      // Translucent cohesive teardrop body
      const dropGrad = ctx.createRadialGradient(bx - r * 0.28, by - r * 0.32, r * 0.1, bx, by, r * 1.2);
      dropGrad.addColorStop(0, `rgba(255, 248, 248, ${(bead.alpha * 0.72).toFixed(3)})`);
      dropGrad.addColorStop(0.55, `rgba(242, 210, 215, ${(bead.alpha * 0.34).toFixed(3)})`);
      dropGrad.addColorStop(1, `rgba(145, 58, 72, ${(bead.alpha * 0.38).toFixed(3)})`);

      ctx.fillStyle = dropGrad;
      ctx.beginPath();
      // Slightly elongated downward teardrop silhouette
      ctx.ellipse(bx, by + r * 0.12, r * 0.88, r * 1.18, 0, 0, Math.PI * 2);
      ctx.fill();

      // Crisp studio pinpoint reflection on upper-left curvature
      ctx.fillStyle = `rgba(255, 255, 255, ${(bead.alpha * 0.88).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(bx - r * 0.3, by - r * 0.26, Math.max(0.9, r * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Active Skene's gland / periurethral fluid jets during peak expulsion pulses
    if (peakReleaseTimer > 0.25) {
      const jetPulse = Math.max(0, Math.sin((3.8 - peakReleaseTimer) * Math.PI * 2.4));
      if (jetPulse > 0.12) {
        const jetLen = (0.14 + jetPulse * 0.24) * vt.scale;
        for (const duct of [
          { ox: -0.007, oy: -0.140, dx: -0.045 },
          { ox: 0.004, oy: -0.145, dx: 0.005 },
          { ox: 0.015, oy: -0.140, dx: 0.052 },
        ]) {
          const sx = px(duct.ox);
          const sy = py(duct.oy);
          const ex = sx + duct.dx * vt.scale * (0.6 + jetPulse * 0.6);
          const ey = sy + jetLen;
          const jetGrad = ctx.createLinearGradient(sx, sy, ex, ey);
          jetGrad.addColorStop(0, `rgba(255, 252, 254, ${(0.72 * jetPulse).toFixed(3)})`);
          jetGrad.addColorStop(0.6, `rgba(246, 238, 244, ${(0.45 * jetPulse).toFixed(3)})`);
          jetGrad.addColorStop(1, 'rgba(240, 224, 230, 0)');
          ctx.strokeStyle = jetGrad;
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(2.0, vt.scale * (0.0055 + jetPulse * 0.005));
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo((sx + ex) * 0.5 + duct.dx * vt.scale * 0.25, sy + jetLen * 0.45, ex, ey);
          ctx.stroke();
        }
      }
    }

    // 4. Periurethral / Skene's gland emission droplets & fluid trails during peak response
    for (const drop of mesh.emissionDroplets) {
      const dx = px(drop.x);
      const dy = py(drop.y);
      const tailX = px(drop.prevX - drop.vx * 0.055);
      const tailY = py(drop.prevY - drop.vy * 0.055);
      const r = Math.max(2.6, drop.radius * vt.scale);

      // Soft translucent fluid streak
      ctx.strokeStyle = `rgba(252, 248, 250, ${(drop.alpha * 0.58).toFixed(3)})`;
      ctx.lineWidth = Math.max(1.8, r * 1.05);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(dx, dy);
      ctx.stroke();

      // Refracted translucent droplet head
      const dGrad = ctx.createRadialGradient(dx - r * 0.28, dy - r * 0.28, r * 0.1, dx, dy, r * 1.25);
      dGrad.addColorStop(0, `rgba(255, 255, 255, ${(drop.alpha * 0.92).toFixed(3)})`);
      dGrad.addColorStop(0.55, `rgba(242, 236, 242, ${(drop.alpha * 0.62).toFixed(3)})`);
      dGrad.addColorStop(1, `rgba(180, 128, 140, ${(drop.alpha * 0.22).toFixed(3)})`);
      ctx.fillStyle = dGrad;
      ctx.beginPath();
      ctx.ellipse(dx, dy, r * 0.92, r * 1.38, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pinpoint studio highlight
      ctx.fillStyle = `rgba(255, 255, 255, ${(drop.alpha * 0.95).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(dx - r * 0.25, dy - r * 0.25, Math.max(0.9, r * 0.26), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawContactCue(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    contact: PointerContact,
    discomfort: number,
  ) {
    if (!contact.active) return;
    const cx = vt.centerX + contact.x * vt.scale;
    const cy = vt.centerY + contact.y * vt.scale;
    const r = Math.max(10, (0.028 + contact.pressure * 0.026) * vt.scale);

    ctx.save();
    // Quiet hairline studio contact ring — no neon glow
    ctx.strokeStyle =
      discomfort > 0.35
        ? `rgba(235, 165, 150, ${(0.35 + contact.pressure * 0.3).toFixed(3)})`
        : `rgba(248, 240, 236, ${(0.22 + contact.pressure * 0.28).toFixed(3)})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawVerticalRod(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    rod: VerticalRodState,
    contact: PointerContact,
    discomfort: number,
    moisture: number,
  ) {
    const cx = vt.centerX + rod.x * vt.scale;
    const cy = vt.centerY + rod.y * vt.scale;
    const r = rod.radius * vt.scale;
    const halfLen = rod.halfLength * vt.scale;
    const insertion = clamp01(rod.insertion ?? 0);
    const isActive = rod.held || insertion > 0.05 || contact.active;
    const pressure = isActive ? contact.pressure : 0.14;
    const liftPx = (isActive ? (1 - pressure) * 0.004 : 0.020) * vt.scale;
    const introitusRimY = vt.centerY + 0.175 * vt.scale;

    ctx.save();

    // When entering the introitus, clip along a smooth curved anterior pocket arch matching the parted vestibule walls
    const archY = introitusRimY - r * (0.72 + insertion * 0.24);
    if (insertion > 0.09) {
      ctx.beginPath();
      ctx.moveTo(0, introitusRimY + r * 0.55);
      ctx.lineTo(cx - r * 1.38, introitusRimY + r * 0.26);
      ctx.bezierCurveTo(
        cx - r * 0.95,
        archY,
        cx + r * 0.95,
        archY,
        cx + r * 1.38,
        introitusRimY + r * 0.26,
      );
      ctx.lineTo(vt.width, introitusRimY + r * 0.55);
      ctx.lineTo(vt.width, vt.height);
      ctx.lineTo(0, vt.height);
      ctx.closePath();
      ctx.clip();
    }

    // 1. Soft studio cast shadow onto perineum & skin surface
    ctx.save();
    ctx.translate(cx + liftPx * 0.55, cy + liftPx * 0.65);
    ctx.rotate(rod.angle);
    const shadowGrad = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, halfLen * 1.12);
    shadowGrad.addColorStop(0, `rgba(16, 5, 8, ${(isActive ? 0.36 + pressure * 0.14 : 0.20).toFixed(3)})`);
    shadowGrad.addColorStop(0.62, `rgba(16, 5, 8, ${(isActive ? 0.16 : 0.08).toFixed(3)})`);
    shadowGrad.addColorStop(1, 'rgba(16, 5, 8, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.55, halfLen * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Sculpted anatomical cylindrical body & rounded glans contour
    ctx.save();
    ctx.translate(cx + liftPx * 0.15, cy - liftPx * 0.2);
    ctx.rotate(rod.angle);

    const w = r * 2;
    const h = halfLen * 2;
    ctx.beginPath();
    ctx.roundRect(-r, -halfLen, w, h, r);

    // Warm anatomical skin/vascular studio shading (upper-left key light)
    const bodyGrad = ctx.createLinearGradient(-r, 0, r, 0);
    const baseAlpha = isActive ? 0.95 : rod.hovered ? 0.90 : 0.85;
    bodyGrad.addColorStop(0, `rgba(176, 118, 108, ${baseAlpha.toFixed(3)})`);
    bodyGrad.addColorStop(0.28, `rgba(224, 168, 154, ${Math.min(0.98, baseAlpha + 0.03).toFixed(3)})`);
    bodyGrad.addColorStop(0.65, `rgba(186, 124, 114, ${baseAlpha.toFixed(3)})`);
    bodyGrad.addColorStop(1, `rgba(120, 68, 66, ${baseAlpha.toFixed(3)})`);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Subtle deeper vascular warmth along distal glans + soft entry depth shading
    const vertGrad = ctx.createLinearGradient(0, -halfLen, 0, halfLen);
    vertGrad.addColorStop(0, `rgba(164, 74, 82, ${(0.34 + insertion * 0.25).toFixed(3)})`);
    vertGrad.addColorStop(0.20, 'rgba(168, 84, 88, 0.14)');
    vertGrad.addColorStop(0.42, 'rgba(255, 224, 212, 0.04)');
    vertGrad.addColorStop(0.86, 'rgba(54, 26, 28, 0.16)');
    vertGrad.addColorStop(1, 'rgba(32, 14, 18, 0.34)');
    ctx.fillStyle = vertGrad;
    ctx.fill();

    // Corona ridge subtle sculptural contour dividing distal glans from shaft
    const coronaY = -halfLen + r * 1.45;
    ctx.strokeStyle = 'rgba(104, 42, 48, 0.42)';
    ctx.lineWidth = Math.max(1.2, r * 0.075);
    ctx.beginPath();
    ctx.moveTo(-r * 0.92, coronaY);
    ctx.quadraticCurveTo(0, coronaY + r * 0.26, r * 0.92, coronaY);
    ctx.stroke();

    // Subtle hairline outer contour
    const strokeRgb = discomfort > 0.35 ? '242, 182, 168' : '248, 224, 214';
    const strokeAlpha = rod.held ? 0.65 : rod.hovered ? 0.5 : 0.28;
    ctx.strokeStyle = `rgba(${strokeRgb}, ${strokeAlpha})`;
    ctx.lineWidth = rod.held || rod.hovered ? 1.4 : 1.0;
    ctx.beginPath();
    ctx.roundRect(-r, -halfLen, w, h, r);
    ctx.stroke();

    // Longitudinal moist studio highlight along left-front curvature (glistens with moisture)
    const sheenAlpha = 0.2 + moisture * 0.44 + (insertion > 0.1 ? 0.12 : 0);
    ctx.beginPath();
    ctx.roundRect(-r * 0.54, -halfLen + r * 0.68, r * 0.26, h - r * 1.38, r * 0.13);
    ctx.fillStyle = `rgba(255, 244, 240, ${clamp01(sheenAlpha).toFixed(3)})`;
    ctx.fill();

    // Tactile grip collar band near the base for manual grab/steering
    const gripTop = halfLen * 0.22;
    const gripHeight = halfLen * 0.46;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-r, gripTop, w, gripHeight, 2);
    ctx.clip();
    ctx.fillStyle = rod.held ? 'rgba(90, 48, 48, 0.26)' : 'rgba(80, 42, 44, 0.16)';
    ctx.fillRect(-r, gripTop, w, gripHeight);
    for (let i = 0; i < 3; i++) {
      const gy = gripTop + gripHeight * (0.24 + i * 0.26);
      ctx.strokeStyle = rod.held ? 'rgba(255, 232, 224, 0.46)' : 'rgba(66, 30, 32, 0.32)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(-r * 0.78, gy);
      ctx.quadraticCurveTo(0, gy + 2.5, r * 0.78, gy);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
    ctx.restore();

    // Soft feathered mucosal arch shadow & rim highlight hugging the parted entry pocket
    if (insertion > 0.09) {
      ctx.save();
      ctx.strokeStyle = `rgba(42, 6, 14, ${(0.28 + insertion * 0.32).toFixed(3)})`;
      ctx.lineWidth = Math.max(4, r * 0.28);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.15, introitusRimY + r * 0.14);
      ctx.quadraticCurveTo(cx, archY - r * 0.08, cx + r * 1.15, introitusRimY + r * 0.14);
      ctx.stroke();

      ctx.strokeStyle = `rgba(244, 198, 204, ${(0.18 + moisture * 0.28).toFixed(3)})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.15, introitusRimY + r * 0.14);
      ctx.quadraticCurveTo(cx, archY - r * 0.08, cx + r * 1.15, introitusRimY + r * 0.14);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawAnatomicalLabels(
    ctx: CanvasRenderingContext2D,
    vt: ViewportTransform,
    mesh: TissueMeshState,
  ) {
    const px = (x: number) => vt.centerX + x * vt.scale;
    const py = (y: number) => vt.centerY + y * vt.scale;

    const labels: Array<{
      text: string;
      ax: number;
      ay: number;
      lx: number;
      ly: number;
      align: CanvasTextAlign;
    }> = [
      { text: 'Mons pubis', ax: 0, ay: -0.68, lx: -0.44, ly: -0.72, align: 'right' },
      { text: 'Prepuce (clitoral hood)', ax: mesh.prepuce[1].x, ay: mesh.prepuce[1].y, lx: -0.44, ly: -0.45, align: 'right' },
      { text: 'Clitoral glans', ax: mesh.glans.x, ay: mesh.glans.y, lx: 0.44, ly: -0.39, align: 'left' },
      { text: 'Urethral meatus', ax: 0.004, ay: -0.145, lx: 0.44, ly: -0.19, align: 'left' },
      { text: "Skene's gland ducts", ax: 0.015, ay: -0.140, lx: 0.44, ly: -0.11, align: 'left' },
      { text: 'Labium minus', ax: mesh.minoraLeft[3].x - 0.015, ay: mesh.minoraLeft[3].y, lx: -0.44, ly: -0.02, align: 'right' },
      { text: 'Labium majus', ax: mesh.majoraRight[3].x + 0.12, ay: mesh.majoraRight[3].y, lx: 0.44, ly: 0.09, align: 'left' },
      { text: 'Vestibule & introitus', ax: 0, ay: 0.18, lx: -0.44, ly: 0.22, align: 'right' },
      { text: 'Posterior fourchette', ax: 0, ay: 0.42, lx: 0.44, ly: 0.43, align: 'left' },
    ];

    ctx.save();
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';

    for (const item of labels) {
      const startX = px(item.ax);
      const startY = py(item.ay);
      const endX = px(item.lx);
      const endY = py(item.ly);
      const elbowX = endX + (item.align === 'right' ? 14 : -14);

      ctx.strokeStyle = 'rgba(235, 226, 220, 0.34)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(elbowX, endY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(235, 226, 220, 0.85)';
      ctx.beginPath();
      ctx.arc(startX, startY, 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.textAlign = item.align;
      ctx.fillStyle = 'rgba(244, 238, 234, 0.92)';
      ctx.fillText(item.text, endX + (item.align === 'right' ? -8 : 8), endY);
    }

    ctx.restore();
  }
}
