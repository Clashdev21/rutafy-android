import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import type { InboxNotification } from '@/types/notificationsInbox';
import {
  formatNotificationRelativeTime,
  getNotificationCategoryGlyph,
  getNotificationPriorityGlyph,
  isNotificationExpired,
  isNotificationUnread,
} from '@/utils/notificationFormatters';

type Props = {
  notification: InboxNotification;
  onPress: (notification: InboxNotification) => void;
};

function NotificationListItemComponent({ notification, onPress }: Props) {
  const unread = isNotificationUnread(notification);
  const expired = isNotificationExpired(notification);
  const hasNav = Boolean(notification.deep_link) || notification.event_type === 'dispatch_offer';

  return (
    <Pressable
      onPress={() => onPress(notification)}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'No leída. ' : ''}${notification.title}`}
      style={[styles.card, unread && styles.cardUnread]}>
      <View style={styles.leftCol}>
        <View style={[styles.dot, unread ? styles.dotUnread : styles.dotRead]} />
        <Text style={styles.glyph}>{getNotificationCategoryGlyph(notification.category)}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <AppText variant="bodyMedium" style={styles.title} numberOfLines={2}>
            {notification.title}
          </AppText>
          <Text style={styles.priority}>{getNotificationPriorityGlyph(notification.priority)}</Text>
        </View>
        <AppText variant="caption" color={colors.subtitle} numberOfLines={2}>
          {notification.body || 'Sin detalle'}
        </AppText>
        <View style={styles.metaRow}>
          <AppText variant="caption" color={colors.subtitle}>
            {formatNotificationRelativeTime(notification.created_at)}
          </AppText>
          {unread ? (
            <AppText variant="caption" color={colors.primaryDark}>
              No leída
            </AppText>
          ) : null}
          {expired ? (
            <View style={styles.expiredBadge}>
              <AppText variant="caption" color={colors.danger}>
                Expirada
              </AppText>
            </View>
          ) : null}
        </View>
      </View>

      {hasNav ? <AppIcon name="chevron_right" size={20} color={colors.subtitle} /> : null}
    </Pressable>
  );
}

export const NotificationListItem = memo(
  NotificationListItemComponent,
  (prev, next) =>
    prev.onPress === next.onPress &&
    prev.notification.notification_id === next.notification.notification_id &&
    prev.notification.read_at === next.notification.read_at &&
    prev.notification.opened_at === next.notification.opened_at &&
    prev.notification.status === next.notification.status &&
    prev.notification.title === next.notification.title &&
    prev.notification.body === next.notification.body &&
    prev.notification.priority === next.notification.priority &&
    prev.notification.created_at === next.notification.created_at &&
    prev.notification.expires_at === next.notification.expires_at &&
    prev.notification.deep_link === next.notification.deep_link,
);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardUnread: {
    backgroundColor: 'rgba(22,163,74,0.06)',
    borderColor: colors.primaryLight,
  },
  leftCol: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 28,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotUnread: {
    backgroundColor: colors.primary,
  },
  dotRead: {
    backgroundColor: colors.borderMuted,
  },
  glyph: {
    fontSize: 16,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
  },
  priority: {
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: 2,
  },
  expiredBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.button,
    backgroundColor: 'rgba(220,38,38,0.08)',
  },
});
