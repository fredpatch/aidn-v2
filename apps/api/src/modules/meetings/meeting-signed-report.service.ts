/** SESSION1-MEET-2 - the applicant returns the DN compte-rendu signed. Its own
 *  owner chain (meeting_report_signed), never the DN's (meeting_report): both
 *  share the meeting id and, since every trash/link is scoped by owner type
 *  AND id, neither can touch the other. No DN validation step: receiving the
 *  file is the whole workflow. The applicant uploads it ONCE (decision D3,
 *  revised before push): a second, different file is refused with
 *  MEETING_SIGNED_REPORT_ALREADY_SUBMITTED and nothing is trashed - a
 *  correction goes through the DN, outside this workflow for now. The DN CR is
 *  frozen from the first signed copy on. */
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/index.js';
import { documentVersions, meetings } from '../../shared/db/schema.js';
import { logAudit } from '../auth/auth.service.js';
import { relocateDossierAssetAfterCommit, type RelocationTarget } from '../files/relocate-asset.js';
import {
  claimUploadAsset,
  linkLockedAsset,
  trashCurrentVersions,
  versionValues,
  type PreparedAttachment,
} from '../uploads/upload-attachment.js';
import { acceptsMeetingReport } from './meeting-confirmation.js';
import { lockOwnedMeeting, phaseCodeOf, type MeetingRow } from './meeting-write.js';

export async function submitSignedMeetingReport(
  meetingId: number,
  applicantId: number,
  attachment: PreparedAttachment
): Promise<MeetingRow> {
  const target: RelocationTarget = { ownerType: 'meeting_report_signed', ownerId: meetingId };
  const saved = await db.transaction(async (tx) => {
    // Ownership first (404), then the K7 dossier guard and the meeting row lock.
    const meeting = await lockOwnedMeeting(tx, meetingId, applicantId);
    if ((await claimUploadAsset(tx, attachment, target)) === 'attached_here') return meeting;
    if (!acceptsMeetingReport(meeting.meetingType)) throw new Error('MEETING_REPORT_NOT_APPLICABLE');
    if (meeting.status !== 'held') throw new Error('MEETING_NOT_HELD');
    if (meeting.crDocumentUrl === null) throw new Error('MEETING_REPORT_MISSING');
    if (meeting.signedCrDocumentUrl !== null) throw new Error('MEETING_SIGNED_REPORT_ALREADY_SUBMITTED');

    // VERSION-CURRENT-DISCIPLINE - a no-op on the first (and only) copy, kept so
    // the chain never holds two current versions.
    await trashCurrentVersions(tx, 'meeting_report_signed', meetingId);
    await tx.insert(documentVersions).values(versionValues(attachment, 'meeting_report_signed', meetingId));
    await linkLockedAsset(tx, attachment.assetId, target);

    const [updated] = await tx
      .update(meetings)
      .set({ signedCrDocumentUrl: attachment.fileUrl, signedCrUploadedAt: new Date() })
      .where(eq(meetings.id, meetingId))
      .returning();

    await logAudit(
      {
        applicantId,
        action: 'MEETING_SIGNED_REPORT_SUBMITTED',
        module: await phaseCodeOf(tx, meeting.phaseId),
        entityId: meetingId,
      },
      tx
    );
    return updated;
  });

  await relocateDossierAssetAfterCommit(attachment.assetId, target);
  return saved;
}
