import {
  Volume2,
  VolumeX,
  RotateCcw,
  Tag,
  SlidersHorizontal,
  Hand,
  Feather,
  Sun,
  CircleDot,
  Eye,
  EyeOff,
  RectangleVertical,
} from 'lucide-react';
import { TACTILE_TOOLS, TACTILE_TOOL_ORDER } from '../simulation/tools';
import type { AnatomicalZone, PhysiologicalState, TactileToolId } from '../simulation/types';

export type PressureLevel = 'gentle' | 'moderate' | 'firm';

const ZONE_LABELS: Record<AnatomicalZone, string> = {
  none: 'Resting',
  mons: 'Mons pubis',
  prepuce: 'Prepuce (clitoral hood)',
  glans: 'Clitoral glans',
  labia_major_left: 'Labium majus (left)',
  labia_major_right: 'Labium majus (right)',
  labia_minor_left: 'Labium minus (left)',
  labia_minor_right: 'Labium minus (right)',
  urethra: 'Urethral meatus',
  vestibule: 'Vestibule & introitus',
  fourchette: 'Posterior fourchette',
  perineum: 'Perineal body',
};

const TOOL_ICONS = {
  finger: Hand,
  brush: Feather,
  palm: Sun,
  probe: CircleDot,
  rod: RectangleVertical,
} as const;

interface StudioOverlayProps {
  showLabels: boolean;
  onToggleLabels: () => void;
  showFinger: boolean;
  onToggleFinger: () => void;
  activeTool: TactileToolId;
  onChangeTool: (tool: TactileToolId) => void;
  onReset: () => void;
  pressureLevel: PressureLevel;
  onChangePressure: (level: PressureLevel) => void;
  muted: boolean;
  onToggleMute: () => void;
  showReadout: boolean;
  onToggleReadout: () => void;
  physiology: PhysiologicalState;
  introitusSwelling: number;
  externalSwelling: number;
  activeZone: AnatomicalZone;
}

