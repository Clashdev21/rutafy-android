import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/radius';
import { shadowStyles } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel: () => void;
  destructive?: boolean;
};

export function AppDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  destructive,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <AppText variant="heading">{title}</AppText>
          {message ? <AppText variant="body">{message}</AppText> : null}
          <View style={styles.actions}>
            <AppButton label={cancelLabel} variant="secondary" onPress={onCancel} />
            {onConfirm ? (
              <AppButton
                label={confirmLabel}
                variant={destructive ? 'danger' : 'primary'}
                onPress={onConfirm}
              />
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.bottomSheet,
    padding: spacing.xl,
    gap: spacing.base,
    ...shadowStyles.lg,
  },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
