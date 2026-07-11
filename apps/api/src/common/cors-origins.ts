/**
 * Parse the CORS allow-list from `CORS_ORIGINS` once, so the REST app
 * (`main.ts`) and the WebSocket gateway honour the exact same origins instead
 * of the gateway falling back to a wildcard. Trim and drop empties so a stray
 * space or trailing comma cannot silently break a real origin (a mismatch fails
 * closed: the browser blocks the response). Falls back to localhost for dev.
 *
 * Read straight from `process.env` (not ConfigService) because the
 * `@WebSocketGateway` decorator is evaluated at class-load time, before DI is
 * available - the same reason `main.ts` reads the raw env for its REST cors.
 */
export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
