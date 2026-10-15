export type AuditSystem =
  | 'raronexus'
  | 'rarostock'
  | 'rarogestao'
  | 'raroclients'
  | 'raropay'
  | 'rarotickets';

export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AuditStatus = 'SUCCESS' | 'FAILURE';

export interface AuditActor {
  type: 'user' | 'system' | 'anonymous';
  userId?: string;
  name?: string;
  email?: string;
  role?: string | null;
  systemName?: string;
}

export interface AuditTarget {
  type: string;
  id: string;
  label: string;
}

export interface AuditContext {
  ip: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
}

export interface AuditChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditDiff {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface AuditEnvelope {
  schemaVersion: number;
  _id: string;
  correlationId?: string;
  timestamp: string;
  ingestedAt?: string;
  system: AuditSystem;
  category: string;
  action: string;
  severity: AuditSeverity;
  status: AuditStatus;
  actor: AuditActor;
  targets: AuditTarget[];
  searchTokens?: string[];
  context: AuditContext;
  changes?: AuditChange[];
  diff?: AuditDiff;
  details: Record<string, unknown>;
  hash?: string;
  prevHash?: string;
}

export interface LogAuditOptions {
  correlationId?: string;
  system?: AuditSystem;
  category: string;
  action: string;
  severity?: AuditSeverity;
  status?: AuditStatus;
  actor: AuditActor;
  targets?: AuditTarget[];
  context?: Partial<AuditContext>;
  changes?: AuditChange[];
  diff?: AuditDiff;
  details?: Record<string, unknown>;
}

