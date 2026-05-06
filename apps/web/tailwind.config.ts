import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Orkora primary ramp - derived from #6C5CE7 (theme primary).
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
        // Dark surface tokens (mirror @orkora/theme).
        surface: {
          DEFAULT: '#1A1F3A',
          deep: '#0F1222',
          raised: '#252B4A',
          border: '#2E3454',
        },
        ink: {
          primary: '#FFFFFF',
          secondary: '#A0A4C0',
          muted: '#6B7090',
        },
        ok: '#00C896',
        danger: '#FF7675',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(140deg, #6C5CE7 0%, #4B3FCF 100%)',
        'app-gradient': 'radial-gradient(circle at 20% 0%, #1A1F3A 0%, #0F1222 60%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        glow: '0 18px 60px -16px rgba(108, 92, 231, 0.45)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
