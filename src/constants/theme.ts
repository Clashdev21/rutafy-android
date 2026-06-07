/**
 * Tema base de la app (light/dark) + tipografía Rutafy.
 */

import '@/global.css';

import { Platform } from 'react-native';

import { RutafyBrandPalette, RutafyTypography } from '@/constants/rutafyTheme';

export const Colors = {
  light: {
    text: RutafyBrandPalette.grayDark,
    background: RutafyBrandPalette.backgroundLight,
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E2E8F0',
    textSecondary: '#64748B',
  },
  dark: {
    text: '#F8FAFC',
    background: '#111827',
    backgroundElement: '#1F2937',
    backgroundSelected: '#374151',
    textSecondary: '#94A3B8',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: RutafyTypography.fontFamily,
    serif: 'ui-serif',
    rounded: RutafyTypography.fontFamilyMedium,
    mono: 'ui-monospace',
  },
  android: {
    sans: RutafyTypography.fontFamily,
    serif: 'serif',
    rounded: RutafyTypography.fontFamilyMedium,
    mono: 'monospace',
  },
  default: {
    sans: RutafyTypography.fontFamily,
    serif: 'serif',
    rounded: RutafyTypography.fontFamilyMedium,
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
