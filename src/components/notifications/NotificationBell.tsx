import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { useUnreadNotificationCount } from '@/contexts/NotificationsInboxContext';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import { appRoleToMobileRole } from '@/utils/roles';
import { useAuth } from '@/auth/useAuth';

type Props = {
  href?: Href;
};

function formatBadge(count: number): string {
  if (count <= 0) return '';
  if (count > 9) return '9+';
  return String(count);
}

export function NotificationBell({ href }: Props) {
  const unreadCount = useUnreadNotificationCount();
  const { user } = useAuth();
  const badge = formatBadge(unreadCount);
  const role = user ? appRoleToMobileRole(user.appRole) : null;
  const target =
    href ??
    ((role === 'transportista'
      ? '/transportista/notificaciones'
      : '/mensajero/notificaciones') as Href);

  return (
    <Pressable
      onPress={() => router.push(target)}
      accessibilityRole="button"
      accessibilityLabel="Notificaciones"
      accessibilityHint={
        unreadCount > 0
          ? `Tienes ${unreadCount} notificaciones sin leer`
          : 'Abrir centro de notificaciones'
      }
      hitSlop={8}
      style={styles.wrap}>
      <AppIcon name="notifications" size={24} color={colors.navy} />
      {badge ? (
        <View style={styles.badge} accessibilityElementsHidden>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
});
