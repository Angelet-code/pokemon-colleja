import type { ApiError } from '@colleja/protocol';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

/** Validates a JSON body (or params); on failure answers 400 with the problems and returns `null`. */
export function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
  reply: FastifyReply,
): z.infer<T> | null {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const error: ApiError = {
    error: 'Petición no válida.',
    details: result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'cuerpo'}: ${issue.message}`,
    ),
  };
  reply.code(400).send(error);
  return null;
}

/** Answers 404 with a Spanish message. */
export function notFound(reply: FastifyReply, message: string): FastifyReply {
  const error: ApiError = { error: message };
  return reply.code(404).send(error);
}
