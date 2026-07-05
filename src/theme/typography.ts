import { TextStyle } from 'react-native';

import { colors } from '@/theme/colors';

export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 40,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  heading: {
    fontSize: 20,
    lineHeight: 28,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fontFamily.regular,
    fontWeight: '400',
    color: colors.text,
  },
  bodyMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    color: colors.text,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    fontWeight: '400',
    color: colors.subtitle,
  },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.subtitle,
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
