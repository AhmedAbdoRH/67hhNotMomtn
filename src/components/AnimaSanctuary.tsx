import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, MessageSquareOff, Sparkles, X } from 'lucide-react';
import tenderSmileImg from '../assets/images/anima_tender_smile_1795219619928.jpg';
import halfLiddedImg from '../assets/images/anima_half_lidded_1795219621704.jpg';
import peakReleaseImg from '../assets/images/anima_peak_release_1795219642415.jpg';
import dreamySighImg from '../assets/images/anima_dreamy_sigh_1795221709047.jpg';
import breathlessAweImg from '../assets/images/anima_breathless_awe_1795221709212.jpg';
import deepRaptureImg from '../assets/images/anima_deep_rapture_1795221709725.jpg';
import tenderAfterglowImg from '../assets/images/anima_tender_afterglow_1795221708294.jpg';
import {
  computeAnimaExpression,
  type AnimaPortraitKey,
  type AnimaTone,
  type ArousalTier,
  type InputZoomTelemetry,
} from '../simulation/animaExpression';
import type { PhysiologicalState } from '../simulation/types';

const PORTRAIT_SOURCES: Record<AnimaPortraitKey, string> = {
  serene_rest: '/assets/aistudio/1795218159960_d3062cd1.jpg',
  soft_peace: '/assets/aistudio/1795219452549_b70be6de.jpg',
  tender_smile: tenderSmileImg,
  open_yearning: '/assets/aistudio/1795219424386_6bca043c.jpg',
  dreamy_sigh: dreamySighImg,
  half_lidded: halfLiddedImg,
  breathless_awe: breathlessAweImg,
  building_flush: '/assets/aistudio/1795219429695_3557bfaf.jpg',
  intense_flush: '/assets/aistudio/1795219435575_472192dc.jpg',
  deep_rapture: deepRaptureImg,
  peak_bliss: peakReleaseImg,
  calm_afterglow: '/assets/aistudio/1795219440267_ad094133.jpg',
  tender_afterglow: tenderAfterglowImg,
};

const PORTRAIT_KEYS = Object.keys(PORTRAIT_SOURCES) as AnimaPortraitKey[];

export interface SpontaneousAnimaLine {
  id: number;
  text: string;
  tone: AnimaTone;
  tier: ArousalTier;
}

interface AnimaSanctuaryProps {
  physiology: PhysiologicalState;
  inputTelemetry: InputZoomTelemetry;
  tone: AnimaTone;
  spontaneousLine: SpontaneousAnimaLine | null;
  speechEnabled: boolean;
  onToggleSpeech: () => void;
  onDismissLine?: () => void;
  onAdjustArousal?: (nextArousal: number) => void;
  onSwitchToSplit?: () => void;
  compact?: boolean;
}

