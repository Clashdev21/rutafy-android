export type OperatorTrackingHealth = {
  started: boolean;
  lastEventAt?: string;
  lastBatchOkAt?: string;
  lastBatchErrorAt?: string;
  lastError?: string;
};

export type StoredOperatorTrackingHealth = {
  lastOperatorBgEventAt?: string;
  lastOperatorBgBatchOkAt?: string;
  lastOperatorBgBatchErrorAt?: string;
  lastOperatorBgError?: string;
  lastOperatorBgDropReason?: string;
};

export type OperatorBgDropReason =
  | 'in_flight'
  | 'no_session'
  | 'empty_points'
  | 'task_error';
