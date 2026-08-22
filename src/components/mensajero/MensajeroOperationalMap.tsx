import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactElement,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { AppText } from '@/components/ui';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import {
  isValidMapCoordinate,
  type MapCoordinate,
  type OperationalMapMode,
} from '@/types/map';

/** Zoom urbano aproximado (~1.1 km de alto visible). */
const URBAN_LAT_DELTA = 0.012;
const URBAN_LNG_DELTA = 0.012;

export type MensajeroOperationalMapHandle = {
  recenter: () => void;
};

type Props = {
  messengerPosition?: MapCoordinate | null;
  origin?: MapCoordinate | null;
  destination?: MapCoordinate | null;
  mode?: OperationalMapMode;
  mapPaddingBottom?: number;
};

function regionAround(coord: MapCoordinate): Region {
  return {
    latitude: coord.latitude,
    longitude: coord.longitude,
    latitudeDelta: URBAN_LAT_DELTA,
    longitudeDelta: URBAN_LNG_DELTA,
  };
}

function MensajeroOperationalMapInner(
  {
    messengerPosition,
    origin,
    destination,
    mapPaddingBottom = 0,
  }: Props,
  ref: React.ForwardedRef<MensajeroOperationalMapHandle>,
): ReactElement {
  const mapRef = useRef<MapView | null>(null);
  const hasCenteredRef = useRef(false);

  const hasMessenger = isValidMapCoordinate(messengerPosition);
  const hasOrigin = isValidMapCoordinate(origin);
  const hasDestination = isValidMapCoordinate(destination);

  const messengerCoord = useMemo(
    () =>
      hasMessenger
        ? { latitude: messengerPosition.latitude, longitude: messengerPosition.longitude }
        : null,
    [hasMessenger, messengerPosition],
  );

  const animateToMessenger = useCallback(
    (durationMs: number) => {
      if (!isValidMapCoordinate(messengerPosition)) return;
      mapRef.current?.animateToRegion(regionAround(messengerPosition), durationMs);
    },
    [messengerPosition],
  );

  useImperativeHandle(
    ref,
    () => ({
      recenter: () => animateToMessenger(350),
    }),
    [animateToMessenger],
  );

  // Primer fix válido: centrar una sola vez. Fixes siguientes solo actualizan el marker.
  useEffect(() => {
    if (!hasMessenger) return;
    if (hasCenteredRef.current) return;
    hasCenteredRef.current = true;
    const t = setTimeout(() => animateToMessenger(350), 80);
    return () => clearTimeout(t);
  }, [hasMessenger, animateToMessenger]);

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        moveOnMarkerPress={false}
        mapPadding={{ top: 0, right: 0, bottom: mapPaddingBottom, left: 0 }}>
        {hasMessenger && messengerCoord ? (
          <Marker coordinate={messengerCoord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.messengerWrap}>
              <View style={styles.messengerHalo} />
              <View style={styles.messengerDot} />
            </View>
          </Marker>
        ) : null}

        {hasOrigin && origin ? (
          <Marker
            coordinate={{ latitude: origin.latitude, longitude: origin.longitude }}
            title="Recoger"
            pinColor={colors.primary}
            tracksViewChanges={false}
          />
        ) : null}

        {hasDestination && destination ? (
          <Marker
            coordinate={{ latitude: destination.latitude, longitude: destination.longitude }}
            title="Entregar"
            pinColor={colors.navy}
            tracksViewChanges={false}
          />
        ) : null}
      </MapView>

      {!hasMessenger ? (
        <View style={styles.waiting} pointerEvents="none">
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" style={styles.waitingText}>
            Esperando ubicación…
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export const MensajeroOperationalMap = memo(forwardRef(MensajeroOperationalMapInner));
MensajeroOperationalMap.displayName = 'MensajeroOperationalMap';

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.border,
  },
  waiting: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(248,250,252,0.55)',
  },
  waitingText: {
    color: colors.subtitle,
  },
  messengerWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messengerHalo: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(22, 163, 74, 0.22)',
  },
  messengerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 2.5,
    borderColor: colors.white,
  },
});
