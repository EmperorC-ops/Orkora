import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostmarkAuthGuard } from './postmark-auth.guard';

function ctx(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function guard(token: string | undefined): PostmarkAuthGuard {
  const config = { get: (k: string) => (k === 'POSTMARK_WEBHOOK_TOKEN' ? token : undefined) } as unknown as ConfigService;
  return new PostmarkAuthGuard(config);
}

describe('PostmarkAuthGuard', () => {
  it('admits when POSTMARK_WEBHOOK_TOKEN is unset (backwards compat)', () => {
    const g = guard(undefined);
    expect(g.canActivate(ctx({}))).toBe(true);
  });

  it('admits when POSTMARK_WEBHOOK_TOKEN is set and Basic Auth matches', () => {
    const g = guard('s3cr3t-token');
    const header = 'Basic ' + Buffer.from('postmark:s3cr3t-token').toString('base64');
    expect(g.canActivate(ctx({ authorization: header }))).toBe(true);
  });

  it('rejects when POSTMARK_WEBHOOK_TOKEN is set and header is missing', () => {
    const g = guard('s3cr3t-token');
    expect(g.canActivate(ctx({}))).toBe(false);
  });

  it('rejects a wrong password', () => {
    const g = guard('s3cr3t-token');
    const header = 'Basic ' + Buffer.from('postmark:wrong').toString('base64');
    expect(g.canActivate(ctx({ authorization: header }))).toBe(false);
  });

  it('rejects a malformed Authorization header', () => {
    const g = guard('s3cr3t-token');
    expect(g.canActivate(ctx({ authorization: 'Bearer foo' }))).toBe(false);
    expect(g.canActivate(ctx({ authorization: 'Basic %%%' }))).toBe(false);
  });

  it('accepts any username in the Basic Auth pair (only the password matters)', () => {
    const g = guard('s3cr3t-token');
    const header = 'Basic ' + Buffer.from('anything:s3cr3t-token').toString('base64');
    expect(g.canActivate(ctx({ authorization: header }))).toBe(true);
  });

  it('treats an empty/whitespace token env var as "not set"', () => {
    const g = guard('   ');
    expect(g.canActivate(ctx({}))).toBe(true);
  });
});
