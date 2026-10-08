/** Showdown export text in and out of the editor (whole team or one Pokémon). */
import { type ReactNode, useId, useState } from 'react';
import { Dialog } from '../../../components/Dialog';
import { IconCheck, IconCopy } from '../../../components/icons';
import { Button, Notice, textareaClass } from '../../../components/ui';

export function ExportDialog({
  title,
  text,
  onClose,
}: {
  title: string;
  text: string;
  onClose: () => void;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cerrar</Button>
          <Button variant="primary" onClick={copy}>
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </>
      }
    >
      <label htmlFor={id} className="sr-only">
        Formato de Showdown
      </label>
      <textarea
        id={id}
        readOnly
        value={text}
        rows={16}
        onFocus={(event) => event.target.select()}
        className={textareaClass}
      />
    </Dialog>
  );
}

export function ImportDialog({
  title,
  hint,
  onImport,
  onClose,
  confirmLabel = 'Importar',
  children,
}: {
  title: string;
  hint: string;
  /** Returns problems to show (the dialog stays open) or nothing to close it. */
  onImport: (text: string) => string[] | undefined | Promise<string[] | undefined>;
  onClose: () => void;
  confirmLabel?: string;
  /** Extra fields above the text (name, mode…). */
  children?: ReactNode;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const result = await onImport(text);
    setBusy(false);
    if (result && result.length > 0) setProblems(result);
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={!text.trim() || busy}>
            {busy ? 'Importando…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {children}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="eyebrow text-faint">
            {hint}
          </label>
          <textarea
            id={id}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={14}
            spellCheck={false}
            className={textareaClass}
          />
        </div>
        {problems.length > 0 && <Notice items={problems} />}
      </div>
    </Dialog>
  );
}
