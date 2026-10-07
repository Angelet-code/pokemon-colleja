/** Server metadata (`GET /api/meta`), fetched once and shared by every component. */
import type { BotLevelValue, MetaResponse } from '@colleja/protocol';
import { useEffect, useState } from 'react';
import { api } from './api';

let pending: Promise<MetaResponse> | null = null;
let loaded: MetaResponse | null = null;

/** `null` until the metadata arrives (or if the server is not reachable). */
export function useMeta(): MetaResponse | null {
  const [meta, setMeta] = useState(loaded);
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    pending ??= api.meta();
    pending
      .then((data) => {
        loaded = data;
        if (!cancelled) setMeta(data);
      })
      .catch(() => {
        // Let a later component try again.
        pending = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return meta;
}

/** Name of a bot level ("Táctico"), or "Nivel N" while the metadata is not there. */
export function botLevelName(meta: MetaResponse | null, level: BotLevelValue): string {
  return meta?.botLevels.find((info) => info.level === level)?.name ?? `Nivel ${level}`;
}
