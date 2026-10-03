import { scrubCredentialUrl } from './app.module';

/**
 * Ticket codes and VIP tokens are bearer credentials that ride in request URLs.
 * scrubCredentialUrl masks them before the request line reaches the access log,
 * so a reusable credential is never written to log storage.
 */
describe('scrubCredentialUrl', () => {
  it('masks a ticket code in the path', () => {
    expect(scrubCredentialUrl('/v1/tickets/TKT-ABC123')).toBe('/v1/tickets/[redacted]');
  });

  it('masks a ticket code before a trailing path segment', () => {
    expect(scrubCredentialUrl('/v1/tickets/TKT-ABC123/share')).toBe(
      '/v1/tickets/[redacted]/share',
    );
  });

  it('keeps a trailing segment and drops only the code', () => {
    expect(scrubCredentialUrl('/v1/tickets/TKT-ABC123/card-analytics')).toBe(
      '/v1/tickets/[redacted]/card-analytics',
    );
  });

  it('masks the VIP/ticket token query param', () => {
    expect(scrubCredentialUrl('/v1/events/by-code/EVT1/vip?t=secret-token')).toBe(
      '/v1/events/by-code/EVT1/vip?t=[redacted]',
    );
  });

  it('masks a code query param while preserving other params', () => {
    expect(scrubCredentialUrl('/v1/something?code=abc&page=2')).toBe(
      '/v1/something?code=[redacted]&page=2',
    );
  });

  it('does not touch an event by-code path (not a ticket credential)', () => {
    expect(scrubCredentialUrl('/v1/events/by-code/EVT1')).toBe('/v1/events/by-code/EVT1');
  });

  it('passes through a url with no credentials', () => {
    expect(scrubCredentialUrl('/v1/health')).toBe('/v1/health');
  });

  it('passes through undefined', () => {
    expect(scrubCredentialUrl(undefined)).toBeUndefined();
  });
});
