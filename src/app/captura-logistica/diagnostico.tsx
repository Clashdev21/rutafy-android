import { type Href, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { useTrackingDiagnostics } from '@/hooks/useTrackingDiagnostics';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import type { DiagnosticIndicatorStatus, OverallDiagnosticStatus } from '@/types/trackingDiagnostics';
import {
  formatDiagnosticEventForOps,
  formatGapLive,
} from '@/utils/trackingDiagnosticFormatters';

function statusColor(status: OverallDiagnosticStatus): string {
  if (status === 'OPERANDO') return colors.primary;
  if (status === 'ATENCIÓN') return colors.warning;
  return colors.danger;
}

function indicatorLabel(status: DiagnosticIndicatorStatus): string {
  if (status === 'green') return 'OK';
  if (status === 'red') return 'FALLO';
  return '—';
}

function indicatorColor(status: DiagnosticIndicatorStatus): string {
  if (status === 'green') return colors.primary;
  if (status === 'red') return colors.danger;
  return colors.subtitle;
}

function SemaphoreRow({ label, status }: { label: string; status: DiagnosticIndicatorStatus }) {
  return (
    <View style={styles.semaphoreRow}>
      <View style={[styles.dot, { backgroundColor: indicatorColor(status) }]} />
      <AppText variant="body">{label}</AppText>
      <AppText variant="bodyMedium" style={{ color: indicatorColor(status) }}>
        {indicatorLabel(status)}
      </AppText>
    </View>
  );
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString();
}

export default function CapturaLogisticaDiagnosticoScreen() {
  const insets = useSafeAreaInsets();
  const {
    events,
    analysis,
    loading,
    exportDiagnostic,
    refresh,
  } = useTrackingDiagnostics(5000);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const payload = await exportDiagnostic();
      const message = JSON.stringify(payload, null, 2);
      await Share.share({ message, title: 'Rutafy tracking diagnostic' });
    } finally {
      setExporting(false);
    }
  }, [exportDiagnostic]);

  const overall = analysis?.overallStatus ?? 'ATENCIÓN';

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg },
      ]}>
      <AppCard style={[styles.heroCard, { borderColor: statusColor(overall) }]}>
        <AppText variant="overline">Estado general</AppText>
        <AppText variant="title" style={{ color: statusColor(overall) }}>
          {overall}
        </AppText>
        <AppText variant="caption" color={colors.subtitle}>
          Consola RCA — solo lectura; no modifica la captura.
        </AppText>
      </AppCard>

      {loading || !analysis ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <AppCard>
            <AppText variant="heading">Diagnóstico automático</AppText>
            <AppText variant="bodyMedium">
              Último evento: {analysis.lastEvent?.type ?? '—'}
            </AppText>
            {analysis.lastEvent ? (
              <AppText variant="caption" color={colors.subtitle}>
                {formatTime(analysis.lastEvent.timestamp)}
              </AppText>
            ) : null}
            {analysis.missingAfter ? (
              <AppText variant="body">
                Primer evento ausente: {analysis.missingAfter}
              </AppText>
            ) : null}
            {analysis.failedComponent ? (
              <AppText variant="body">
                Componente afectado: {analysis.failedComponent}
              </AppText>
            ) : null}
            <AppText variant="body">Confianza: {analysis.confidence}</AppText>
            <AppText variant="body">{analysis.probableCause}</AppText>
            <AppText variant="caption" color={colors.subtitle}>
              Recomendación: {analysis.recommendation}
            </AppText>
          </AppCard>

          <AppCard>
            <AppText variant="heading">Semáforos</AppText>
            <SemaphoreRow label="GPS" status={analysis.indicators.gps} />
            <SemaphoreRow label="Foreground Service" status={analysis.indicators.foregroundService} />
            <SemaphoreRow label="TaskManager" status={analysis.indicators.taskManager} />
            <SemaphoreRow label="Batch" status={analysis.indicators.batch} />
            <SemaphoreRow label="HTTP" status={analysis.indicators.http} />
          </AppCard>

          <AppCard>
            <AppText variant="heading">Gaps (en vivo)</AppText>
            <AppText variant="body">
              Tiempo desde último GPS: {formatGapLive(analysis.gaps.gpsSeconds)}
            </AppText>
            <AppText variant="body">
              Tiempo desde último batch: {formatGapLive(analysis.gaps.batchSeconds)}
            </AppText>
            <AppText variant="body">
              Tiempo desde último heartbeat: {formatGapLive(analysis.gaps.heartbeatSeconds)}
            </AppText>
            <AppText variant="body">
              Tiempo desde último refresh: {formatGapLive(analysis.gaps.refreshSeconds)}
            </AppText>
          </AppCard>

          <AppCard>
            <AppText variant="heading">Punto de ruptura</AppText>
            {analysis.breakpointNarrative.length === 0 ? (
              <AppText variant="body" color={colors.subtitle}>
                Sin ruptura detectada todavía.
              </AppText>
            ) : (
              analysis.breakpointNarrative.map((line, i) => (
                <AppText key={`${line}-${i}`} variant="body">
                  {line}
                </AppText>
              ))
            )}
          </AppCard>

          <AppCard>
            <AppText variant="heading">Pipeline</AppText>
            {analysis.pipelineSummary.map((stage) => (
              <View key={stage.stage} style={styles.pipelineRow}>
                <AppText variant="bodyMedium">{stage.stage}</AppText>
                <AppText variant="caption" color={colors.subtitle}>
                  {stage.lastAt ? formatTime(stage.lastAt) : '—'}
                  {stage.gapSeconds != null ? ` · hace ${formatGapLive(stage.gapSeconds)}` : ''}
                </AppText>
                <AppText
                  variant="caption"
                  style={{ color: stage.ok ? colors.primary : colors.danger }}>
                  {stage.ok ? 'OK' : 'STALE'}
                </AppText>
              </View>
            ))}
          </AppCard>
        </>
      )}

      <AppButton
        label={exporting ? 'Exportando…' : 'Exportar diagnóstico'}
        onPress={() => void handleExport()}
        loading={exporting}
        disabled={exporting}
      />

      <AppButton label="Recargar" variant="secondary" onPress={() => void refresh()} />

      <AppButton
        label="Volver a captura"
        variant="ghost"
        onPress={() => router.push('/captura-logistica' as Href)}
      />

      <AppCard style={styles.timelineCard}>
        <AppText variant="heading">Timeline operativo ({events.length})</AppText>
        {events.length === 0 ? (
          <AppText variant="body" color={colors.subtitle}>
            Sin eventos registrados todavía.
          </AppText>
        ) : (
          events.map((ev, index) => {
            const ops = formatDiagnosticEventForOps(ev);
            const titleColor =
              ops.severity === 'critical'
                ? colors.danger
                : ops.severity === 'warning'
                  ? colors.warning
                  : colors.textPrimary;
            return (
              <View key={`${ev.timestamp}-${ev.type}-${index}`} style={styles.timelineItem}>
                <AppText variant="caption" color={colors.subtitle}>
                  {ops.time}
                </AppText>
                <AppText variant="bodyMedium" style={{ color: titleColor }}>
                  {ops.title}
                </AppText>
                {ops.lines.map((line) => (
                  <AppText key={line} variant="caption" color={colors.subtitle}>
                    {line}
                  </AppText>
                ))}
                {index < events.length - 1 ? (
                  <AppText variant="caption" color={colors.primary} style={styles.arrow}>
                    ↓
                  </AppText>
                ) : null}
              </View>
            );
          })
        )}
      </AppCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.base,
  },
  heroCard: {
    borderWidth: 2,
  },
  semaphoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pipelineRow: {
    gap: 2,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  timelineCard: {
    gap: spacing.sm,
  },
  timelineItem: {
    gap: 2,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  arrow: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
