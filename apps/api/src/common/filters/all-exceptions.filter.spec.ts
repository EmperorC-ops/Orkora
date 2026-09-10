import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

jest.mock('@sentry/node', () => ({
  withScope: jest.fn(),
  captureException: jest.fn(),
  setTag: jest.fn(),
}));

/**
 * The filter is the single outer error boundary. Two properties matter:
 *
 *  1. Author-attached fields on an HttpException payload reach the client as
 *     RFC 7807 extension members. Without this, structured validation feedback
 *     is silently discarded and every 400 looks identical to the caller.
 *  2. Untyped Errors never contribute anything to the wire beyond a fixed
 *     message, because their payloads can carry secrets or PII.
 */
function makeHost(url = '/v1/organizations/org_1/events/evt_1/story', method = 'PATCH') {
  const json = jest.fn();
  const type = jest.fn().mockReturnValue({ json });
  const status = jest.fn().mockReturnValue({ type });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url, method }),
    }),
  };
  return { host: host as never, status, type, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // Silence both levels by default. Tests that assert on logging re-spy and
    // get the same mock; a fresh filter per test means a fresh call list. Left
    // unmocked, the three tests that only exercise the response body would
    // print real warnings and teach everyone to ignore this suite's output.
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  });

  it('forwards author-attached fields as problem+json extension members', () => {
    const { host, status, json } = makeHost();

    filter.catch(
      new BadRequestException({
        message: 'Invalid story composition',
        errors: [{ blockIndex: 1, field: 'variant', code: 'invalid_type', detail: 'Expected string, received null' }],
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        title: 'Bad Request',
        detail: 'Invalid story composition',
        errors: [
          { blockIndex: 1, field: 'variant', code: 'invalid_type', detail: 'Expected string, received null' },
        ],
      }),
    );
  });

  it('does not leak Nest internals as extension members', () => {
    const { host, json } = makeHost();

    filter.catch(new BadRequestException('Every event page needs a way to buy tickets.'), host);

    const payload = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.detail).toBe('Every event page needs a way to buy tickets.');
    expect(payload).not.toHaveProperty('statusCode');
    expect(payload).not.toHaveProperty('error');
    expect(payload).not.toHaveProperty('message');
  });

  it('never lets an author override the envelope members', () => {
    const { host, json } = makeHost();

    filter.catch(
      new BadRequestException({
        message: 'real detail',
        status: 200,
        instance: '/somewhere-else',
        title: 'Not A Real Title',
      }),
      host,
    );

    const payload = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.status).toBe(400);
    expect(payload.title).toBe('Bad Request');
    expect(payload.instance).toBe('/v1/organizations/org_1/events/evt_1/story');
    expect(payload.detail).toBe('real detail');
  });

  it('replaces an untyped Error with a generic message and no extensions', () => {
    const { host, json } = makeHost();

    filter.catch(new Error('sk_live_abc123 leaked in a provider error'), host);

    const payload = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.status).toBe(500);
    expect(payload.detail).toBe('An unexpected error occurred. Please try again in a moment.');
    expect(Object.keys(payload).sort()).toEqual(['detail', 'instance', 'status', 'title', 'type']);
  });

  it('logs a 400 so a broken contract cannot fail silently for weeks', () => {
    const warn = jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    const { host } = makeHost();

    filter.catch(new BadRequestException('Invalid story composition'), host);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        method: 'PATCH',
        path: '/v1/organizations/org_1/events/evt_1/story',
      }),
      expect.any(String),
    );
  });

  it('never logs a request body, which can carry PII', () => {
    const warn = jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    const { host } = makeHost();

    filter.catch(
      new BadRequestException({ message: 'Invalid story composition', errors: [{ blockIndex: 0 }] }),
      host,
    );

    const logged = warn.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(logged).toBeDefined();
    expect(Object.keys(logged ?? {}).sort()).toEqual(['method', 'path', 'status']);
  });

  it('stays quiet for expected client failures', () => {
    const warn = jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    const { host } = makeHost();

    filter.catch(new UnauthorizedException(), host);
    filter.catch(new NotFoundException(), host);

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not treat a thrown HttpException string payload as an object', () => {
    const { host, json } = makeHost();

    filter.catch(new InternalServerErrorException('boom'), host);

    const payload = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.detail).toBe('boom');
    expect(payload).not.toHaveProperty('errors');
  });
});
