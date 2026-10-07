/** Imports Showdown text from a list page as a new saved team or opponent (name and mode). */
import type { GameMode } from '@colleja/data';
import { type ReactNode, useState } from 'react';
import { Segmented } from '../../../components/ui';
import { ApiRequestError } from '../../../lib/api';
import { useSetup } from '../../setup/setup-store';
import { ImportDialog } from './TextDialogs';

export interface ImportRequest {
  text: string;
  name: string;
  mode: GameMode;
}

export function ImportSavedDialog({
  title,
  defaultName,
  onImport,
  onClose,
  children,
}: {
  title: string;
  defaultName: string;
  /** Saves and opens the editor; throws on error (shown in the dialog). */
  onImport: (request: ImportRequest) => Promise<void>;
  onClose: () => void;
  /** Extra fields (e.g. the difficulty of an opponent). */
  children?: ReactNode;
}) {
  const [name, setName] = useState(defaultName);
  const [mode, setMode] = useState<GameMode>(useSetup.getState().mode);
  return (
    <ImportDialog
      title={title}
      hint="Export de Showdown (los EVs son Stat Points de Champions)."
      onClose={onClose}
      confirmLabel="Importar y editar"
      onImport={async (text) => {
        try {
          await onImport({ text, name, mode });
          return undefined;
        } catch (cause) {
          return cause instanceof ApiRequestError && cause.details.length > 0
            ? cause.details
            : [cause instanceof Error ? cause.message : String(cause)];
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-muted">Nombre</span>
          <input
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            className="rounded-lg border border-border bg-panel-2 px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <Segmented
          label="Modo preferido"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'singles', label: 'Individuales' },
            { value: 'doubles', label: 'Dobles' },
          ]}
        />
        {children}
      </div>
    </ImportDialog>
  );
}
