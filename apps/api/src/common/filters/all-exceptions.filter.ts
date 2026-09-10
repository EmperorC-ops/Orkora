import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

/**
 * Translates every uncaught error into an RFC 7807 problem+json payload.
 * This is the single outer error boundary - no other code should format errors for the wire.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Wire-safe message: HttpExceptions are author-controlled and assumed safe.
    // Untyped Errors (provider SDKs throwing Stripe/Paystack/Flutterwave errors,
    // Prisma errors, programming bugs) can carry sensitive payload, including
    // partial API keys, internal SQL, or user PII. We never serialise raw
    // Error.message: the real text is captured below by the logger and Sentry,
    // and the caller gets a generic message instead.
    const message: string | object =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'An unexpected error occurred. Please try again in a moment.';

    if (status >= 500) {
      this.logger.error(
        { err: exception, path: req.url, method: req.method },
        'Unhandled exception',
      );
      // Report only true server-side errors to Sentry. 4xx are expected and
      // would just create noise. Tagging with the request id makes it
      // trivial to correlate Sentry issues with API logs.
      Sentry.withScope((scope) => {
        const requestId = (req as Request & { id?: string }).id;
        if (requestId) scope.setTag('request_id', requestId);
        scope.setTag('http.method', req.method);
        scope.setTag('http.path', req.url);
        Sentry.captureException(exception);
      });
    } else if (CONTRACT_VIOLATION_CODES.has(status)) {
      // A 400 or 422 means a caller sent something the API's own contract
      // rejects. From a first-party client that is a bug, not user error, and
      // it must be visible: Story Mode shipped with a DTO that destroyed every
      // payload, returned 400 on every save for weeks, and produced no server
      // signal at all because 4xx were unlogged. Path and method only; request
      // bodies can carry PII and never reach the log.
      this.logger.warn(
        { path: req.url, method: req.method, status },
        'Request rejected by the API contract',
      );
    }

    // RFC 7807 extension members. Only HttpException payloads reach this branch,
    // and those are author-controlled (see the note above), so any extra fields
    // an author attached are safe to put on the wire. Untyped Errors are
    // replaced by a fixed string before this point and can never contribute
    // extensions, so nothing sensitive leaks through here.
    const extensions =
      exception instanceof HttpException && typeof message === 'object' && message !== null
        ? extensionMembers(message as Record<string, unknown>)
        : {};

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://api.orkora.events/problems/${status}`,
        title: statusTitle(status),
        status,
        detail: typeof message === 'string' ? message : (message as { message?: string }).message,
        instance: req.url,
        ...extensions,
      });
  }
}

/**
 * Statuses that mean the caller violated the API's own contract, as opposed to
 * failing an expected check. 401, 403, 404 and 429 are ordinary traffic and
 * would only create noise; 400 and 422 should be near-zero in steady state, so
 * a sustained rate of them is a defect worth alerting on.
 */
const CONTRACT_VIOLATION_CODES = new Set([400, 422]);

function statusTitle(code: number): string {
  switch (code) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Unprocessable Entity';
    case 429:
      return 'Too Many Requests';
    default:
      return code >= 500 ? 'Internal Server Error' : 'Error';
  }
}

/**
 * Keys the problem+json envelope already owns, plus the three Nest adds to
 * every HttpException payload (`statusCode`, `error`, `message`). Everything
 * else an author attached is forwarded as an RFC 7807 extension member.
 */
const RESERVED_PROBLEM_KEYS = new Set([
  'statusCode',
  'error',
  'message',
  'type',
  'title',
  'status',
  'detail',
  'instance',
]);

function extensionMembers(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (RESERVED_PROBLEM_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}
