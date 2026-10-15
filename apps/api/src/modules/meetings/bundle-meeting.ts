/** SESSION1-MEET-1 - the current meeting as the M3 and M4 bundles return it.
 *  Those bundles are read by BOTH sides (portal and admin workspace), so the
 *  negotiation part depends on who reads: the applicant gets the narrow
 *  applicant block, staff the MeetingNegotiationView with the phase history. */
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { requests } from '../../shared/db/schema.js';
import { isDossierClosed } from '../requests/dossier-open.js';
import {
  applicantBlocksFor,
  negotiationViewsFor,
  type ApplicantNegotiationBlock,
  type MeetingNegotiationView,
} from './meeting-negotiation.view.js';
import { canApplicantSubmitSignedReport } from './meeting-confirmation.js';
import type { MeetingRow } from './meeting-write.js';

export type BundleAudience = 'applicant' | 'staff';

interface BundleMeetingBase {
  id: number;
  scheduledAt: Date;
  location: string | null;
  status: string;
  crDocumentUrl: string | null;
  crUploadedAt: Date | null;
  signedCrDocumentUrl: string | null;
  signedCrUploadedAt: Date | null;
}

export type ApplicantBundleMeeting = BundleMeetingBase & ApplicantNegotiationBlock & { canSubmitSignedReport: boolean };
export type StaffBundleMeeting = BundleMeetingBase & { negotiation: MeetingNegotiationView };
export type BundleMeeting = ApplicantBundleMeeting | StaffBundleMeeting;

export async function toBundleMeeting(
  meeting: MeetingRow,
  requestId: number,
  audience: BundleAudience
): Promise<BundleMeeting> {
  const base: BundleMeetingBase = {
    id: meeting.id,
    scheduledAt: meeting.scheduledAt,
    location: meeting.location,
    status: meeting.status,
    crDocumentUrl: meeting.crDocumentUrl,
    crUploadedAt: meeting.crUploadedAt,
    signedCrDocumentUrl: meeting.signedCrDocumentUrl,
    signedCrUploadedAt: meeting.signedCrUploadedAt,
  };
  const [request] = await db.select({ status: requests.status }).from(requests).where(eq(requests.id, requestId));
  const closed = () => isDossierClosed(request?.status ?? 'cancelled');
  if (audience === 'applicant') {
    const blocks = await applicantBlocksFor([meeting], closed);
    return { ...base, ...blocks.get(meeting.id)!, canSubmitSignedReport: canApplicantSubmitSignedReport(meeting, closed()) };
  }
  const views = await negotiationViewsFor([meeting], closed, { withPhaseHistory: true });
  return { ...base, negotiation: views.get(meeting.id)! };
}
