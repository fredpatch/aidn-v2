/** SESSION1-MEET-2 - DN compte-rendu and the applicant's signed return
 *  against a real PostgreSQL (skipped without DATABASE_URL; needs a
 *  migrated, disposable database). Seeds its own dossiers. Upload assets are
 *  inserted directly (storage key outside staging/, so the after-commit
 *  relocation is a no-op). */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import type { PreparedAttachment } from '../uploads/upload-attachment.js';

const DATABASE_URL = process.env.DATABASE_URL;
const skip = DATABASE_URL ? false : 'DATABASE_URL not set (needs a migrated, disposable database)';
const DAY = 86_400_000;
type MeetingType = 'preliminary' | 'formal' | 'site_visit';

describe('SESSION1-MEET-2 signed meeting report (real PostgreSQL)', { skip }, () => {
  let pool: pg.Pool;
  let meetings: typeof import('./meetings.service.js');
  let signed: typeof import('./meeting-signed-report.service.js');
  let bundles: typeof import('./bundle-meeting.js');
  let appDb: (typeof import('../../shared/db/index.js'))['db'];
  let closeAppPool: () => Promise<void>;
  const tag = Date.now().toString(36);
  let n = 0;
  let slotSeq = 0;
  const slot = (days: number) => new Date(Date.now() + days * DAY + ++slotSeq * 60_000);

  before(async () => {
    // timestamp columns hold UTC: read them back as UTC (gotcha #25).
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      types: {
        getTypeParser: ((oid: number, format?: string) =>
          oid === 1114
            ? (value: string) => new Date(`${value.replace(' ', 'T')}Z`)
            : pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser,
      },
    });
    meetings = await import('./meetings.service.js');
    signed = await import('./meeting-signed-report.service.js');
    bundles = await import('./bundle-meeting.js');
    const dbModule = await import('../../shared/db/index.js');
    appDb = dbModule.db;
    closeAppPool = () => dbModule.db.$client.end();
  });

  after(async () => {
    await pool.end();
    await closeAppPool();
  });

  const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
  const all = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

  async function user() {
    const code = `MR${tag}${++n}`;
    return (await one(`INSERT INTO users (employee_code, full_name, email) VALUES ($1, 'Agent DN', $2) RETURNING id`, [
      code,
      `${code}@test.local`,
    ])).id as number;
  }

  /** A dossier with M3, M4 and M6 phases. */
  async function dossier(status = 'pending_review') {
    const k = `${tag}-${++n}`;
    const org = (await one(
      `INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1, $1, 'Libreville') RETURNING id`,
      [`OMA MEET2 ${k}`]
    )).id;
    const applicant = (await one(
      `INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1, 'Postulant', $2, 'x') RETURNING id`,
      [org, `p2-${k}@test.local`]
    )).id as number;
    const request = (await one(
      `INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status)
       VALUES ($1, $2, $3, 'issuance', $4) RETURNING id`,
      [`DEM-MEET2-${k}`, applicant, org, status]
    )).id as number;
    const phase: Record<string, number> = {};
    for (const code of ['M3', 'M4', 'M6']) {
      phase[code] = (await one(`INSERT INTO phases (request_id, phase_code) VALUES ($1, $2) RETURNING id`, [request, code])).id;
    }
    return { applicant, request, phase };
  }

  /** A meeting row in the given state (no negotiation history needed here). */
  async function meeting(phaseId: number, agent: number, meetingType: MeetingType = 'preliminary', status = 'held') {
    const siteVisit = meetingType === 'site_visit';
    return (await one(
      `INSERT INTO meetings (phase_id, meeting_type, dn_agent_id, scheduled_at, status, confirmation_status, confirmed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [phaseId, meetingType, agent, slot(status === 'scheduled' ? 5 : -1), status, siteVisit ? 'not_required' : 'confirmed', siteVisit ? null : new Date()]
    )).id as number;
  }

  /** A real upload_assets row owned by a staff user or an applicant. */
  async function asset(owner: { userId: number } | { applicantId: number }): Promise<PreparedAttachment> {
    const userId = 'userId' in owner ? owner.userId : null;
    const applicantId = 'applicantId' in owner ? owner.applicantId : null;
    const { id } = await one(
      `INSERT INTO upload_assets (file_url, storage_key, original_name, mime_type, size_bytes,
                                  uploaded_by_user_id, uploaded_by_applicant_id, uploaded_from_app)
       VALUES ('pending', $1, 'cr.pdf', 'application/pdf', 4, $2, $3, $4) RETURNING id`,
      [`meet2-test/${tag}-${++n}.pdf`, userId, applicantId, userId ? 'admin' : 'portal']
    );
    const fileUrl = `/api/files/${id}`;
    await pool.query(`UPDATE upload_assets SET file_url = $1 WHERE id = $2`, [fileUrl, id]);
    return {
      assetId: id,
      fileUrl,
      mimeType: 'application/pdf',
      originalName: 'cr.pdf',
      sizeBytes: 4,
      uploadedByUserId: userId,
      actor: userId ? { kind: 'staff', userId } : { kind: 'applicant', applicantId: applicantId! },
    };
  }

  const row = (id: number) => one(`SELECT * FROM meetings WHERE id = $1`, [id]);
  const versions = (ownerType: string, ownerId: number) =>
    all(`SELECT * FROM document_versions WHERE owner_type = $1 AND owner_id = $2 ORDER BY id`, [ownerType, ownerId]);
  const current = async (ownerType: string, ownerId: number) =>
    (await versions(ownerType, ownerId)).filter((v) => v.is_current && v.trashed_at === null);

  const audits = (id: number, action: string) => all(`SELECT * FROM audit_logs WHERE entity_id = $1 AND action = $2 ORDER BY id`, [id, action]);

  /** The DN uploads a CR through the real service. */
  async function dnReport(meetingId: number, agent: number) {
    const attachment = await asset({ userId: agent });
    await meetings.attachMeetingReport(meetingId, agent, attachment);
    return attachment;
  }

  describe('DN original (meeting_report)', () => {
    it('upload then replace before any signed copy: one current version, one trashed', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await meeting(d.phase.M3, agent);
      await dnReport(id, agent);
      const second = await dnReport(id, agent);
      assert.equal((await row(id)).cr_document_url, second.fileUrl);
      const chain = await versions('meeting_report', id);
      assert.equal(chain.length, 2);
      assert.deepEqual((await current('meeting_report', id)).map((v) => v.file_url), [second.fileUrl]);
    });

    it('refused on a site visit (D1), nothing written', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await meeting(d.phase.M6, agent, 'site_visit');
      await assert.rejects(dnReport(id, agent), /MEETING_REPORT_NOT_APPLICABLE/);
      assert.equal((await row(id)).cr_document_url, null);
      assert.equal((await versions('meeting_report', id)).length, 0);
    });

    it('refused before the meeting is held', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await meeting(d.phase.M4, agent, 'formal', 'scheduled');
      await assert.rejects(dnReport(id, agent), /MEETING_NOT_HELD/);
    });

    it('frozen once a signed copy exists (D2): MEETING_REPORT_FROZEN_SIGNED, CR and chain untouched', async () => {
      const d = await dossier();
      const agent = await user();
      const id = await meeting(d.phase.M3, agent);
      const first = await dnReport(id, agent);
      await pool.query(
        `UPDATE meetings SET signed_cr_document_url = '/api/files/999999', signed_cr_uploaded_at = now() WHERE id = $1`,
        [id]
      );
      await assert.rejects(dnReport(id, agent), /MEETING_REPORT_FROZEN_SIGNED/);
      assert.equal((await row(id)).cr_document_url, first.fileUrl);
      assert.equal((await versions('meeting_report', id)).length, 1);
    });
  });

  describe('DB check meetings_signed_cr_coherent_chk', () => {
    it('rejects a signed copy without its date, without a DN CR, or on a site visit', async () => {
      const d = await dossier();
      const agent = await user();
      const m3 = await meeting(d.phase.M3, agent);
      await assert.rejects(
        pool.query(`UPDATE meetings SET signed_cr_document_url = '/api/files/1', signed_cr_uploaded_at = now() WHERE id = $1`, [m3]),
        /meetings_signed_cr_coherent_chk/,
        'no DN CR'
      );
      await pool.query(`UPDATE meetings SET cr_document_url = '/api/files/2', cr_uploaded_at = now() WHERE id = $1`, [m3]);
      await assert.rejects(
        pool.query(`UPDATE meetings SET signed_cr_document_url = '/api/files/1' WHERE id = $1`, [m3]),
        /meetings_signed_cr_coherent_chk/,
        'no date'
      );
      const visit = await meeting(d.phase.M6, agent, 'site_visit');
      await assert.rejects(
        pool.query(
          `UPDATE meetings SET cr_document_url = '/api/files/3', cr_uploaded_at = now(),
                  signed_cr_document_url = '/api/files/4', signed_cr_uploaded_at = now() WHERE id = $1`,
          [visit]
        ),
        /meetings_signed_cr_coherent_chk/,
        'site visit'
      );
    });
  });

  describe('applicant signed copy (meeting_report_signed)', () => {
    async function heldWithReport(meetingType: MeetingType = 'preliminary', status = 'pending_review') {
      const d = await dossier();
      const agent = await user();
      const phaseId = meetingType === 'formal' ? d.phase.M4 : d.phase.M3;
      const id = await meeting(phaseId, agent, meetingType);
      const dn = await dnReport(id, agent);
      if (status !== 'pending_review') await pool.query(`UPDATE requests SET status = $1 WHERE id = $2`, [status, d.request]);
      return { d, agent, id, dn };
    }

    for (const meetingType of ['preliminary', 'formal'] as const) {
      it(`${meetingType}: stored on its own chain, audited as the applicant, DN chain untouched`, async () => {
        const { d, id, dn } = await heldWithReport(meetingType);
        const copy = await asset({ applicantId: d.applicant });
        await signed.submitSignedMeetingReport(id, d.applicant, copy);

        const saved = await row(id);
        assert.equal(saved.signed_cr_document_url, copy.fileUrl);
        assert.ok(saved.signed_cr_uploaded_at instanceof Date);
        assert.equal(saved.cr_document_url, dn.fileUrl, 'DN CR unchanged');
        assert.deepEqual((await current('meeting_report_signed', id)).map((v) => v.file_url), [copy.fileUrl]);
        assert.deepEqual((await current('meeting_report', id)).map((v) => v.file_url), [dn.fileUrl]);
        const linked = await one(`SELECT linked_owner_type, linked_owner_id FROM upload_assets WHERE id = $1`, [copy.assetId]);
        assert.deepEqual(linked, { linked_owner_type: 'meeting_report_signed', linked_owner_id: id });

        const [audit] = await audits(id, 'MEETING_SIGNED_REPORT_SUBMITTED');
        assert.equal(audit.applicant_id, d.applicant);
        assert.equal(audit.user_id, null);
        assert.equal(audit.module, meetingType === 'formal' ? 'M4' : 'M3');
        assert.equal(audit.request_id, d.request, 'dossier-linked (audit-request mapping)');
      });
    }

    it('one upload only (D3 revised): a second, different file is refused and nothing is replaced', async () => {
      const { d, id, dn } = await heldWithReport();
      const first = await asset({ applicantId: d.applicant });
      await signed.submitSignedMeetingReport(id, d.applicant, first);
      const before = await row(id);
      const second = await asset({ applicantId: d.applicant });
      await assert.rejects(
        signed.submitSignedMeetingReport(id, d.applicant, second),
        /MEETING_SIGNED_REPORT_ALREADY_SUBMITTED/
      );

      const after = await row(id);
      assert.equal(after.signed_cr_document_url, first.fileUrl, 'first copy stays the current one');
      assert.equal(after.signed_cr_uploaded_at.getTime(), before.signed_cr_uploaded_at.getTime());
      const chain = await versions('meeting_report_signed', id);
      assert.equal(chain.length, 1, 'no second version');
      assert.deepEqual((await current('meeting_report_signed', id)).map((v) => v.file_url), [first.fileUrl]);
      assert.equal(chain[0].trashed_at, null, 'first version not trashed');
      assert.deepEqual((await current('meeting_report', id)).map((v) => v.file_url), [dn.fileUrl], 'DN chain untouched');
      const refused = await one(`SELECT linked_owner_type FROM upload_assets WHERE id = $1`, [second.assetId]);
      assert.equal(refused.linked_owner_type, null, 'refused asset stays unlinked (orphan cleanup)');
      assert.equal((await audits(id, 'MEETING_SIGNED_REPORT_SUBMITTED')).length, 1);
    });

    it('replay of the same asset: no new version, no new audit', async () => {
      const { d, id } = await heldWithReport();
      const copy = await asset({ applicantId: d.applicant });
      await signed.submitSignedMeetingReport(id, d.applicant, copy);
      await signed.submitSignedMeetingReport(id, d.applicant, copy);
      assert.equal((await versions('meeting_report_signed', id)).length, 1);
      assert.equal((await audits(id, 'MEETING_SIGNED_REPORT_SUBMITTED')).length, 1);
    });

    it('after the signed copy, the DN CR is frozen (end to end)', async () => {
      const { d, agent, id, dn } = await heldWithReport();
      await signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant }));
      await assert.rejects(dnReport(id, agent), /MEETING_REPORT_FROZEN_SIGNED/);
      assert.equal((await row(id)).cr_document_url, dn.fileUrl);
    });

    it('refused without a DN CR', async () => {
      const d = await dossier();
      const id = await meeting(d.phase.M3, await user());
      await assert.rejects(
        signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant })),
        /MEETING_REPORT_MISSING/
      );
    });

    it('refused on a meeting that is not held', async () => {
      const d = await dossier();
      for (const status of ['scheduled', 'no_show']) {
        const id = await meeting(d.phase.M3, await user(), 'preliminary', status);
        await assert.rejects(
          signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant })),
          /MEETING_NOT_HELD/,
          status
        );
      }
    });

    it('refused on a site visit', async () => {
      const d = await dossier();
      const id = await meeting(d.phase.M6, await user(), 'site_visit');
      await assert.rejects(
        signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant })),
        /MEETING_REPORT_NOT_APPLICABLE/
      );
    });

    it('another applicant gets MEETING_NOT_FOUND, even on a closed dossier', async () => {
      const { id } = await heldWithReport('preliminary', 'cancelled');
      const other = await dossier();
      await assert.rejects(
        signed.submitSignedMeetingReport(id, other.applicant, await asset({ applicantId: other.applicant })),
        /MEETING_NOT_FOUND/
      );
    });

    it('closed dossier: DOSSIER_CLOSED, nothing written', async () => {
      const { d, id } = await heldWithReport('preliminary', 'completed');
      await assert.rejects(
        signed.submitSignedMeetingReport(id, d.applicant, await asset({ applicantId: d.applicant })),
        /DOSSIER_CLOSED/
      );
      assert.equal((await row(id)).signed_cr_document_url, null);
    });

    it("an asset already linked elsewhere is refused (the same dossier's M3 signed copy reused on M4)", async () => {
      const { d, agent, id } = await heldWithReport();
      const formal = await meeting(d.phase.M4, agent, 'formal');
      await dnReport(formal, agent);
      const copy = await asset({ applicantId: d.applicant });
      await signed.submitSignedMeetingReport(id, d.applicant, copy);
      await assert.rejects(signed.submitSignedMeetingReport(formal, d.applicant, copy), /UPLOAD_ASSET_ALREADY_LINKED/);
      assert.equal((await row(formal)).signed_cr_document_url, null);
    });

    it('the activity label of the submission', async () => {
      const { ACTIVITY_LABELS } = await import('../requests/requests.service.js');
      assert.deepEqual(ACTIVITY_LABELS.MEETING_SIGNED_REPORT_SUBMITTED, {
        title: 'Compte rendu signé transmis par le postulant',
        tone: 'info',
      });
    });

    it('read models: applicant detail, Mes réunions and the bundle expose both files and the upload flag', async () => {
      const { d, id, dn } = await heldWithReport();
      const actor = { applicant: { applicantId: d.applicant } };
      const initial = (await meetings.getMeeting(id, actor)) as { canSubmitSignedReport: boolean; signedCrDocumentUrl: string | null };
      assert.equal(initial.canSubmitSignedReport, true);
      assert.equal(initial.signedCrDocumentUrl, null);

      const copy = await asset({ applicantId: d.applicant });
      await signed.submitSignedMeetingReport(id, d.applicant, copy);

      const detail = (await meetings.getMeeting(id, actor)) as unknown as Record<string, unknown>;
      assert.equal(detail.crDocumentUrl, dn.fileUrl);
      assert.equal(detail.signedCrDocumentUrl, copy.fileUrl);
      assert.equal(detail.canSubmitSignedReport, false, 'one upload only: the flag drops right after it');
      assert.equal('dnAgentId' in detail, false);

      const item = (await meetings.listApplicantMeetings(d.applicant)).find((m) => m.id === id)!;
      assert.equal(item.signedCrDocumentUrl, copy.fileUrl);
      assert.equal(typeof item.crUploadedAt, 'string');
      assert.equal(item.canSubmitSignedReport, false);

      const { meetings: meetingsTable } = await import('../../shared/db/schema.js');
      const { eq } = await import('drizzle-orm');
      const [meetingRow] = await appDb.select().from(meetingsTable).where(eq(meetingsTable.id, id));
      const applicantBundle = (await bundles.toBundleMeeting(meetingRow, d.request, 'applicant')) as unknown as Record<string, unknown>;
      assert.equal(applicantBundle.signedCrDocumentUrl, copy.fileUrl);
      assert.equal(applicantBundle.canSubmitSignedReport, false);
      const staffBundle = (await bundles.toBundleMeeting(meetingRow, d.request, 'staff')) as unknown as Record<string, unknown>;
      assert.equal(staffBundle.signedCrDocumentUrl, copy.fileUrl);
      assert.equal('canSubmitSignedReport' in staffBundle, false);

      const staff = (await meetings.getMeeting(id, { user: { roles: ['dn_agent'] } })) as unknown as Record<string, unknown>;
      assert.equal(staff.signedCrDocumentUrl, copy.fileUrl);
    });

    it('closed dossier in Mes réunions: DN CR still listed, canSubmitSignedReport false even without a signed copy', async () => {
      const { d, id } = await heldWithReport();
      await pool.query(`UPDATE requests SET status = 'completed' WHERE id = $1`, [d.request]);
      const item = (await meetings.listApplicantMeetings(d.applicant)).find((m) => m.id === id)!;
      assert.equal(item.signedCrDocumentUrl, null);
      assert.notEqual(item.crDocumentUrl, null);
      assert.equal(item.canSubmitSignedReport, false);
    });
  });
});
