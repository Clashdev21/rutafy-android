/**
 * Identidad visual Rutafy — reexporta el sistema centralizado (Sprint UI 1B).
 * Mantener imports existentes durante la migración gradual.
 */
import { colors as themeColors } from '@/theme/colors';
import { radius as themeRadius } from '@/theme/radius';
import { shadowStyles } from '@/theme/shadows';
import { fontFamily, typography } from '@/theme/typography';

export const RutafyBrandPalette = {
  greenPrimary: themeColors.primary,
  greenAccent: themeColors.primaryLight,
  grayDark: themeColors.navyMuted,
  backgroundLight: themeColors.background,
  white: themeColors.white,
} as const;

export const RutafyColors = {
  brand: themeColors.primary,
  brandLight: themeColors.primaryLight,
  brandDark: themeColors.primaryDark,
  navy: themeColors.navyMuted,
  navyDark: themeColors.navy,
  loginBackground: themeColors.background,
  textPrimary: themeColors.textPrimary,
  textSecondary: themeColors.subtitle,
  success: themeColors.success,
  warning: themeColors.warning,
  danger: themeColors.danger,
  white: themeColors.white,
  surface: themeColors.surface,
  surfaceMuted: themeColors.surfaceMuted,
  border: themeColors.border,
  borderMuted: themeColors.borderMuted,
  heroGlass: 'rgba(255,255,255,0.12)',
  heroGlassBorder: 'rgba(255,255,255,0.15)',
  brandTint: 'rgba(22,163,74,0.1)',
  brandTintBorder: 'rgba(22,163,74,0.25)',
  offerTimer: themeColors.primary,
} as const;

export const RutafyTypography = {
  fontFamily: fontFamily.regular,
  fontFamilyMedium: fontFamily.medium,
  fontFamilySemiBold: fontFamily.semiBold,
  fontFamilyBold: fontFamily.bold,
  webFallback: 'Plus Jakarta Sans, system-ui, sans-serif',
} as const;

export const RutafyRadius = {
  card: themeRadius.card,
  button: themeRadius.button,
  input: themeRadius.input,
  bottomSheet: themeRadius.bottomSheet,
  pill: themeRadius.pill,
} as const;

export const RutafyShadow = {
  card: shadowStyles.md,
} as const;

export const RutafyStackHeaderOptions = {
  headerStyle: { backgroundColor: RutafyColors.white },
  headerTintColor: RutafyColors.navy,
  headerTitleStyle: {
    fontFamily: typography.heading.fontFamily,
    fontWeight: '600' as const,
    color: RutafyColors.navy,
    fontSize: typography.heading.fontSize,
  },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: RutafyColors.surfaceMuted },
} as const;

export const RutafyStatusBadgeColors: Record<string, { bg: string; text: string }> = {
  REQUESTED: { bg: '#FEF9C3', text: '#854D0E' },
  OFFERED: { bg: '#DCFCE7', text: '#166534' },
  CLAIMED: { bg: '#DBEAFE', text: '#1E40AF' },
  STARTED: { bg: '#E0E7FF', text: '#3730A3' },
  CLOSED: { bg: '#DCFCE7', text: '#166534' },
  EXPIRED: { bg: '#F3F4F6', text: '#374151' },
  CANCELLED_BY_TRANSPORTER: { bg: '#FEE2E2', text: '#991B1B' },
  CANCELLED_BY_MESSENGER: { bg: '#FEE2E2', text: '#991B1B' },
  FAILED_PICKUP: { bg: '#FFEDD5', text: '#9A3412' },
  FAILED_DROPOFF: { bg: '#FFEDD5', text: '#9A3412' },
  NO_SHOW: { bg: '#F3F4F6', text: '#374151' },
  PENDING: { bg: '#FEF9C3', text: '#854D0E' },
  SEARCHING: { bg: '#DCFCE7', text: '#166534' },
};
