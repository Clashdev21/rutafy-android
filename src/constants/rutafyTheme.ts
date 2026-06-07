/** Identidad visual Rutafy — propuesta 4 (logística empresarial). */
export const RutafyBrandPalette = {
  greenPrimary: '#16A34A',
  greenAccent: '#86EFAC',
  grayDark: '#1F2937',
  backgroundLight: '#F8FAFC',
  white: '#FFFFFF',
} as const;

export const RutafyColors = {
  brand: RutafyBrandPalette.greenPrimary,
  brandLight: RutafyBrandPalette.greenAccent,
  brandDark: '#15803D',
  navy: RutafyBrandPalette.grayDark,
  navyDark: '#111827',
  loginBackground: RutafyBrandPalette.backgroundLight,
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  success: RutafyBrandPalette.greenPrimary,
  warning: '#F59E0B',
  danger: '#DC2626',
  white: RutafyBrandPalette.white,
  surface: RutafyBrandPalette.white,
  surfaceMuted: RutafyBrandPalette.backgroundLight,
  border: '#E2E8F0',
  borderMuted: '#CBD5E1',
  heroGlass: 'rgba(255,255,255,0.12)',
  heroGlassBorder: 'rgba(255,255,255,0.15)',
  brandTint: 'rgba(22,163,74,0.1)',
  brandTintBorder: 'rgba(22,163,74,0.25)',
  offerTimer: '#16A34A',
} as const;

export const RutafyTypography = {
  fontFamily: 'PlusJakartaSans_400Regular',
  fontFamilyMedium: 'PlusJakartaSans_500Medium',
  fontFamilySemiBold: 'PlusJakartaSans_600SemiBold',
  fontFamilyBold: 'PlusJakartaSans_700Bold',
  webFallback: 'Plus Jakarta Sans, system-ui, sans-serif',
} as const;

export const RutafyRadius = {
  card: 16,
  button: 12,
  pill: 999,
} as const;

export const RutafyShadow = {
  card: {
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

export const RutafyStackHeaderOptions = {
  headerStyle: { backgroundColor: RutafyColors.white },
  headerTintColor: RutafyColors.navy,
  headerTitleStyle: {
    fontFamily: RutafyTypography.fontFamilySemiBold,
    fontWeight: '600' as const,
    color: RutafyColors.navy,
    fontSize: 17,
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
