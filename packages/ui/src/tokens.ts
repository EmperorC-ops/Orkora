/**
 * Brand color ramp + dark surface tokens for Orkora.
 * Derived from /packages/theme/colors.ts; this file shapes the ramp Tailwind
 * needs while @orkora/theme is the canonical primary/surface palette.
 *
 * Web consumers reach these via Tailwind; mobile consumers import directly
 * (or pull from @orkora/theme).
 */
export const brand = {
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
} as const;

export const surface = {
  background: '#0F1222',
  surface: '#1A1F3A',
  border: '#252B4A',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A4C0',
} as const;

export const status = {
  success: '#00C896',
  error: '#FF7675',
  warning: '#F0B429',
  info: '#3B82F6',
} as const;

export const gradient = {
  brand: ['#6C5CE7', '#4B3FCF'] as const,
};

export const font = {
  sans: 'Inter, system-ui, -apple-system, sans-serif',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;
