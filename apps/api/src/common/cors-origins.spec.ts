import { corsOrigins } from './cors-origins';

describe('corsOrigins', () => {
  const original = process.env.CORS_ORIGINS;
  afterEach(() => {
    if (original === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = original;
  });

  it('falls back to localhost when CORS_ORIGINS is unset', () => {
    delete process.env.CORS_ORIGINS;
    expect(corsOrigins()).toEqual(['http://localhost:3000']);
  });

  it('splits a comma list and trims whitespace', () => {
    process.env.CORS_ORIGINS = 'https://a.com, https://b.com';
    expect(corsOrigins()).toEqual(['https://a.com', 'https://b.com']);
  });

  it('drops empty entries from stray or trailing commas', () => {
    process.env.CORS_ORIGINS = 'https://a.com,, ,https://b.com,';
    expect(corsOrigins()).toEqual(['https://a.com', 'https://b.com']);
  });
});
