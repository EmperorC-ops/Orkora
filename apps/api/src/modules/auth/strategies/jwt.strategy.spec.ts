import { jwtKidFor } from './jwt.strategy';

/**
 * Tests for the `kid` computation used by the JWT key-rotation overlap.
 * The contract is:
 *   - Deterministic: same input bytes yield the same kid
 *   - Whitespace-insensitive: equivalent PEMs with different whitespace
 *     normalise to the same kid (so a tiny formatting difference between
 *     env var and signing key does not break verification)
 *   - 16 hex chars long (64 bits of identifier, enough to avoid collision
 *     within a deployment but short enough to log without noise)
 *   - Distinct keys produce distinct kids
 */
describe('jwtKidFor', () => {
  const keyA =
    '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAAAAAAA=\n-----END PUBLIC KEY-----';
  const keyB =
    '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBBBBBBB=\n-----END PUBLIC KEY-----';

  it('is deterministic for the same key', () => {
    expect(jwtKidFor(keyA)).toEqual(jwtKidFor(keyA));
  });

  it('is 16 hex characters', () => {
    const kid = jwtKidFor(keyA);
    expect(kid).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is whitespace-insensitive', () => {
    const noisy = keyA.replace(/\n/g, '\r\n   ');
    expect(jwtKidFor(keyA)).toEqual(jwtKidFor(noisy));
  });

  it('produces different kids for different keys', () => {
    expect(jwtKidFor(keyA)).not.toEqual(jwtKidFor(keyB));
  });
});
