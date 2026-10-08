/** Difficulty of a saved opponent (the bot levels of `GET /api/meta`). */
import type { BotLevelValue } from '@colleja/protocol';
import { Field, Select } from '../../../components/ui';
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
    <Field label="Dificultad" className="w-36">
      <Select
        value={value}
        title={description}
        onChange={(event) => onChange(Number(event.target.value) as BotLevelValue)}
      >
        {levels.map((level) => (
          <option key={level} value={level}>
            {botLevelName(meta, level)}
          </option>
        ))}
      </Select>
    </Field>
  );
}
