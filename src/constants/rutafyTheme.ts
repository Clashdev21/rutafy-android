export const RutafyColors = {
  brand: '#2A9D8F',
  brandDark: '#238b7e',
  navy: '#1E3A5F',
  navyDark: '#17304f',
  loginBackground: '#102033',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  white: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  border: '#E2E8F0',
  borderMuted: '#CBD5E1',
  heroGlass: 'rgba(255,255,255,0.12)',
  heroGlassBorder: 'rgba(255,255,255,0.15)',
  brandTint: 'rgba(42,157,143,0.1)',
  brandTintBorder: 'rgba(42,157,143,0.25)',
  offerTimer: '#3A86FF',
} as const;

export const RutafyRadius = {
  card: 16,
  button: 12,
  pill: 999,
} as const;

export const RutafyShadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

export const RutafyStatusBadgeColors: Record<string, { bg: string; text: string }> = {
  REQUESTED: { bg: '#FEF9C3', text: '#854D0E' },
  OFFERED: { bg: '#FFEDD5', text: '#9A3412' },
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
  SEARCHING: { bg: '#FFEDD5', text: '#9A3412' },
};
