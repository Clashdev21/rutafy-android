import { type Href, router } from 'expo-router';

import { trackCommunicationsEvent } from '@/services/communicationsAnalytics';
import { setPendingDispatchOfferIntent } from '@/services/pushNavigationIntent';
import type { AppRole } from '@/types/auth';
import type { InboxNotification } from '@/types/notificationsInbox';
import { isNotificationExpired } from '@/utils/notificationFormatters';
import { appRoleToMobileRole } from '@/utils/roles';

export type NotificationNavRole = 'mensajero' | 'transportista';

export type NotificationNavigationResult = {
  handled: boolean;
  href: Href | null;
  reason: string;
};

function pickStr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function inboxDetailHref(role: NotificationNavRole, notificationId: string): Href {
  return `/${role}/notificaciones/${notificationId}` as Href;
}

function roleHomeHref(role: NotificationNavRole): Href {
  return role === 'transportista'
    ? ('/transportista/(tabs)' as Href)
    : ('/mensajero/(tabs)' as Href);
}

function resolveRole(appRole: AppRole | null | undefined): NotificationNavRole {
  const mobile = appRole ? appRoleToMobileRole(appRole) : null;
  return mobile === 'transportista' ? 'transportista' : 'mensajero';
}

function extractOfferId(notification: InboxNotification): string | null {
  return (
    pickStr(notification.data.offer_id) ??
    pickStr(notification.data.offerId) ??
    extractIdFromPath(notification.deep_link, '/ofertas/')
  );
}

function extractServiceId(notification: InboxNotification): string | null {
  return (
    pickStr(notification.data.service_id) ??
    pickStr(notification.data.serviceId) ??
    extractIdFromPath(notification.deep_link, '/servicios/')
  );
}

function extractIdFromPath(path: string | null, marker: string): string | null {
  if (!path || typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf(marker);
  if (idx < 0) return null;
  const rest = trimmed.slice(idx + marker.length).split(/[/?#]/)[0];
  return rest?.trim() || null;
}

function isSafeAppPath(path: string): boolean {
  return path.startsWith('/mensajero') || path.startsWith('/transportista');
}

/**
 * Resuelve navegación de inbox reutilizando el flujo push actual.
 * Nunca lanza; ante duda abre detalle de la notificación.
 *
 * dispatch_offer con offer_id válido → setPendingDispatchOfferIntent + Inicio mensajero.
 * Sin offer_id → detalle inbox (no fabricar rutas).
 */
export function resolveInboxNotificationNavigation(
  notification: InboxNotification,
  appRole?: AppRole | null,
): NotificationNavigationResult {
  try {
    const role = resolveRole(appRole ?? null);
    const eventType = (notification.event_type || '').toLowerCase();
    const dataType = pickStr(notification.data.type)?.toLowerCase() ?? '';
    const deepLink = pickStr(notification.deep_link);
    const expired = isNotificationExpired(notification);
    const detailHref = inboxDetailHref(role, notification.notification_id);

    const isDispatchOffer =
      eventType === 'dispatch_offer' ||
      dataType === 'dispatch_offer' ||
      Boolean(deepLink?.includes('/ofertas/'));

    if (isDispatchOffer) {
      if (expired) {
        return {
          handled: true,
          href: detailHref,
          reason: 'dispatch_offer_expired',
        };
      }

      const offerId = extractOfferId(notification);
      if (!offerId) {
        return {
          handled: true,
          href: detailHref,
          reason: 'dispatch_offer_missing_offer_id',
        };
      }

      const serviceId = extractServiceId(notification);
      setPendingDispatchOfferIntent({
        offerId,
        serviceId: serviceId ?? undefined,
        expiresAt: notification.expires_at,
      });

      return {
        handled: true,
        href: '/mensajero/(tabs)' as Href,
        reason: 'dispatch_offer_intent',
      };
    }

    const isServiceEvent =
      eventType.startsWith('service_') ||
      dataType.startsWith('service_') ||
      Boolean(deepLink?.includes('/servicios/'));

    if (isServiceEvent) {
      const serviceId = extractServiceId(notification);
      if (serviceId) {
        return {
          handled: true,
          href: `/${role}/${serviceId}` as Href,
          reason: 'service_detail',
        };
      }
      return {
        handled: true,
        href: detailHref,
        reason: 'service_missing_service_id',
      };
    }

    if (deepLink && isSafeAppPath(deepLink)) {
      if (deepLink.includes('/ofertas/')) {
        const offerId = extractOfferId(notification);
        if (!expired && offerId) {
          setPendingDispatchOfferIntent({
            offerId,
            serviceId: extractServiceId(notification) ?? undefined,
            expiresAt: notification.expires_at,
          });
          return {
            handled: true,
            href: '/mensajero/(tabs)' as Href,
            reason: 'deep_link_ofertas_compat',
          };
        }
        return {
          handled: true,
          href: detailHref,
          reason: 'deep_link_ofertas_fallback',
        };
      }

      return {
        handled: true,
        href: deepLink as Href,
        reason: 'deep_link_direct',
      };
    }

    return {
      handled: true,
      href: detailHref,
      reason: 'inbox_detail_fallback',
    };
  } catch {
    const role = resolveRole(appRole ?? null);
    return {
      handled: true,
      href: inboxDetailHref(role, notification.notification_id),
      reason: 'resolve_exception_fallback',
    };
  }
}

function safePush(href: Href, tag: string): boolean {
  try {
    router.push(href);
    return true;
  } catch (e) {
    if (__DEV__) {
      console.log('[inbox-navigation-error]', {
        tag,
        href,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
    return false;
  }
}

export function navigateInboxNotification(
  notification: InboxNotification,
  appRole?: AppRole | null,
): NotificationNavigationResult {
  const role = resolveRole(appRole ?? null);
  const result = resolveInboxNotificationNavigation(notification, appRole);

  trackCommunicationsEvent('notification_navigation', {
    notification_id: notification.notification_id,
    event_type: notification.event_type,
    reason: result.reason,
    href: result.href,
  });

  if (__DEV__) {
    console.log('[inbox-navigation]', {
      notificationId: notification.notification_id,
      eventType: notification.event_type,
      reason: result.reason,
      href: result.href,
    });
  }

  if (!result.href) {
    return result;
  }

  if (safePush(result.href, 'primary')) {
    return result;
  }

  const detailHref = inboxDetailHref(role, notification.notification_id);
  if (result.href !== detailHref && safePush(detailHref, 'detail_fallback')) {
    if (__DEV__) {
      console.log('[inbox-navigation-fallback]', {
        from: result.href,
        to: detailHref,
      });
    }
    return { ...result, href: detailHref, reason: `${result.reason}_detail_fallback` };
  }

  const homeHref = roleHomeHref(role);
  if (safePush(homeHref, 'home_fallback')) {
    if (__DEV__) {
      console.log('[inbox-navigation-fallback]', {
        from: result.href,
        to: homeHref,
      });
    }
    return { ...result, href: homeHref, reason: `${result.reason}_home_fallback` };
  }

  return { ...result, href: null, reason: `${result.reason}_navigation_failed` };
}
