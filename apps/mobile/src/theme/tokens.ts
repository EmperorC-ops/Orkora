/**
 * Mobile design tokens. Re-exports the canonical Orkora palette from
 * @orkora/theme and adds mobile-specific gradient/radius/typography helpers.
 * Use these values, not raw hex strings, in components.
 *
 * `colors.slate` is a compat layer used by older screens. Prefer
 * background / surface / textPrimary / textSecondary in new code.
 */
import { colors as themeColors } from '@orkora/theme';

export const colors = {
  // Brand ramp around the canonical primary (#6C5CE7).
  brand: {
    50: '#F2F1FD',
    100: '#E5E3FB',
    200: '#C9C5F6',
    300: '#ACA6F1',
    400: '#8E84EC',
    500: '#6C5CE7',
    600: '#5A4ADC',
    700: '#4B3FCF',
    800: '#3D33A8',
    900: '#2D2680',
    950: '#1B1654',
  },
  // Dark surface tokens (canonical from @orkora/theme).
  background: themeColors.background,
  surface: themeColors.surface,
  surfaceRaised: '#252B4A',
  border: '#2E3454',
  textPrimary: themeColors.textPrimary,
  textSecondary: themeColors.textSecondary,
  textMuted: '#6B7090',
  // Status.
  success: themeColors.success,
  error: themeColors.error,
  warning: '#F0B429',
  // Compat layer for screens that have not migrated to the dark tokens yet.
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
  white: '#FFFFFF',
  black: '#000000',
  danger: themeColors.error,
} as const;

export const gradient = {
  brand: ['#6C5CE7', '#4B3FCF'] as const,
  appBackground: ['#1A1F3A', '#0F1222'] as const,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
};

export const typography = {
  display: { fontSize: 44, fontWeight: '800' as const, letterSpacing: -1 },
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
};
