/**
 * Stat Points of a set: a slider and a number per stat (0–32, 66 in total), with the final
 * stats at level 50 computed live by `championsStats` (the same formula as the engine) and,
 * when the set holds its Mega Stone, the stats of the Mega Evolution too.
 */
import {
  championsStats,
  getStatPointLimits,
  natureModifier,
  type PokemonSet,
  remainingStatPoints,
} from '@colleja/core';
import {
  type GameMode,
  getName,
  getSpecies,
  type Locale,
  STAT_IDS,
  type StatId,
} from '@colleja/data';
import { statShort } from '@colleja/narration';
import type { CSSProperties } from 'react';

export function StatPointsEditor({
  set,
  mode,
  mega,
  locale,
  problems,
  onChange,
}: {
  set: PokemonSet;
  mode: GameMode;
  /** Mega Evolution reached with the held item, if any. */
  mega: string | null;
  locale: Locale;
  problems?: string[];
  onChange: (stat: StatId, value: number) => void;
}) {
  const limits = getStatPointLimits(mode);
  const species = getSpecies(set.species);
  if (!species) return null;
  const stats = championsStats(set);
  const megaStats = mega ? championsStats(set, { species: mega }) : null;
  const megaBase = mega ? getSpecies(mega)?.baseStats : undefined;
  const remaining = remainingStatPoints(set.statPoints, limits);
  const columns = megaStats
    ? 'grid-cols-[3rem_2.25rem_minmax(0,1fr)_2.75rem_2.75rem_2.75rem]'
    : 'grid-cols-[3rem_2.25rem_minmax(0,1fr)_2.75rem_2.75rem]';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <h3 className="eyebrow text-muted">Stat Points</h3>
        <p className="flex items-baseline gap-2" aria-live="polite">
          <output
            aria-label="Stat Points restantes"
            className={`display text-3xl tabular-nums ${remaining === 0 ? 'text-faint' : 'text-accent-fg'}`}
          >
            {remaining}
          </output>
          <span className="eyebrow text-faint">de {limits.total}</span>
        </p>
      </div>
      <div className={`grid items-center gap-x-3 gap-y-2 text-sm ${columns}`}>
        <span className="eyebrow text-faint">Stat</span>
        <span className="eyebrow text-right text-faint">Base</span>
        <span className="eyebrow text-faint">Puntos</span>
        <span aria-hidden="true" />
        <span className="eyebrow text-right text-faint">Total</span>
        {megaStats && (
          <span
            className="eyebrow text-right text-faint"
            title={`Stats de ${getName('species', mega ?? '', locale)}`}
          >
            Mega
          </span>
        )}
        {STAT_IDS.map((stat) => {
          const nature = natureModifier(set.nature, stat);
          return (
            <StatRow
              key={stat}
              name={getName('stats', stat, locale)}
              short={statShort(stat, locale)}
              tone={nature > 100 ? 'text-good' : nature < 100 ? 'text-bad' : ''}
              arrow={nature > 100 ? '+' : nature < 100 ? '−' : ''}
              base={species.baseStats[stat]}
              value={set.statPoints[stat]}
              max={limits.perStat}
              total={stats[stat]}
              megaTotal={megaStats?.[stat]}
              megaBase={megaBase?.[stat]}
              onChange={(next) => onChange(stat, next)}
            />
          );
        })}
      </div>
      {problems && problems.length > 0 && <FieldProblems messages={problems} />}
    </div>
  );
}

function StatRow({
  name,
  short,
  tone,
  arrow,
  base,
  value,
  max,
  total,
  megaTotal,
  megaBase,
  onChange,
}: {
  name: string;
  short: string;
  tone: string;
  arrow: string;
  base: number;
  value: number;
  max: number;
  total: number;
  megaTotal: number | undefined;
  megaBase: number | undefined;
  onChange: (value: number) => void;
}) {
  return (
    <>
      <span className={`font-display text-[15px] font-semibold uppercase ${tone}`} title={name}>
        {short}
        {arrow && <span className="ml-0.5">{arrow}</span>}
      </span>
      <span className="text-right font-display text-[15px] text-faint tabular-nums">{base}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        aria-label={`Stat Points de ${name}`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="range w-full"
        style={{ '--fill': `${(value / max) * 100}%` } as CSSProperties}
      />
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        aria-label={`Stat Points de ${name} (número)`}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        onFocus={(event) => event.target.select()}
        className="bare h-7 w-full rounded-xs border border-line bg-surface-2 px-1.5 text-right font-display text-[15px] font-semibold tabular-nums hover:border-line-strong focus:border-accent-fg focus:outline-none"
      />
      <output
        aria-label={`${name} final`}
        className={`text-right font-display text-lg font-bold tabular-nums ${tone}`}
      >
        {total}
      </output>
      {megaTotal !== undefined && (
        <output
          aria-label={`${name} final (Mega)`}
          title={megaBase !== undefined ? `Base ${megaBase}` : undefined}
          className={`text-right font-display text-lg font-semibold text-muted tabular-nums ${tone}`}
        >
          {megaTotal}
        </output>
      )}
    </>
  );
}

export function FieldProblems({ messages }: { messages: string[] }) {
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-bad" role="alert">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
