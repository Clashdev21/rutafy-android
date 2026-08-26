import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader, AppInput, AppText } from '@/components/ui';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyCard } from '@/components/rutafy/RutafyCard';
import { RutafyColors } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import * as authService from '@/services/authService';
import type { AuthUser } from '@/types/auth';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { isTransientNetworkError, NETWORK_UNAVAILABLE_MESSAGE } from '@/utils/networkErrors';
import {
  buildProfileUpdatePayload,
  localProfileErrorMessage,
  mapProfileApiErrorMessage,
  profileFormFromUser,
  validateProfileFormLocal,
  type ProfileFormValues,
} from '@/utils/profileEditing';

type Props = {
  user: AuthUser | null;
  onCancel: () => void;
  /** Tras PATCH + refresh exitoso. */
  onSuccess: (user: AuthUser) => void | Promise<void>;
};

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

export function EditProfileScreen({ user, onCancel, onSuccess }: Props) {
  const initial = useMemo(() => profileFormFromUser(user), [user]);
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues(profileFormFromUser(user));
  }, [user]);

  const phoneChanged =
    values.phone.trim() !== initial.phone.trim() && values.phone.trim().length > 0;

  const patch = useMemo(
    () => buildProfileUpdatePayload(initial, values),
    [initial, values],
  );
  const hasChanges = patch != null;

  const updateField = useCallback((key: keyof ProfileFormValues, text: string) => {
    setValues((prev) => ({ ...prev, [key]: text }));
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;

    const localError = validateProfileFormLocal(values, initial);
    if (localError) {
      setError(localProfileErrorMessage(localError));
      return;
    }

    const body = buildProfileUpdatePayload(initial, values);
    if (!body) {
      setError(localProfileErrorMessage('no_changes'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // No mutación optimista: espera confirmación server-side.
      const updated = await authService.updateProfile(body);
      await onSuccess(updated);
    } catch (e) {
      if (isTransientNetworkError(e)) {
        setError(NETWORK_UNAVAILABLE_MESSAGE);
      } else if (e instanceof Error && e.message === 'no_fields_to_update') {
        setError(localProfileErrorMessage('no_changes'));
      } else {
        setError(mapProfileApiErrorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  }, [saving, values, initial, onSuccess]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <AppHeader
          title="Editar perfil"
          subtitle="Nombre, teléfono y correo"
          right={
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              hitSlop={8}
              disabled={saving}
              style={styles.headerBtn}>
              <AppText variant="bodyMedium" color={colors.primary}>
                Cancelar
              </AppText>
            </Pressable>
          }
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            <RutafyCard style={styles.card}>
              <FieldLabel label="Nombre" />
              <AppInput
                value={values.name}
                onChangeText={(t) => updateField('name', t)}
                autoCapitalize="words"
                autoComplete="name"
                editable={!saving}
                accessibilityLabel="Nombre"
              />

              <FieldLabel label="Teléfono" />
              <AppInput
                value={values.phone}
                onChangeText={(t) => updateField('phone', t)}
                keyboardType="phone-pad"
                autoComplete="tel"
                editable={!saving}
                accessibilityLabel="Teléfono"
              />
              {phoneChanged ? (
                <Text style={styles.hint}>
                  Usarás este número la próxima vez que inicies sesión.
                </Text>
              ) : null}

              <FieldLabel label="Correo" />
              <AppInput
                value={values.email}
                onChangeText={(t) => updateField('email', t)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!saving}
                accessibilityLabel="Correo"
                placeholder="Opcional"
              />
            </RutafyCard>

            {error ? (
              <AppText variant="caption" color={colors.danger} style={styles.error}>
                {error}
              </AppText>
            ) : null}

            <RutafyButton
              label="Guardar cambios"
              loading={saving}
              disabled={saving || !hasChanges}
              onPress={() => void handleSave()}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1, paddingHorizontal: Spacing.four },
  flex: { flex: 1 },
  content: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  headerBtn: { paddingVertical: 4 },
  card: { gap: Spacing.two },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
    marginTop: Spacing.one,
  },
  hint: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  error: { marginTop: spacing.xs },
});
