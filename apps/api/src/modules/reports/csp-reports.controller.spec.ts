import * as Sentry from '@sentry/node';
import { CspReportsController } from './csp-reports.controller';

/**
 * The controller is small but easy to break: browsers send violations as
 * either the legacy `csp-report` envelope or the newer Reporting API array
 * shape. We exercise both, plus the no-op path for unknown payloads.
 */

jest.mock('@sentry/node', () => ({
  __esModule: true,
  ...jest.requireActual('@sentry/node'),
  captureMessage: jest.fn(),
}));

const captureMessage = Sentry.captureMessage as jest.Mock;

beforeEach(() => {
  captureMessage.mockClear();
});

describe('CspReportsController.report', () => {
  const ctrl = new CspReportsController();

  it('captures a legacy csp-report envelope as a Sentry warning', () => {
    ctrl.report({
      'csp-report': {
        'document-uri': 'https://app.orkora.events/dashboard',
        'violated-directive': "script-src 'self'",
        'effective-directive': "script-src 'self'",
        'blocked-uri': 'https://evil.example.com/x.js',
        disposition: 'enforce',
      },
    });
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      'csp_violation',
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ disposition: 'enforce' }),
      }),
    );
  });

  it('captures Reporting-API array entries', () => {
    ctrl.report([
      {
        type: 'csp-violation',
        age: 0,
        url: 'https://app.orkora.events/dashboard',
        body: {
          documentURL: 'https://app.orkora.events/dashboard',
          blockedURL: 'inline',
          effectiveDirective: 'script-src-elem',
          originalPolicy: "default-src 'self'",
          disposition: 'report',
        },
      },
    ]);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      'csp_violation',
      expect.objectContaining({
        tags: expect.objectContaining({
          directive: 'script-src-elem',
          disposition: 'report',
        }),
      }),
    );
  });

  it('ignores Reporting-API entries that are not csp-violation', () => {
    ctrl.report([
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: 'deprecation' as any,
        age: 0,
        url: 'https://x',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: {} as any,
      },
    ]);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('does nothing on an unknown payload shape', () => {
    ctrl.report({ junk: 'data' });
    expect(captureMessage).not.toHaveBeenCalled();
  });
});