export function AnimaSanctuary({
  physiology,
  inputTelemetry,
  tone,
  spontaneousLine,
  speechEnabled,
  onToggleSpeech,
  onDismissLine,
  onAdjustArousal,
  onSwitchToSplit,
  compact = false,
}: AnimaSanctuaryProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [failedPortraits, setFailedPortraits] = useState<Partial<Record<AnimaPortraitKey, boolean>>>({});

  // Pre-decode all 13 oil portrait assets once in memory
  useEffect(() => {
    let active = true;
    for (const key of PORTRAIT_KEYS) {
      const img = new Image();
      img.src = PORTRAIT_SOURCES[key];
      img.decode?.().catch(() => {
        if (!active) return;
      });
    }
    return () => {
      active = false;
    };
  }, []);

  const activeTone = spontaneousLine ? spontaneousLine.tone : tone;

  const expr = useMemo(
    () =>
      computeAnimaExpression({
        tone: activeTone,
        physiology,
        input: inputTelemetry,
      }),
    [activeTone, physiology, inputTelemetry],
  );

  const prevPrimaryRef = useRef<AnimaPortraitKey>(expr.primaryPortrait);
  const [dissolveFrom, setDissolveFrom] = useState<AnimaPortraitKey | null>(null);
  const [dissolveOpacity, setDissolveOpacity] = useState(0);

  useEffect(() => {
    const prev = prevPrimaryRef.current;
    if (prev !== expr.primaryPortrait) {
      prevPrimaryRef.current = expr.primaryPortrait;
      setDissolveFrom(prev);
      setDissolveOpacity(1);
      const raf = requestAnimationFrame(() => {
        setDissolveOpacity(0);
      });
      const timer = window.setTimeout(() => {
        setDissolveFrom(null);
      }, 480);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [expr.primaryPortrait]);

  const arousalPct = Math.round(physiology.arousal * 100);
  const peakActive = physiology.peakReleaseTimer > 0;
  const allPortraitsFailed = PORTRAIT_KEYS.every((k) => failedPortraits[k]);
  const dialogVisible = Boolean(speechEnabled && spontaneousLine?.text);

  return (
    <section
      ref={stageRef}
      dir="rtl"
      aria-label="ملاذ الأنيما التفاعلي"
      data-testid="anima-sanctuary"
      data-anima-tone={expr.tone}
      data-anima-tier={expr.arousalTier}
      data-anima-input-mode={expr.inputMode}
      data-anima-zoom={expr.zoomScale.toFixed(3)}
      data-anima-portrait={expr.primaryPortrait}
      data-anima-secondary-portrait={expr.secondaryPortrait ?? 'none'}
      data-anima-blend={expr.secondaryBlend.toFixed(2)}
      data-anima-speech-enabled={speechEnabled ? 'true' : 'false'}
      data-anima-dialog-open={dialogVisible ? 'true' : 'false'}
      className="font-arabic relative h-full w-full overflow-hidden bg-[#16100f] text-[#f3ebe4]"
    >
      {/* Unified Breathing + Input-Pattern Reactive Zoom Portrait Stage */}
      <div
        className="anima-breath-motion pointer-events-none absolute inset-0"
        style={
          {
            transformOrigin: '50% 40%',
            animationDuration: `${expr.breathDurationSec}s`,
            '--anima-breath-scale': String(expr.breathScale),
            '--anima-breath-y': `${expr.breathTranslateY}px`,
          } as React.CSSProperties
        }
      >
        <div
          data-testid="anima-zoom-layer"
          className="pointer-events-none relative h-full w-full transition-transform duration-150 ease-linear"
          style={{
            transformOrigin: '50% 40%',
            transform: `translate3d(0, ${expr.zoomTranslateY}px, 0) scale(${expr.zoomScale})`,
          }}
        >
          {!allPortraitsFailed ? (
            <>
              {!failedPortraits[expr.primaryPortrait] && (
                <img
                  src={PORTRAIT_SOURCES[expr.primaryPortrait]}
                  alt={`لوحة زيتية للأنيما — ${expr.moodLabelAr}`}
                  loading="eager"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedPortraits((prev) => ({
                      ...prev,
                      [expr.primaryPortrait]: true,
                    }))
                  }
                  className="pointer-events-none absolute inset-0 block h-full w-full select-none object-cover object-[50%_28%]"
                  style={{ opacity: 1, zIndex: 1 }}
                />
              )}

              {expr.secondaryPortrait &&
                expr.secondaryBlend > 0.01 &&
                !failedPortraits[expr.secondaryPortrait] && (
                  <img
                    src={PORTRAIT_SOURCES[expr.secondaryPortrait]}
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedPortraits((prev) => ({
                        ...prev,
                        [expr.secondaryPortrait!]: true,
                      }))
                    }
                    className="pointer-events-none absolute inset-0 block h-full w-full select-none object-cover object-[50%_28%] transition-opacity duration-300"
                    style={{ opacity: expr.secondaryBlend, zIndex: 2 }}
                  />
                )}

              {dissolveFrom &&
                dissolveFrom !== expr.primaryPortrait &&
                !failedPortraits[dissolveFrom] && (
                  <img
                    src={PORTRAIT_SOURCES[dissolveFrom]}
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="pointer-events-none absolute inset-0 block h-full w-full select-none object-cover object-[50%_28%] transition-opacity duration-450 ease-out"
                    style={{ opacity: dissolveOpacity, zIndex: 3 }}
                  />
                )}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#2b1e1b] via-[#1c1412] to-[#120d0c] p-8 text-center">
              <div className="space-y-2">
                <Sparkles className="mx-auto h-8 w-8 text-amber-200/70" aria-hidden="true" />
                <p className="text-sm text-amber-100/80">ملاذ الأنيما</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Warm Studio Candlelight Vignette & Arousal Ambient Halo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background:
            'radial-gradient(circle at 46% 38%, rgba(235, 168, 126, 0.16) 0%, rgba(168, 72, 74, 0.1) 38%, rgba(14, 11, 11, 0.68) 100%)',
          opacity: 0.45 + expr.warmGlowOpacity * 0.55,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0e0b0b]/85 via-[#0e0b0b]/40 to-transparent"
      />

      {/* Above-Head Auto-Vanishing Spontaneous AI Dialogue Box (auto-hides after 4s) */}
      {dialogVisible && spontaneousLine && (
        <aside
          key={spontaneousLine.id}
          aria-label="همسة الأنيما"
          aria-live="polite"
          className={`pointer-events-auto absolute left-1/2 z-20 -translate-x-1/2 rounded-xl border border-amber-100/18 bg-[#171110]/92 px-4 py-3 shadow-xl transition-opacity duration-300 ${
            compact
              ? 'top-3 w-[calc(100%-1.5rem)] max-w-sm'
              : 'top-14 w-[calc(100%-2rem)] max-w-md sm:top-16'
          }`}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-amber-200/75">
              <span className="font-semibold text-amber-100">الأنيما</span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{expr.moodLabelAr}</span>
            </div>
            {onDismissLine && (
              <button
                type="button"
                onClick={onDismissLine}
                aria-label="إغلاق الهمسة"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="text-center text-sm leading-relaxed text-stone-100 sm:text-[15px]">
            {spontaneousLine.text}
          </p>
        </aside>
      )}

      {/* Compact Speech Toggle in Split View */}
      {compact && (
        <button
          type="button"
          onClick={onToggleSpeech}
          aria-pressed={!speechEnabled}
          className={`pointer-events-auto absolute bottom-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shadow-lg transition-colors focus-visible:outline-2 focus-visible:outline-amber-200 ${
            speechEnabled
              ? 'border-amber-100/18 bg-[#161110]/88 text-stone-200 hover:border-amber-100/35 hover:text-white'
              : 'border-rose-400/45 bg-rose-950/75 text-rose-100 hover:bg-rose-950/90'
          }`}
        >
          {speechEnabled ? (
            <MessageSquareOff className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{speechEnabled ? 'تعطيل الكلام' : 'تفعيل الكلام'}</span>
        </button>
      )}

      {/* Quiet Bottom Arousal Control Strip & Speech Toggle */}
      {onAdjustArousal && (
        <div
          className={`pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto w-full px-3 pb-3 sm:px-6 sm:pb-5 ${
            compact ? 'max-w-md' : 'max-w-3xl'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-amber-100/15 bg-[#161110]/92 px-3.5 py-2.5 shadow-2xl md:flex-nowrap">
            <div className="flex items-center gap-2 text-xs text-stone-300">
              <label htmlFor="anima-arousal-slider" className="whitespace-nowrap text-amber-100/85">
                مستوى الإثارة
              </label>
              <span className="font-mono-tabular text-stone-100">{arousalPct}%</span>
              <span aria-hidden="true" className="text-stone-500">
                ·
              </span>
              <span className="max-w-[140px] truncate text-amber-200/80 sm:max-w-none">
                {expr.moodLabelAr}
              </span>
              {peakActive && <span className="text-rose-300">· ذروة</span>}
            </div>

            <div className="flex min-w-[140px] flex-1 basis-[140px] items-center gap-3 sm:basis-auto sm:max-w-[200px]">
              <input
                id="anima-arousal-slider"
                type="range"
                min={0}
                max={100}
                value={arousalPct}
                onChange={(e) => onAdjustArousal(Number(e.target.value) / 100)}
                aria-label="تعديل مستوى الإثارة"
                className="h-2 w-full cursor-pointer accent-rose-400"
              />
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onToggleSpeech}
                aria-pressed={!speechEnabled}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-amber-200 ${
                  speechEnabled
                    ? 'border-white/15 bg-white/5 text-stone-200 hover:border-white/25 hover:text-white'
                    : 'border-rose-400/45 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30'
                }`}
              >
                {speechEnabled ? (
                  <MessageSquareOff className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{speechEnabled ? 'تعطيل الكلام' : 'تفعيل الكلام'}</span>
              </button>

              {onSwitchToSplit && (
                <button
                  type="button"
                  onClick={onSwitchToSplit}
                  className="shrink-0 whitespace-nowrap text-xs font-medium text-amber-200/90 underline-offset-4 hover:text-amber-100 hover:underline"
                >
                  تفاعل مع المحاكاة
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
