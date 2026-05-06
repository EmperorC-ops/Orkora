/**
 * Orkora color palette. Source of truth for both web (Tailwind tokens) and
 * mobile (StyleSheet). Keep keys in sync with apps/web/tailwind.config.ts.
 */
export const colors = {
  primary: '#6C5CE7',
  primaryDark: '#4B3FCF',
  background: '#0F1222',
  surface: '#1A1F3A',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A4C0',
  success: '#00C896',
  error: '#FF7675',
} as const;

export type ColorToken = keyof typeof colors;
