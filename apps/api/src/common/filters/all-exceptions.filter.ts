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
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://api.orkora.events/problems/${status}`,
        title: statusTitle(status),
        status,
        detail: typeof message === 'string' ? message : (message as { message?: string }).message,
        instance: req.url,
      });
  }
}

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
