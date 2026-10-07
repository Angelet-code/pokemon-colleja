/** Difficulty of a saved opponent (the bot levels of `GET /api/meta`). */
import type { BotLevelValue } from '@colleja/protocol';
import { botLevelName, useMeta } from '../../../lib/use-meta';

const LEVELS: BotLevelValue[] = [0, 1, 2];

export function BotLevelSelect({
  value,
  onChange,
}: {
  value: BotLevelValue;
  onChange: (level: BotLevelValue) => void;
}) {
  const meta = useMeta();
  const levels = meta?.botLevels.map((info) => info.level) ?? LEVELS;
  const description = meta?.botLevels.find((info) => info.level === value)?.description;
  return (
    <label className="flex flex-col gap-1" title={description}>
      <span className="text-xs font-medium text-muted">Dificultad</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value) as BotLevelValue)}
        className="rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm focus:border-accent focus:outline-none"
      >
        {levels.map((level) => (
          <option key={level} value={level}>
            {botLevelName(meta, level)} (nivel {level})
          </option>
        ))}
      </select>
    </label>
  );
}
