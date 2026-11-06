import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type * as Service from './dossier-teams.service.js';

describe(
  'dossier team foundation (PostgreSQL)',
  { skip: !process.env.DATABASE_URL && 'DATABASE_URL not set' },
  () => {
    let pool: pg.Pool;
    let service: typeof Service;
    let closePool: () => Promise<void>;
    const tag = `team${Date.now()}`;
    let seq = 0;
    let agent: number;
    let supervisor: number;
    let inactive: number;
    let su: number;
    let multi: number;
    let org: number;
    let applicant: number;
    const one = async (query: string, values: unknown[] = []) =>
      (await pool.query(query, values)).rows[0];
    async function user(roles: string[], active = true) {
      const code = `${tag}${++seq}`;
      const { id } = await one(
        'INSERT INTO users (employee_code, full_name, email, active) VALUES ($1,$1,$2,$3) RETURNING id',
        [code, `${code}@t.local`, active]
      );
      for (const role of roles)
        await pool.query('INSERT INTO user_roles (user_id, role) VALUES ($1,$2)', [id, role]);
      return id as number;
    }
    async function dossier(status = 'in_progress', phase: string | null = 'open') {
      // Distinct organisation avoids the existing one-active-request constraint.
      const key = `${tag}${++seq}`;
      const o = await one(
        "INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1,$1,'L') RETURNING id",
        [key]
      );
      const { id } = await one(
        "INSERT INTO requests (reference, applicant_id, organisation_id, request_type, status) VALUES ($1,$2,$3,'issuance',$4) RETURNING id",
        [key, applicant, o.id, status]
      );
      if (phase)
        await pool.query(
          "INSERT INTO phases (request_id, phase_code, status) VALUES ($1,'M3',$2)",
          [id, phase]
        );
      return id as number;
    }
    before(async () => {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      service = await import('./dossier-teams.service.js');
      const { db } = await import('../../shared/db/index.js');
      closePool = () => db.$client.end();
      agent = await user(['dn_agent']);
      supervisor = await user(['dn_supervisor']);
      inactive = await user(['dn_agent'], false);
      su = await user(['SU']);
      multi = await user(['SU', 'dn_agent', 'dn_supervisor']);
      org = (
        await one(
          "INSERT INTO organisations (name, normalized_name, legal_address) VALUES ($1,$1,'L') RETURNING id",
          [tag]
        )
      ).id;
      applicant = (
        await one(
          "INSERT INTO applicants (organisation_id, full_name, email, password_hash) VALUES ($1,'P',$2,'x') RETURNING id",
          [org, `${tag}@t.local`]
        )
      ).id;
    });
    after(async () => {
      await pool?.end();
      await closePool?.();
    });
    const save = (id: number, memberIds = [agent], proposedApprovalNumber = ' PROP-1 ') =>
      service.saveTeamProposal(id, supervisor, { memberIds, proposedApprovalNumber });

    it('reads no proposal and no team, and rejects a missing dossier', async () => {
      assert.deepEqual(await service.getDossierTeam(await dossier()), {
        proposal: null,
        team: null,
      });
      await assert.rejects(service.getDossierTeam(2147483647), /REQUEST_NOT_FOUND/);
      await assert.rejects(save(2147483647), /REQUEST_NOT_FOUND/);
    });
    it('creates, trims, replaces members, preserves proposer, and audits old/new values with dossier/actor', async () => {
      const id = await dossier();
      const created = await save(id);
      assert.equal(created.proposal!.proposedApprovalNumber, 'PROP-1');
      assert.deepEqual(
        created.proposal!.members.map((m) => m.id),
        [agent]
      );
      assert.deepEqual(Object.keys(created.proposal!.members[0]).sort(), [
        'employeeCode',
        'fullName',
        'id',
      ]);
      assert.equal(created.team, null);
      const updated = await service.saveTeamProposal(id, multi, {
        memberIds: [supervisor, multi],
        proposedApprovalNumber: 'PROP-2',
      });
      assert.equal(updated.proposal!.id, created.proposal!.id);
      assert.equal(updated.proposal!.proposedBy, supervisor);
      assert.equal(updated.proposal!.proposedAt.getTime(), created.proposal!.proposedAt.getTime());
      assert.deepEqual(
        updated.proposal!.members.map((m) => m.id).sort(),
        [supervisor, multi].sort()
      );
      const logs = (
        await pool.query('SELECT * FROM audit_logs WHERE request_id=$1 ORDER BY id', [id])
      ).rows;
      assert.deepEqual(
        logs.map((l) => [l.action, l.user_id, l.request_id]),
        [
          ['DOSSIER_TEAM_PROPOSAL_CREATED', supervisor, id],
          ['DOSSIER_TEAM_PROPOSAL_UPDATED', multi, id],
        ]
      );
      assert.deepEqual(logs[1].details.fromMemberIds, [agent]);
      assert.deepEqual(logs[1].details.toMemberIds.sort(), [supervisor, multi].sort());
      assert.equal(logs[1].details.fromProposedApprovalNumber, 'PROP-1');
      assert.equal(logs[1].details.proposedApprovalNumber, 'PROP-2');
    });
    it('rejects empty/duplicate/invalid members and empty/long number without modifying the proposal', async () => {
      const id = await dossier();
      const original = await save(id);
      for (const [members, number, error] of [
        [[], 'P', 'INVALID_TEAM_PROPOSAL'],
        [[agent, agent], 'P', 'INVALID_TEAM_PROPOSAL'],
        [[0], 'P', 'INVALID_TEAM_PROPOSAL'],
        [[2147483647], 'P', 'TEAM_MEMBER_INELIGIBLE'],
        [[inactive], 'P', 'TEAM_MEMBER_INELIGIBLE'],
        [[su], 'P', 'TEAM_MEMBER_INELIGIBLE'],
        [[agent], '  ', 'INVALID_TEAM_PROPOSAL'],
        [[agent], 'x'.repeat(101), 'INVALID_TEAM_PROPOSAL'],
      ] as Array<[number[], string, string]>) {
        await assert.rejects(save(id, members, number), new RegExp(error));
        assert.deepEqual(await service.getDossierTeam(id), original);
      }
      assert.equal(
        (await save(id, [multi], 'x'.repeat(100))).proposal!.proposedApprovalNumber.length,
        100
      );
    });
    it('requires existing open Preliminary and rejects every closed dossier status while keeping reads', async () => {
      for (const status of ['rejected', 'cancelled', 'completed']) {
        const id = await dossier(status);
        await assert.rejects(save(id), /DOSSIER_CLOSED/);
        assert.deepEqual(await service.getDossierTeam(id), { proposal: null, team: null });
      }
      await assert.rejects(save(await dossier('in_progress', null)), /PRELIMINARY_NOT_OPEN/);
      await assert.rejects(save(await dossier('in_progress', 'closed')), /PRELIMINARY_NOT_OPEN/);
    });
    it('lists only active DN members, multi-role once, with safe identity fields', async () => {
      const eligible = await service.getEligibleMembers();
      for (const id of [agent, supervisor, multi])
        assert.equal(eligible.filter((m) => m.id === id).length, 1);
      for (const id of [inactive, su]) assert.ok(!eligible.some((m) => m.id === id));
      assert.deepEqual(Object.keys(eligible[0]).sort(), ['employeeCode', 'fullName', 'id']);
    });
    it('HTTP supervisor and SU can save; DN reads safe proposal/final shapes and eligible users', async () => {
      process.env.JWT_SECRET ??= 'team-db-test-secret';
      process.env.JWT_REFRESH_SECRET ??= 'team-db-test-refresh';
      const [{ default: express }, { default: cookies }, { default: route }, jwt] =
        await Promise.all([
          import('express'),
          import('cookie-parser'),
          import('./dossier-teams.route.js'),
          import('../../shared/utils/jwt.js'),
        ]);
      const app = express();
      app.use(express.json(), cookies());
      app.use('/api', route);
      const server = app.listen(0);
      await new Promise<void>((resolve) => server.on('listening', resolve));
      const address = server.address() as { port: number };
      const base = `http://127.0.0.1:${address.port}/api`;
      const id = await dossier();
      const cookie = (userId: number, roles: string[]) =>
        `aidn_access=${jwt.signAccessToken({ kind: 'staff', userId, employeeCode: 'T', roles })}`;
      try {
        for (const [actor, role] of [
          [supervisor, 'dn_supervisor'],
          [su, 'SU'],
        ] as const) {
          const response = await fetch(`${base}/requests/${id}/team-proposal`, {
            method: 'PUT',
            headers: { Cookie: cookie(actor, [role]), 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberIds: [agent], proposedApprovalNumber: `PROP-${role}` }),
          });
          assert.equal(response.status, 200);
          const state = (await response.json()) as {
            proposal: { proposedApprovalNumber: string };
            team: null;
          };
          assert.equal(state.proposal.proposedApprovalNumber, `PROP-${role}`);
          assert.equal(state.team, null);
        }
        for (const role of ['dn_agent', 'dn_supervisor', 'SU']) {
          const response = await fetch(`${base}/requests/${id}/team`, {
            headers: { Cookie: cookie(agent, [role]) },
          });
          assert.equal(response.status, 200);
          const body = (await response.json()) as {
            proposal: { proposedAt: string; members: unknown[] };
          };
          assert.equal(typeof body.proposal.proposedAt, 'string');
          assert.deepEqual(body.proposal.members, [
            {
              id: agent,
              fullName: (await one('SELECT full_name FROM users WHERE id=$1', [agent])).full_name,
              employeeCode: (await one('SELECT employee_code FROM users WHERE id=$1', [agent]))
                .employee_code,
            },
          ]);
          const eligible = await fetch(`${base}/dossier-teams/eligible-members`, {
            headers: { Cookie: cookie(agent, [role]) },
          });
          assert.equal(eligible.status, 200);
          assert.ok(((await eligible.json()) as { id: number }[]).some((m) => m.id === multi));
        }
        await pool.query("UPDATE requests SET status='cancelled' WHERE id=$1", [id]);
        const response = await fetch(`${base}/requests/${id}/team-proposal`, {
          method: 'PUT',
          headers: { Cookie: cookie(su, ['SU']), 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberIds: [agent], proposedApprovalNumber: 'CLOSED' }),
        });
        assert.equal(response.status, 409);
        assert.equal(((await response.json()) as { code: string }).code, 'DOSSIER_CLOSED');
        assert.equal(
          (
            await fetch(`${base}/requests/${id}/team`, {
              headers: { Cookie: cookie(agent, ['dn_agent']) },
            })
          ).status,
          200
        );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
    it('rolls header, members and audit back if audit insertion fails', async () => {
      const id = await dossier();
      const original = await save(id);
      // The audit FK fails after header/member writes; transaction must restore all of them.
      await assert.rejects(
        service.saveTeamProposal(id, 2147483647, {
          memberIds: [multi],
          proposedApprovalNumber: 'FAIL',
        })
      );
      assert.deepEqual(await service.getDossierTeam(id), original);
      assert.equal(
        (await one('SELECT count(*)::int AS n FROM audit_logs WHERE request_id=$1', [id])).n,
        1
      );
      const empty = await dossier();
      await assert.rejects(
        service.saveTeamProposal(empty, 2147483647, {
          memberIds: [agent],
          proposedApprovalNumber: 'FAIL',
        })
      );
      assert.deepEqual(await service.getDossierTeam(empty), { proposal: null, team: null });
    });
    it('serializes concurrent saves with consistent membership and reconstructible audit', async () => {
      const id = await dossier();
      await Promise.all([save(id, [agent], 'A'), save(id, [multi], 'B')]);
      const result = await service.getDossierTeam(id);
      const logs = (
        await pool.query('SELECT details FROM audit_logs WHERE request_id=$1 ORDER BY id', [id])
      ).rows;
      assert.equal(logs.length, 2);
      assert.equal(result.proposal!.proposedApprovalNumber, logs[1].details.proposedApprovalNumber);
      assert.deepEqual(
        result.proposal!.members.map((m) => m.id),
        logs[1].details.toMemberIds
      );
      assert.deepEqual(logs[1].details.fromMemberIds, logs[0].details.toMemberIds);
    });
    it('does not wait on role deletion while holding the user lock needed by role replacement', async () => {
      const id = await dossier();
      const client = await pool.connect();
      let saving: ReturnType<typeof save> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let outcome: string;
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM user_roles WHERE user_id=$1', [multi]);
        saving = save(id, [multi]);
        outcome = await Promise.race([
          saving.then(() => 'saved'),
          new Promise<string>((resolve) => {
            timer = setTimeout(() => resolve('blocked'), 1500);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        await client.query('ROLLBACK');
        client.release();
        await saving;
      }
      assert.equal(outcome, 'saved', 'role replacement must not form a users/roles lock cycle');
    });
    it('reads a seeded final team independently and never copies the proposal into it or the certificate', async () => {
      const id = await dossier();
      const team = await one(
        "INSERT INTO dossier_teams (request_id, approval_number, finalized_by, finalized_at) VALUES ($1,'FINAL-9',$2,now()) RETURNING id",
        [id, supervisor]
      );
      await pool.query('INSERT INTO dossier_team_members (team_id,user_id) VALUES ($1,$2)', [
        team.id,
        multi,
      ]);
      const certificate = await one(
        "INSERT INTO certificates (request_id,reference,certificate_type,approval_reference_number) VALUES ($1,$2,'agreement','CERT-OLD') RETURNING id",
        [id, `${tag}-cert`]
      );
      await save(id, [agent], 'PROPOSAL-NEW');
      const result = await service.getDossierTeam(id);
      assert.equal(result.team!.approvalNumber, 'FINAL-9');
      assert.equal(result.team!.finalizedBy, supervisor);
      assert.ok(result.team!.finalizedAt instanceof Date);
      assert.deepEqual(
        result.team!.members.map((m) => m.id),
        [multi]
      );
      assert.equal(
        (await one('SELECT approval_reference_number FROM certificates WHERE request_id=$1', [id]))
          .approval_reference_number,
        'CERT-OLD'
      );
      const certificates = await import('../certificates/certificates.service.js');
      const updatedCertificate = await certificates.updateCertificateFields(
        certificate.id,
        supervisor,
        { approvalReferenceNumber: 'CERT-EDITED' }
      );
      assert.equal(updatedCertificate.approvalReferenceNumber, 'CERT-EDITED');
      assert.deepEqual(await service.getDossierTeam(id), result);
      await pool.query('DELETE FROM certificates WHERE request_id=$1', [id]);
    });
    it('certificate generation still renders the independent Delivery field', async (t) => {
      const id = await dossier();
      await save(id, [agent], 'PROPOSAL-NUMBER');
      const certificate = await one(
        "INSERT INTO certificates(request_id,reference,certificate_type,approval_reference_number) VALUES ($1,$2,'agreement','DELIVERY-NUMBER') RETURNING id",
        [id, `${tag}-gen`]
      );
      const [{ default: puppeteer }, certificates, { UPLOADS_ROOT }] = await Promise.all([
        import('puppeteer'),
        import('../certificates/certificates.service.js'),
        import('../../shared/uploads-root.js'),
      ]);
      let rendered: { approvalReferenceNumber: string } | undefined;
      // Only replace the external browser. The real generator still reads the DB,
      // builds template data, writes the file, registers the asset/version and audits.
      t.mock.method(
        puppeteer,
        'launch',
        async () =>
          ({
            newPage: async () => ({
              setContent: async () => undefined,
              evaluate: async (_fn: unknown, data: { approvalReferenceNumber: string }) => {
                rendered = data;
              },
              pdf: async () => Buffer.from('%PDF-1.4\nteam regression'),
            }),
            close: async () => undefined,
          }) as never
      );
      let asset: { id: number; storage_key: string } | undefined;
      try {
        const generated = await certificates.generateCertificateDocument(
          certificate.id,
          supervisor
        );
        assert.equal(rendered?.approvalReferenceNumber, 'DELIVERY-NUMBER');
        assert.ok(generated.fileUrl);
        asset = await one(
          "SELECT id,storage_key FROM upload_assets WHERE linked_owner_type='certificate_document' AND linked_owner_id=$1",
          [certificate.id]
        );
        assert.ok(asset);
        assert.equal(
          (await service.getDossierTeam(id)).proposal!.proposedApprovalNumber,
          'PROPOSAL-NUMBER'
        );
      } finally {
        if (asset) {
          await unlink(path.join(UPLOADS_ROOT, asset.storage_key));
          await pool.query(
            "DELETE FROM document_versions WHERE owner_type='certificate_document' AND owner_id=$1",
            [certificate.id]
          );
          await pool.query('DELETE FROM upload_assets WHERE id=$1', [asset.id]);
        }
        await pool.query('DELETE FROM certificates WHERE id=$1', [certificate.id]);
      }
    });
    it('allows the same approval number in distinct teams, rejects blanks and duplicates, cascades dossier deletion', async () => {
      const id = await dossier('in_progress', null);
      await pool.query("INSERT INTO phases(request_id, phase_code) VALUES ($1,'M3')", [id]);
      const p = (await save(id)).proposal!;
      await assert.rejects(
        pool.query(
          "INSERT INTO dossier_team_proposals(request_id,proposed_approval_number,proposed_by) VALUES ($1,'DUP',$2)",
          [id, supervisor]
        )
      );
      await assert.rejects(
        pool.query(
          'INSERT INTO dossier_team_proposal_members(proposal_id,user_id) VALUES ($1,$2)',
          [p.id, agent]
        )
      );
      await assert.rejects(
        pool.query(
          "INSERT INTO dossier_teams(request_id,approval_number,finalized_by,finalized_at) VALUES ($1,'  ',$2,now())",
          [id, supervisor]
        )
      );
      const team = await one(
        "INSERT INTO dossier_teams(request_id,approval_number,finalized_by,finalized_at) VALUES ($1,'FINAL-9',$2,now()) RETURNING id",
        [id, supervisor]
      );
      await pool.query('INSERT INTO dossier_team_members(team_id,user_id) VALUES ($1,$2)', [
        team.id,
        agent,
      ]);
      await assert.rejects(
        pool.query('INSERT INTO dossier_team_members(team_id,user_id) VALUES ($1,$2)', [
          team.id,
          agent,
        ])
      );
      await assert.rejects(
        pool.query(
          "INSERT INTO dossier_teams(request_id,approval_number,finalized_by,finalized_at) VALUES ($1,'OTHER',$2,now())",
          [id, supervisor]
        )
      );
      await pool.query('DELETE FROM audit_logs WHERE request_id=$1', [id]);
      await pool.query('DELETE FROM phases WHERE request_id=$1', [id]);
      await pool.query('DELETE FROM requests WHERE id=$1', [id]);
      assert.equal(
        (
          await one(
            'SELECT count(*)::int AS n FROM dossier_team_proposal_members WHERE proposal_id=$1',
            [p.id]
          )
        ).n,
        0
      );
      assert.equal(
        (
          await one('SELECT count(*)::int AS n FROM dossier_team_members WHERE team_id=$1', [
            team.id,
          ])
        ).n,
        0
      );
      assert.equal(
        (await one('SELECT count(*)::int AS n FROM dossier_teams WHERE id=$1', [team.id])).n,
        0
      );
      assert.equal(
        (await one('SELECT count(*)::int AS n FROM dossier_team_proposals WHERE id=$1', [p.id])).n,
        0
      );
    });
  }
);
