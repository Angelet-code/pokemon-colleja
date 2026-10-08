/**
 * `@colleja/protocol`: messages between the web app and the server (PLAN §3.6), as zod
 * schemas plus inferred types. Browser-safe: shared by `apps/web` and `apps/server`.
 */
export * from './battle';
export * from './bench';
export * from './calc';
export * from './common';
export * from './opponents';
export * from './replays';
export * from './rest';
export * from './teams';

import type { z } from 'zod';
import { type ClientMessage, ClientMessageSchema } from './battle';
import { type BenchClientMessage, BenchClientMessageSchema } from './bench';

export type ParsedMessage<T> = { ok: true; message: T } | { ok: false; error: string };

/** Parses a raw WebSocket payload from the battle client. Errors are in Spanish. */
export function parseClientMessage(raw: string): ParsedMessage<ClientMessage> {
  return parseMessage(ClientMessageSchema, raw);
}

/** Parses a raw WebSocket payload from the bench client. Errors are in Spanish. */
export function parseBenchClientMessage(raw: string): ParsedMessage<BenchClientMessage> {
  return parseMessage(BenchClientMessageSchema, raw);
}

function parseMessage<T>(schema: z.ZodType<T>, raw: string): ParsedMessage<T> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'El mensaje no es JSON válido.' };
  }
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, message: result.data };
  const issue = result.error.issues[0];
  const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  return {
    ok: false,
    error: `Mensaje no válido${where}: ${issue?.message ?? 'formato desconocido'}.`,
  };
}