export function StudioOverlay({
  showLabels,
  onToggleLabels,
  showFinger,
  onToggleFinger,
  activeTool,
  onChangeTool,
  onReset,
  pressureLevel,
  onChangePressure,
  muted,
  onToggleMute,
  showReadout,
  onToggleReadout,
  physiology,
  introitusSwelling,
  externalSwelling,
  activeZone,
}: StudioOverlayProps) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const meterPct = Math.round(physiology.peakProgress * 100);
  const peakActive = physiology.peakReleaseTimer > 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-6">
      {/* Top Bar: Quiet studio controls */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="pointer-events-auto flex flex-col gap-2.5">
          <div>
            <h1 className="text-sm font-medium tracking-tight text-stone-200/90">
              External Vulvar Anatomy
            </h1>
            <p className="text-xs text-stone-400/80">
              Touch or drag directly on tissue to explore biomechanics
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Surface tactile tools"
              className="flex flex-wrap items-center rounded-md border border-white/10 bg-[#141112]/85 p-0.5"
            >
              {TACTILE_TOOL_ORDER.map((toolId) => {
                const tool = TACTILE_TOOLS[toolId];
                const Icon = TOOL_ICONS[toolId];
                const active = activeTool === toolId;
                return (
                  <button
                    key={toolId}
                    type="button"
                    onClick={() => onChangeTool(toolId)}
                    aria-pressed={active}
                    title={tool.description}
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-400 ${
                      active
                        ? 'bg-stone-200/15 text-stone-100'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tool.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onToggleFinger}
              aria-pressed={showFinger}
              aria-label={showFinger ? 'Hide active tool visual' : 'Show active tool visual'}
              title={showFinger ? 'Hide tool visual' : 'Show tool visual'}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 ${
                showFinger
                  ? 'border-stone-400/40 bg-stone-200/10 text-stone-200'
                  : 'border-white/10 bg-[#141112]/80 text-stone-400 hover:border-white/20 hover:text-stone-200'
              }`}
            >
              {showFinger ? (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleLabels}
              aria-pressed={showLabels}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 ${
                showLabels
                  ? 'border-stone-400/50 bg-stone-200/12 text-stone-100'
                  : 'border-white/10 bg-[#141112]/80 text-stone-300 hover:border-white/20 hover:text-stone-100'
              }`}
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Anatomy Labels</span>
            </button>

            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-[#141112]/80 px-2.5 py-1.5 text-xs font-medium text-stone-300 whitespace-nowrap shrink-0 transition-colors hover:border-white/20 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Top-Right: Touch Pressure & Audio Toggle */}
        <div className="pointer-events-auto flex items-center gap-2.5">
          <div
            role="group"
            aria-label="Contact pressure"
            className="flex items-center rounded-md border border-white/10 bg-[#141112]/85 p-0.5"
          >
            {(['gentle', 'moderate', 'firm'] as const).map((level) => {
              const active = pressureLevel === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => onChangePressure(level)}
                  aria-pressed={active}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-stone-400 ${
                    active
                      ? 'bg-stone-200/15 text-stone-100'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {level}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            aria-pressed={!muted}
            title={muted ? 'Unmute audio' : 'Mute audio'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#141112]/85 text-stone-300 transition-colors hover:border-white/20 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-stone-400" aria-hidden="true" />
            ) : (
              <Volume2 className="h-4 w-4 text-stone-200" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {/* Bottom-Left: Arousal Threshold Meter & Optional Clinical Physiology Readout */}
      <div className="flex items-end justify-between gap-4">
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          {showReadout && (
            <section
              aria-label="Physiological channels"
              className="w-64 rounded-md border border-white/10 bg-[#141112]/90 p-3 text-xs text-stone-300"
            >
              <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="font-medium text-stone-200">Physiological Channels</span>
                <span className="text-stone-400">{ZONE_LABELS[activeZone]}</span>
              </div>

              <dl className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <dt className="text-stone-400">Vasocongestion</dt>
                  <dd className="font-mono-tabular text-stone-200">{pct(physiology.congestion)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-stone-400">External swelling</dt>
                  <dd className="font-mono-tabular text-stone-200">{pct(externalSwelling)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-stone-400">Introitus swelling</dt>
                  <dd className="font-mono-tabular text-stone-200">{pct(introitusSwelling)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-stone-400">Moisture</dt>
                  <dd className="font-mono-tabular text-stone-200">{pct(physiology.moisture)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-stone-400">Arousal</dt>
                  <dd className="font-mono-tabular text-stone-200">{pct(physiology.arousal)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-stone-400">Discomfort</dt>
                  <dd className={`font-mono-tabular ${physiology.discomfort > 0.25 ? 'text-amber-300' : 'text-stone-200'}`}>
                    {pct(physiology.discomfort)}
                  </dd>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 pt-1.5">
                  <dt className="text-stone-400">Respiration</dt>
                  <dd className="font-mono-tabular text-stone-300">
                    {physiology.breathRateBpm.toFixed(1)} bpm
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-stone-400">Skene&apos;s releases</dt>
                  <dd className="font-mono-tabular text-stone-300">{physiology.emissionCount}</dd>
                </div>
              </dl>
            </section>
          )}

          {/* Quiet clinical Arousal Threshold indicator (non-glowing hairline bar) */}
          <div className="w-60 rounded-md border border-white/10 bg-[#141112]/85 px-2.5 py-2">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-medium text-stone-300">
                {peakActive ? "Skene's Gland Release" : 'Arousal Meter'}
              </span>
              <span className="font-mono-tabular text-stone-300">{meterPct}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Arousal meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={meterPct}
              className="h-1.5 w-full overflow-hidden rounded-sm bg-white/10"
            >
              <div
                className={`h-full transition-[width] duration-150 ${
                  peakActive ? 'bg-rose-300/85' : 'bg-rose-400/65'
                }`}
                style={{ width: `${meterPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-stone-400">
              <span>Swelling {pct(Math.max(introitusSwelling, externalSwelling))}</span>
              <span>
                {peakActive
                  ? 'Contractions: Peak'
                  : physiology.arousal > 0.4
                    ? 'Contractions: Active'
                    : `Releases: ${physiology.emissionCount}`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleReadout}
            aria-expanded={showReadout}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400 ${
              showReadout
                ? 'border-stone-400/50 bg-stone-200/12 text-stone-100'
                : 'border-white/10 bg-[#141112]/80 text-stone-300 hover:border-white/20 hover:text-stone-100'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Physiology Readout</span>
          </button>
        </div>

        <p className="hidden text-xs text-stone-500 sm:block">
          Drag vertical rod or guide with Arrow / WASD · Q/E to tilt · Shift/scroll for force
        </p>
      </div>
    </div>
  );
}
