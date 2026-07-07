/**
 * In-memory stash for pending-signup data during the signup -> OTP flow.
 *
 * The password (and other signup fields) must NOT travel through
 * expo-router navigation params: route params are serialized into
 * navigation state, crash logs, and deep-link URLs. Because the
 * signup -> OTP flow always stays within a single app session, an
 * in-memory holder is sufficient and never touches disk (unlike
 * AsyncStorage, which stores plaintext).
 */

export interface PendingSignup {
  fullName: string;
  phone?: string;
  password: string;
}

let pending: PendingSignup | null = null;

/** Stash the pending-signup data before navigating to the OTP screen. */
export function setPendingSignup(data: PendingSignup): void {
  pending = data;
}

/** Return the pending-signup data and clear it. Returns null if absent. */
export function takePendingSignup(): PendingSignup | null {
  const data = pending;
  pending = null;
  return data;
}

/** Drop any stashed pending-signup data. */
export function clearPendingSignup(): void {
  pending = null;
}
