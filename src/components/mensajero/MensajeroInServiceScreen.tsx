import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getServiceCode } from '@/components/mensajero/serviceDisplay';
import { RutafyButton } from '@/components/rutafy/RutafyButton';
import { RutafyColors, RutafyRadius } from '@/constants/rutafyTheme';
import { Spacing } from '@/constants/theme';
import * as mensajeroService from '@/services/mensajeroService';
import {
  uploadServiceEvidence,
  validateEvidenceAsset,
  type EvidenceImageAsset,
} from '@/services/evidenceService';
import type { Service } from '@/types/service';
import { getApiErrorMessage } from '@/utils/errors';
import { extractValidClosePinDigits } from '@/utils/transportistaClosePin';

type Props = {
  service: Service;
  actorId: string;
  disabled?: boolean;
  onCloseSuccess: () => void | Promise<void>;
};

function RouteBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.routeBlock}>
      <Text style={styles.routeLabel}>{label}</Text>
      <Text style={styles.routeValue}>{value}</Text>
    </View>
  );
}

function assetFromPicker(result: ImagePicker.ImagePickerResult): EvidenceImageAsset | null {
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const ext = asset.mimeType?.includes('png') ? 'png' : 'jpg';
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? `evidence-${Date.now()}.${ext}`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileSize: asset.fileSize ?? null,
  };
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function MensajeroInServiceScreen({
  service,
  actorId,
  disabled,
  onCloseSuccess,
}: Props) {
  const code = getServiceCode(service);
  const [closePin, setClosePin] = useState('');
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const [evidenceAsset, setEvidenceAsset] = useState<EvidenceImageAsset | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceSuccess, setEvidenceSuccess] = useState<string | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);

  const pinValid = closePin.trim().length === 4;
  const busy = closing || uploadingEvidence || pickingImage;
  const controlsDisabled = disabled || busy || !actorId;

  const clearEvidenceDraft = () => {
    setEvidenceAsset(null);
    setEvidenceError(null);
  };

  const handlePickCamera = async () => {
    setPickingImage(true);
    setEvidenceError(null);
    setEvidenceSuccess(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setEvidenceError('Se necesita permiso de cámara para tomar la foto.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      const picked = assetFromPicker(result);
      if (!picked) return;

      const validation = validateEvidenceAsset(picked);
      if (validation) {
        setEvidenceError(validation);
        return;
      }

      setEvidenceAsset(picked);
    } catch (e) {
      setEvidenceError(getApiErrorMessage(e, 'No se pudo abrir la cámara'));
    } finally {
      setPickingImage(false);
    }
  };

  const handlePickLibrary = async () => {
    setPickingImage(true);
    setEvidenceError(null);
    setEvidenceSuccess(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setEvidenceError('Se necesita permiso de galería para elegir la foto.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      const picked = assetFromPicker(result);
      if (!picked) return;

      const validation = validateEvidenceAsset(picked);
      if (validation) {
        setEvidenceError(validation);
        return;
      }

      setEvidenceAsset(picked);
    } catch (e) {
      setEvidenceError(getApiErrorMessage(e, 'No se pudo abrir la galería'));
    } finally {
      setPickingImage(false);
    }
  };

  const handleUploadEvidence = async () => {
    if (!evidenceAsset) {
      setEvidenceError('Selecciona o toma una foto antes de subir.');
      return;
    }

    setUploadingEvidence(true);
    setEvidenceError(null);
    setEvidenceSuccess(null);

    try {
      await uploadServiceEvidence({
        serviceId: service.service_id,
        actorId,
        asset: evidenceAsset,
      });
      setEvidenceSuccess('Evidencia subida correctamente.');
      clearEvidenceDraft();
    } catch (e) {
      setEvidenceError(getApiErrorMessage(e, 'No se pudo subir la evidencia'));
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleClose = async () => {
    const pin = extractValidClosePinDigits(closePin.trim());
    if (!pin) {
      setCloseError('Ingresa un PIN de cierre de 4 dígitos.');
      return;
    }

    setClosing(true);
    setCloseError(null);

    try {
      await mensajeroService.closeService(service.service_id, {
        actor_role: 'mensajero',
        actor_id: actorId,
        messenger_id: actorId,
        close_pin: pin,
      });
      setClosePin('');
      await onCloseSuccess();
    } catch (e) {
      const msg = getApiErrorMessage(e, 'No se pudo cerrar el servicio');
      if (msg === 'invalid_close_pin') {
        setCloseError('PIN incorrecto.');
      } else {
        setCloseError(msg);
      }
    } finally {
      setClosing(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>En ruta</Text>
          </View>
          <Text style={styles.headerTitle}>Servicio en curso</Text>
          <Text style={styles.headerSubtitle}>
            Sube evidencia de entrega y finaliza con el PIN del transportista
          </Text>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled">
        <View style={styles.codeRow}>
          <Text style={styles.codeLabel}>Código</Text>
          <Text style={styles.codeValue}>{code}</Text>
        </View>
        <RouteBlock label="RECOGER EN" value={service.origin} />
        <RouteBlock label="ENTREGAR EN" value={service.destination} />

        <View style={styles.evidenceCard}>
          <Text style={styles.sectionTitle}>Evidencia de entrega</Text>
          <Text style={styles.sectionHint}>
            Opcional antes del cierre. Usa la cámara del dispositivo en Expo Go.
          </Text>

          <View style={styles.pickRow}>
            <Pressable
              style={[styles.pickBtn, controlsDisabled && styles.pickBtnDisabled]}
              onPress={() => void handlePickCamera()}
              disabled={controlsDisabled}>
              <Text style={styles.pickBtnText}>Tomar foto</Text>
            </Pressable>
            <Pressable
              style={[styles.pickBtn, controlsDisabled && styles.pickBtnDisabled]}
              onPress={() => void handlePickLibrary()}
              disabled={controlsDisabled}>
              <Text style={styles.pickBtnText}>Elegir de galería</Text>
            </Pressable>
          </View>

          {evidenceAsset ? (
            <View style={styles.previewWrap}>
              <Image
                source={{ uri: evidenceAsset.uri }}
                style={styles.previewImage}
                contentFit="cover"
              />
              <View style={styles.previewMeta}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {evidenceAsset.fileName}
                </Text>
                {evidenceAsset.fileSize ? (
                  <Text style={styles.previewSize}>{formatFileSize(evidenceAsset.fileSize)}</Text>
                ) : null}
              </View>
              <Pressable onPress={clearEvidenceDraft} disabled={busy}>
                <Text style={styles.removePreview}>Quitar imagen</Text>
              </Pressable>
            </View>
          ) : null}

          {evidenceError ? <Text style={styles.errorText}>{evidenceError}</Text> : null}
          {evidenceSuccess ? <Text style={styles.successText}>{evidenceSuccess}</Text> : null}

          <RutafyButton
            label={uploadingEvidence ? 'Subiendo…' : 'Subir evidencia'}
            variant="secondary"
            onPress={() => void handleUploadEvidence()}
            disabled={!evidenceAsset || controlsDisabled}
            loading={uploadingEvidence}
          />
        </View>

        <View style={styles.pinSection}>
          <Text style={styles.pinLabel}>PIN de cierre</Text>
          <TextInput
            style={styles.pinInput}
            value={closePin}
            onChangeText={(text) => {
              setClosePin(text.replace(/\D/g, '').slice(0, 4));
              if (closeError) setCloseError(null);
            }}
            placeholder="••••"
            placeholderTextColor={RutafyColors.textSecondary}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            editable={!controlsDisabled}
            accessibilityLabel="PIN de cierre"
          />
          <Text style={styles.pinHint}>Solo dígitos. Lo recibes del transportista al entregar.</Text>
        </View>

        {closeError ? <Text style={styles.errorText}>{closeError}</Text> : null}
      </ScrollView>

      <SafeAreaView style={styles.footer} edges={['bottom', 'left', 'right']}>
        <RutafyButton
          label={closing ? 'Finalizando…' : 'Finalizar servicio'}
          onPress={() => void handleClose()}
          disabled={!pinValid || controlsDisabled}
          loading={closing}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: RutafyColors.surfaceMuted },
  safe: {
    borderBottomWidth: 1,
    borderBottomColor: RutafyColors.border,
    backgroundColor: RutafyColors.surface,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: RutafyColors.brandTint,
    borderRadius: RutafyRadius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RutafyColors.success,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.brand,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: RutafyColors.navy,
  },
  headerSubtitle: {
    fontSize: 14,
    color: RutafyColors.textSecondary,
    lineHeight: 20,
  },
  scroll: { flex: 1 },
  body: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: RutafyColors.surface,
    borderRadius: RutafyRadius.card,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    padding: Spacing.three,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  codeValue: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
    color: RutafyColors.navy,
  },
  routeBlock: { gap: Spacing.one },
  routeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  routeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.textPrimary,
    lineHeight: 22,
  },
  evidenceCard: {
    backgroundColor: RutafyColors.surface,
    borderRadius: RutafyRadius.card,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: RutafyColors.navy,
  },
  sectionHint: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  pickRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pickBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: RutafyColors.brand,
    borderRadius: RutafyRadius.button,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    backgroundColor: RutafyColors.brandTint,
  },
  pickBtnDisabled: { opacity: 0.5 },
  pickBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: RutafyColors.brand,
  },
  previewWrap: {
    gap: Spacing.two,
    borderRadius: RutafyRadius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: RutafyColors.border,
  },
  previewImage: {
    width: '100%',
    height: 200,
    backgroundColor: RutafyColors.surfaceMuted,
  },
  previewMeta: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: 2,
  },
  previewName: {
    fontSize: 13,
    color: RutafyColors.textPrimary,
  },
  previewSize: {
    fontSize: 12,
    color: RutafyColors.textSecondary,
  },
  removePreview: {
    fontSize: 13,
    fontWeight: '600',
    color: RutafyColors.brand,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  pinSection: { gap: Spacing.two },
  pinLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: RutafyColors.textSecondary,
    textTransform: 'uppercase',
  },
  pinInput: {
    backgroundColor: RutafyColors.surface,
    borderWidth: 1,
    borderColor: RutafyColors.border,
    borderRadius: RutafyRadius.button,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 8,
    textAlign: 'center',
    color: RutafyColors.navy,
  },
  pinHint: {
    fontSize: 13,
    color: RutafyColors.textSecondary,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 14,
    color: RutafyColors.danger,
    fontWeight: '500',
  },
  successText: {
    fontSize: 14,
    color: RutafyColors.success,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: RutafyColors.border,
    backgroundColor: RutafyColors.surface,
  },
});
