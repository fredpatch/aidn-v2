import type { ApplicantAction } from '@aidn/shared';
import { buildApplicantActions } from './applicant-actions.policy.js';
import { loadApplicantActionRows } from './applicant-actions.rows.js';

export async function listApplicantActions(applicantId: number, now = new Date()): Promise<ApplicantAction[]> {
  return buildApplicantActions(await loadApplicantActionRows({ applicantId }), now);
}
