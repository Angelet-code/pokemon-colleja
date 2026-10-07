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
  totalStatPoints,
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

/** Bar scale: a final stat of this size fills the bar. */
const BAR_MAX = 250;

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
  const used = totalStatPoints(set.statPoints);
  const remaining = remainingStatPoints(set.statPoints, limits);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Stat Points</h3>
        <p className="text-xs text-muted" aria-live="polite">
          <span className={remaining === 0 ? 'font-semibold text-text' : ''}>
            Restantes: <output aria-label="Stat Points restantes">{remaining}</output>
          </span>{' '}
          · usados {used}/{limits.total} · máximo {limits.perStat} por stat
        </p>
      </div>
      <div
        className={`grid items-center gap-x-2 gap-y-1.5 text-sm ${
          megaStats
            ? 'grid-cols-[3rem_2rem_1fr_3.25rem_2.75rem_2.75rem]'
            : 'grid-cols-[3rem_2rem_1fr_3.25rem_2.75rem]'
        }`}
      >
        <span className="text-xs text-faint">Stat</span>
        <span className="text-right text-xs text-faint">Base</span>
        <span className="text-xs text-faint">Stat Points</span>
        <span aria-hidden="true" />
        <span className="text-right text-xs text-faint">Total</span>
        {megaStats && (
          <span
            className="text-right text-xs text-faint"
            title={`Stats de ${getName('species', mega ?? '', locale)}`}
          >
            Mega
          </span>
        )}
        {STAT_IDS.map((stat) => {
          const name = getName('stats', stat, locale);
          const nature = natureModifier(set.nature, stat);
          const tone = nature > 100 ? 'text-good' : nature < 100 ? 'text-bad' : '';
          const value = set.statPoints[stat];
          return (
            <StatRow
              key={stat}
              name={name}
              short={statShort(stat, locale)}
              tone={tone}
              arrow={nature > 100 ? '▲' : nature < 100 ? '▼' : ''}
              base={species.baseStats[stat]}
              value={value}
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
  const width = `${Math.min(100, (total / BAR_MAX) * 100)}%`;
  return (
    <>
      <span className={`font-medium ${tone}`} title={name}>
        {short}
        {arrow && <span className="ml-0.5 text-[10px]">{arrow}</span>}
      </span>
      <span className="text-right text-muted tabular-nums">{base}</span>
      <span className="relative flex items-center">
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          aria-label={`Stat Points de ${name}`}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full accent-[var(--accent)]"
        />
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        aria-label={`Stat Points de ${name} (número)`}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        onFocus={(event) => event.target.select()}
        className="w-full rounded-md border border-border bg-panel-2 px-1.5 py-0.5 text-right tabular-nums focus:border-accent focus:outline-none"
      />
      <span className="flex flex-col items-end">
        <output aria-label={`${name} final`} className={`font-semibold tabular-nums ${tone}`}>
          {total}
        </output>
        <span className="h-1 w-full overflow-hidden rounded bg-panel-3" aria-hidden="true">
          <span className="block h-full rounded bg-accent/70" style={{ width }} />
        </span>
      </span>
      {megaTotal !== undefined && (
        <output
          aria-label={`${name} final (Mega)`}
          title={megaBase !== undefined ? `Base ${megaBase}` : undefined}
          className={`text-right text-muted tabular-nums ${tone}`}
        >
          {megaTotal}
        </output>
      )}
    </>
  );
}

export function FieldProblems({ messages }: { messages: string[] }) {
  return (
    <ul className="space-y-0.5 text-xs text-bad" role="alert">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}
