import {
  Volume2,
  VolumeX,
  RotateCcw,
  Tag,
  SlidersHorizontal,
  Play,
  Pause,
} from 'lucide-react';
import { CADENCE_PRESETS } from '../simulation/tools';
import type { AnatomicalZone, AutoCycleConfig, CadencePreset, PhysiologicalState } from '../simulation/types';

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

const PRESET_ORDER: CadencePreset[] = ['slow', 'harmonious', 'fast'];

export type AppViewMode = 'anima' | 'split' | 'studio';

interface StudioOverlayProps {
  showLabels: boolean;
  onToggleLabels: () => void;
  autoCycle: AutoCycleConfig;
  onToggleAutoCycle: () => void;
  onSelectCadencePreset: (preset: CadencePreset) => void;
  onChangeCycleRate: (rateHz: number) => void;
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
  viewMode?: AppViewMode;
  onChangeViewMode?: (mode: AppViewMode) => void;
}

export function StudioOverlay({
  showLabels,
  onToggleLabels,
  autoCycle,
  onToggleAutoCycle,
  onSelectCadencePreset,
  onChangeCycleRate,
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
  viewMode,
  onChangeViewMode,
}: StudioOverlayProps) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const meterPct = Math.round(physiology.peakProgress * 100);
  const peakActive = physiology.peakReleaseTimer > 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3.5 sm:p-5">
      {/* Top Bar: Clean cyclic member cadence & simulator controls */}
      <header className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="pointer-events-auto flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Auto Play / Pause Toggle */}
            <button
              type="button"
              onClick={onToggleAutoCycle}
              aria-pressed={autoCycle.enabled}
              className={`font-arabic inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 ${
                autoCycle.enabled
                  ? 'border-rose-400/50 bg-rose-400/15 text-rose-100'
                  : 'border-white/10 bg-[#141112]/85 text-stone-300 hover:border-white/20 hover:text-stone-100'
              }`}
            >
              {autoCycle.enabled ? (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{autoCycle.enabled ? 'تلقائي نشط' : 'تشغيل تلقائي'}</span>
            </button>

            {/* Cadence Mode Presets: بطيء · متناغم · سريع */}
            <div
              dir="rtl"
              role="group"
              aria-label="نمط الحركة التلقائية"
              className="font-arabic flex items-center rounded-md border border-white/10 bg-[#141112]/85 p-0.5"
            >
              {PRESET_ORDER.map((presetId) => {
                const spec = CADENCE_PRESETS[presetId];
                const active = autoCycle.preset === presetId;
                return (
                  <button
                    key={presetId}
                    type="button"
                    onClick={() => onSelectCadencePreset(presetId)}
                    aria-pressed={active}
                    className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-200 ${
                      active
                        ? 'bg-amber-200/20 text-amber-100'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {spec.labelAr}
                  </button>
                );
              })}
            </div>

            {/* Adjustable Cycle Rate (Hz) */}
            <div
              dir="rtl"
              className="font-arabic flex items-center gap-2 rounded-md border border-white/10 bg-[#141112]/85 px-2.5 py-1 text-xs text-stone-300"
            >
              <label htmlFor="cycle-rate-slider" className="whitespace-nowrap text-stone-400">
                المعدل
              </label>
              <input
                id="cycle-rate-slider"
                type="range"
                min={20}
                max={220}
                value={Math.round(autoCycle.rateHz * 100)}
                onChange={(e) => onChangeCycleRate(Number(e.target.value) / 100)}
                aria-label="معدل الحركة"
                className="h-1.5 w-20 cursor-pointer accent-rose-400 sm:w-24"
              />
              <span className="font-mono-tabular w-11 text-left text-[11px] text-stone-200">
                {autoCycle.rateHz.toFixed(2)}Hz
              </span>
            </div>

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
              <span>Labels</span>
            </button>

            <button
              type="button"
              onClick={onReset}
              aria-label="Reset simulation"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-[#141112]/80 px-2.5 py-1.5 text-xs font-medium text-stone-300 whitespace-nowrap shrink-0 transition-colors hover:border-white/20 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Top-Right: View Switcher, Touch Pressure & Audio Toggle */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          {viewMode && onChangeViewMode && (
            <div
              dir="rtl"
              role="group"
              aria-label="وضع العرض"
              className="font-arabic flex items-center rounded-md border border-amber-100/15 bg-[#141112]/90 p-0.5"
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
                    onClick={() => onChangeViewMode(item.id)}
                    aria-pressed={active}
                    className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-200 ${
                      active
                        ? 'bg-amber-200/20 text-amber-100'
                        : 'text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
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
          Drag member or Arrow/WASD · Q/E tilt · Scroll force
        </p>
      </div>
    </div>
  );
}
