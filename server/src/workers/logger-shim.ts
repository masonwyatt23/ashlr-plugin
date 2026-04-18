/**
 * logger-shim.ts — Minimal logger for workers that avoids importing the full
 * pino-based logger (which pulls in Sentry and other heavy deps).
 */

export function logger(msg: string): void {
  process.stderr.write(msg + "\n");
}
