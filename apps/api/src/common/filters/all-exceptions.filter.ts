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

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

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
        type: `https://api.orkora.io/problems/${status}`,
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
