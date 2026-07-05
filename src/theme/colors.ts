/** Paleta centralizada Rutafy — Sprint UI 1B */
export const colors = {
  primary: '#16A34A',
  primaryDark: '#15803D',
  primaryLight: '#86EFAC',

  navy: '#0F172A',
  navyMuted: '#1F2937',

  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',

  text: '#1F2937',
  textPrimary: '#0F172A',
  subtitle: '#64748B',

  border: '#E2E8F0',
  borderMuted: '#CBD5E1',

  danger: '#DC2626',
  warning: '#F59E0B',
  success: '#16A34A',

  white: '#FFFFFF',
  iconBackground: '#0F172A',
} as const;

export type AppColor = keyof typeof colors;
