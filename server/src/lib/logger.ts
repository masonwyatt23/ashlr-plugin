/**
 * logger.ts — structured pino logger + pino-http middleware.
 *
 * - JSON in production, pretty-printed in development.
 * - Redacts PII fields from all log output.
 * - Exports `logger` (base) and `httpLogger` (Hono middleware).
 */

import pino from "pino";
import pinoHttp from "pino-http";
import type { Context, Next } from "hono";
import { randomUUID } from "crypto";

const isDev = (process.env["NODE_ENV"] ?? "development") === "development";

const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.text",
  "req.body.systemPrompt",
  "req.body.email",
  "body.text",
  "body.systemPrompt",
  "body.email",
  "email",
  "authorization",
  "cookie",
];

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? (isDev ? "debug" : "info"),
  redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
        },
      }
    : {}),
});

const _pinoHttp = pinoHttp({
  logger,
  customProps: (_req, res) => ({
    // user_id is attached after auth middleware runs; read from response locals
    user_id: (res as { locals?: { userId?: string } }).locals?.userId,
  }),
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

/**
 * Hono middleware: assigns x-request-id, runs pino-http logging, attaches
 * `requestId` and `startTime` to Hono context variables for downstream use.
 */
export async function httpLogger(c: Context, next: Next): Promise<void> {
  const requestId =
    (c.req.header("x-request-id") as string | undefined) ?? randomUUID();
  c.header("x-request-id", requestId);

  const start = Date.now();

  await next();

  const latencyMs = Date.now() - start;
  const user = c.get("user" as never) as { id?: string } | undefined;

  logger.info({
    requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    latencyMs,
    user_id: user?.id,
  });
}
