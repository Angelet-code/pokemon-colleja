/** Inline form to rename a replay: Enter saves, Escape cancels. */
import { type FormEvent, useState } from 'react';
import { Button, TextInput } from '../../components/ui';

/** Longest replay name (`ReplayContentSchema`). */
const MAX_NAME = 100;

export function RenameForm({
  name,
  onSave,
  onCancel,
}: {
  name: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const trimmed = value.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || saving) return;
    if (trimmed === name) return onCancel();
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex min-w-0 flex-1 items-center gap-1.5" onSubmit={submit}>
      <TextInput
        autoFocus
        aria-label="Nombre del replay"
        value={value}
        maxLength={MAX_NAME}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
        className="max-w-md font-display text-base font-semibold"
      />
      <Button type="submit" size="sm" variant="primary" disabled={!trimmed || saving}>
        Guardar
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  );
}
