import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import { runReferenceDataSeed, type SeedRunContext } from './seeding.service.js';
import { SeedingError, type SeedingRunResult } from './seeding.types.js';
import { DOCUMENT_TEMPLATE_SEEDS, templateCreationAudit } from './seeds/document-templates.seed.js';
import { handleSeedingError } from '../../shared/utils/error.js';

const RUN: SeedingRunResult = {
  seeds: [
    {
      name: 'system-parameters',
      label: 'System parameters',
      created: 1,
      skipped: 1,
      items: [
        { key: 'alpha', status: 'created' },
        { key: 'beta', status: 'skipped' },
      ],
    },
    {
      name: 'document-templates',
      label: 'Document templates',
      created: 1,
      skipped: 0,
      items: [{ key: 'dn_air_r2_3_f_e_012', status: 'created', asset: 'DN-AIR-R2-3-F-E-012-FDAPM.docx' }],
    },
  ],
};

type AuditEntry = { userId?: number; action: string; module: string; details?: Record<string, unknown> };

function deps(overrides: { run?: SeedingRunResult | Error; auditError?: Error } = {}) {
  const calls = { contexts: [] as SeedRunContext[], audits: [] as AuditEntry[] };
  return {
    calls,
    runSeeds: async (context?: SeedRunContext) => {
      calls.contexts.push(context!);
      if (overrides.run instanceof Error) throw overrides.run;
      return overrides.run ?? RUN;
    },
    logAudit: async (entry: AuditEntry) => {
      if (overrides.auditError) throw overrides.auditError;
      calls.audits.push(entry);
    },
  };
}

describe('runReferenceDataSeed', () => {
  it('runs the shared seed runner as a manual run by the SU', async () => {
    const d = deps();
    await runReferenceDataSeed(42, d);
    assert.deepEqual(d.calls.contexts, [{ trigger: 'manual', actorUserId: 42 }]);
  });

  it('returns totals and created keys per seed, without bundled file names', async () => {
    const result = await runReferenceDataSeed(42, deps());
    assert.deepEqual(result, {
      created: 2,
      skipped: 1,
      seeds: [
        { name: 'system-parameters', label: 'System parameters', created: 1, skipped: 1, createdKeys: ['alpha'] },
        { name: 'document-templates', label: 'Document templates', created: 1, skipped: 0, createdKeys: ['dn_air_r2_3_f_e_012'] },
      ],
    });
    assert.ok(!JSON.stringify(result).includes('.docx'));
  });

  it('audits a successful run with the SU as actor', async () => {
    const d = deps();
    await runReferenceDataSeed(42, d);
    assert.deepEqual(d.calls.audits, [
      {
        userId: 42,
        action: 'REFERENCE_DATA_SEED_RUN',
        module: 'M13',
        details: { created: 2, skipped: 1, createdKeys: ['alpha', 'dn_air_r2_3_f_e_012'] },
      },
    ]);
  });

  it('audits a run that created nothing', async () => {
    const empty: SeedingRunResult = {
      seeds: [{ name: 'system-parameters', label: 'System parameters', created: 0, skipped: 2, items: [] }],
    };
    const d = deps({ run: empty });
    await runReferenceDataSeed(7, d);
    assert.equal(d.calls.audits.length, 1);
    assert.deepEqual(d.calls.audits[0].details, { created: 0, skipped: 2, createdKeys: [] });
  });

  it('does not audit a failed run and rethrows the seeding error', async () => {
    const failure = new SeedingError('document-templates', 'copy', new Error('disk full'));
    const d = deps({ run: failure });
    await assert.rejects(runReferenceDataSeed(42, d), failure);
    assert.equal(d.calls.audits.length, 0);
  });

  it('still reports success when the audit write fails after the commit', async () => {
    const result = await runReferenceDataSeed(42, deps({ auditError: new Error('audit down') }));
    assert.equal(result.created, 2);
  });
});

describe('templateCreationAudit', () => {
  const definition = DOCUMENT_TEMPLATE_SEEDS[3];

  it('keeps the startup convention by default: no user, source startup-seed', () => {
    assert.deepEqual(templateCreationAudit(definition, 9), {
      userId: null,
      action: 'DOCUMENT_TEMPLATE_CREATED',
      module: 'M13',
      entityId: 9,
      details: { key: definition.key, source: 'startup-seed', asset: definition.assetFileName },
    });
  });

  it('records the SU and source manual-run for a manual run', () => {
    const entry = templateCreationAudit(definition, 9, { trigger: 'manual', actorUserId: 42 });
    assert.equal(entry.userId, 42);
    assert.equal(entry.details.source, 'manual-run');
  });
});

describe('SeedingError code', () => {
  it('defaults to SEED_FAILED', () => {
    assert.equal(new SeedingError('x', 'y', new Error('z')).code, 'SEED_FAILED');
  });

  it('can be marked as a lock timeout', () => {
    assert.equal(new SeedingError('x', 'y', new Error('z'), 'LOCK_TIMEOUT').code, 'LOCK_TIMEOUT');
  });
});

describe('handleSeedingError', () => {
  function fakeResponse() {
    const res = { statusCode: 0, body: undefined as unknown };
    const response = {
      status(code: number) {
        res.statusCode = code;
        return response;
      },
      json(body: unknown) {
        res.body = body;
        return response;
      },
    };
    return { res, response: response as unknown as Response };
  }

  it('maps a lock timeout to 409', () => {
    const { res, response } = fakeResponse();
    handleSeedingError(response, new SeedingError('reference-data', 'lock', new Error('timeout'), 'LOCK_TIMEOUT'));
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, {
      message: 'Une vérification des données de référence est déjà en cours. Réessayez dans un instant.',
      code: 'LOCK_TIMEOUT',
    });
  });

  it('maps any other seeding failure to 500 without leaking the internal message', () => {
    const { res, response } = fakeResponse();
    const original = console.error;
    console.error = () => {};
    try {
      handleSeedingError(response, new SeedingError('document-templates', 'copy', new Error('EACCES /srv/secret')));
    } finally {
      console.error = original;
    }
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: 'Impossible de créer les éléments manquants.', code: 'SEED_FAILED' });
  });
});
