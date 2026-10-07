/**
 * `@colleja/protocol`: messages between the web app and the server (PLAN §3.6), as zod
 * schemas plus inferred types. Browser-safe: shared by `apps/web` and `apps/server`.
 */
export * from './battle';
export * from './calc';
export * from './common';
export * from './opponents';
export * from './replays';
export * from './rest';
export * from './teams';

import { type ClientMessage, ClientMessageSchema } from './battle';

/** Parses a raw WebSocket payload from the client. Errors are in Spanish. */
export function parseClientMessage(
  raw: string,
): { ok: true; message: ClientMessage } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'El mensaje no es JSON válido.' };
  }
  const result = ClientMessageSchema.safeParse(data);
  if (result.success) return { ok: true, message: result.data };
  const issue = result.error.issues[0];
  const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  return {
    ok: false,
    error: `Mensaje no válido${where}: ${issue?.message ?? 'formato desconocido'}.`,
  };
}
