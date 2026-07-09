export type PushDiagnosticEventType =
  | 'push-permission-start'
  | 'push-permission-granted'
  | 'push-permission-denied'
  | 'push-permission-undetermined'
  | 'push-permission-error'
  | 'push-project-id-missing'
  | 'push-project-id-resolved'
  | 'push-token-start'
  | 'push-token-success'
  | 'push-token-error'
  | 'push-token-invalid-format'
  | 'push-register-start'
  | 'push-register-skip-no-session'
  | 'push-register-payload'
  | 'push-register-success'
  | 'push-register-error'
  | 'push-register-401'
  | 'push-register-403'
  | 'push-register-500'
  | 'push-unregister-start'
  | 'push-unregister-success'
  | 'push-unregister-error'
  | 'push-listener-received'
  | 'push-listener-response'
  | 'push-navigation-intent';

export type PushDiagnosticDetail = Record<string, unknown>;

export interface PushDiagnosticEvent {
  timestamp: string;
  type: PushDiagnosticEventType;
  detail?: PushDiagnosticDetail;
}

export interface PushDiagnosticState {
  lastPushRegisterAttemptAt: string | null;
  lastPushRegisterSuccessAt: string | null;
  lastPushRegisterError: string | null;
  lastHttpStatus: number | null;
  lastTokenPrefix: string | null;
  lastPermissionStatus: string | null;
  lastProjectIdOk: boolean;
  lastActorId: string | null;
  lastActorType: string | null;
}

export const EMPTY_PUSH_DIAGNOSTIC_STATE: PushDiagnosticState = {
  lastPushRegisterAttemptAt: null,
  lastPushRegisterSuccessAt: null,
  lastPushRegisterError: null,
  lastHttpStatus: null,
  lastTokenPrefix: null,
  lastPermissionStatus: null,
  lastProjectIdOk: false,
  lastActorId: null,
  lastActorType: null,
};
