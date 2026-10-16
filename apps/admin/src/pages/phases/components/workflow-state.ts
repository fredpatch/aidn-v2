import type { NextActionOwner, OperationalState } from '@aidn/shared';

export interface PhaseWorkflowMetric {
  label: string;
  value: string;
}

/** Summary state built by the phase helpers (SESSION1-UX-1 §7.6). */
export interface PhaseWorkflowSummaryState {
  title: string;
  description: string;
  state: OperationalState;
  owner: NextActionOwner;
  phaseStatus: string;
  blockReason?: string | null;
  metrics: PhaseWorkflowMetric[];
}
