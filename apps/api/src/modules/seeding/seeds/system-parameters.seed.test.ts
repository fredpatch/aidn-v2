import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SYSTEM_PARAMETER_SEEDS,
  seedSystemParameters,
  type SystemParameterSeedDefinition,
  type SystemParameterSeedStore,
} from './system-parameters.seed.js';

interface StoredParameter {
  value: string;
  type: string;
  module: string;
  description: string;
}

/** In-memory stand-in for the system_parameters table, with the same
 *  "unique key, insert does nothing on conflict" contract as the DB store. */
function createMemoryStore(initial: Record<string, string> = {}) {
  const rows = new Map<string, StoredParameter>(
    Object.entries(initial).map(([key, value]) => [
      key,
      { value, type: 'integer', module: 'TEST', description: 'existing' },
    ])
  );
  const store: SystemParameterSeedStore = {
    async findExistingKeys(keys) {
      return new Set(keys.filter((key) => rows.has(key)));
    },
    async insertIfMissing(definition) {
      if (rows.has(definition.key)) return false;
      rows.set(definition.key, {
        value: definition.defaultValue,
        type: definition.type,
        module: definition.module,
        description: definition.description,
      });
      return true;
    },
  };
  return { store, rows };
}

describe('system parameter seed definitions', () => {
  it('keeps the 17 current parameters with unique keys', () => {
    const keys = SYSTEM_PARAMETER_SEEDS.map((definition) => definition.key);
    assert.equal(keys.length, 17);
    assert.equal(new Set(keys).size, 17);
  });

  it('preserves the current default values', () => {
    const byKey = new Map(SYSTEM_PARAMETER_SEEDS.map((d) => [d.key, d]));
    assert.equal(byKey.get('lockout_max_attempts')?.defaultValue, '5');
    assert.equal(byKey.get('dg_circuit_alert_days')?.defaultValue, '3');
    assert.equal(byKey.get('dashboard_sla_phase_m5_days')?.defaultValue, '30');
    assert.equal(byKey.get('certificate_dg_full_name')?.type, 'text');
    // Empty by default: DN enters the holidays; working days then exclude only weekends.
    assert.equal(byKey.get('public_holidays')?.defaultValue, '');
    assert.equal(byKey.get('public_holidays')?.type, 'text');
    assert.equal(byKey.get('public_holidays')?.module, 'M1');
  });
});

describe('seedSystemParameters', () => {
  it('creates every definition in an empty table', async () => {
    const { store, rows } = createMemoryStore();

    const result = await seedSystemParameters(store);

    assert.equal(result.name, 'system-parameters');
    assert.equal(result.created, 17);
    assert.equal(result.skipped, 0);
    assert.equal(rows.size, 17);
    assert.ok(result.items.every((item) => item.status === 'created'));
  });

  it('creates nothing on a second run', async () => {
    const { store, rows } = createMemoryStore();
    await seedSystemParameters(store);

    const second = await seedSystemParameters(store);

    assert.equal(second.created, 0);
    assert.equal(second.skipped, 17);
    assert.equal(rows.size, 17);
  });

  it('never overwrites an administrator-configured value', async () => {
    const { store, rows } = createMemoryStore({ lockout_max_attempts: '8' });

    const result = await seedSystemParameters(store);

    assert.equal(rows.get('lockout_max_attempts')?.value, '8');
    assert.equal(rows.get('lockout_max_attempts')?.description, 'existing');
    assert.deepEqual(
      result.items.find((item) => item.key === 'lockout_max_attempts'),
      { key: 'lockout_max_attempts', status: 'skipped' }
    );
  });

  it('only creates the missing keys in a partially seeded table', async () => {
    const { store } = createMemoryStore({
      otp_expiration_minutes: '15',
      lockout_max_attempts: '5',
      certificate_dg_full_name: 'Nom existant',
    });

    const result = await seedSystemParameters(store);

    assert.equal(result.created, 14);
    assert.equal(result.skipped, 3);
    const skipped = result.items.filter((item) => item.status === 'skipped').map((item) => item.key);
    assert.deepEqual(skipped.sort(), ['certificate_dg_full_name', 'lockout_max_attempts', 'otp_expiration_minutes']);
  });

  it('inserts a definition added in a later version without touching existing rows', async () => {
    const { store, rows } = createMemoryStore();
    await seedSystemParameters(store);
    rows.get('lockout_max_attempts')!.value = '9';
    const nextVersion: SystemParameterSeedDefinition[] = [
      ...SYSTEM_PARAMETER_SEEDS,
      {
        key: 'new_feature_timeout_days',
        defaultValue: '7',
        type: 'integer',
        module: 'M99',
        description: 'Parametre ajoute dans une version ulterieure.',
      },
    ];

    const result = await seedSystemParameters(store, nextVersion);

    assert.equal(result.created, 1);
    assert.equal(result.skipped, 17);
    assert.deepEqual(
      result.items.find((item) => item.status === 'created'),
      { key: 'new_feature_timeout_days', status: 'created' }
    );
    assert.equal(rows.get('new_feature_timeout_days')?.value, '7');
    assert.equal(rows.get('lockout_max_attempts')?.value, '9');
  });

  it('reports a key as skipped when another instance inserted it first', async () => {
    const { store } = createMemoryStore();
    // Lookup sees nothing, but the insert hits the unique key (race lost).
    const racingStore: SystemParameterSeedStore = {
      findExistingKeys: async () => new Set(),
      insertIfMissing: async (definition) =>
        definition.key === 'otp_expiration_minutes' ? false : store.insertIfMissing(definition),
    };

    const result = await seedSystemParameters(racingStore);

    assert.equal(result.created, 16);
    assert.equal(result.skipped, 1);
  });

  it('returns one item per definition, in definition order', async () => {
    const { store } = createMemoryStore({ dg_circuit_alert_days: '4' });

    const result = await seedSystemParameters(store);

    assert.deepEqual(
      result.items.map((item) => item.key),
      SYSTEM_PARAMETER_SEEDS.map((definition) => definition.key)
    );
    assert.equal(result.created + result.skipped, result.items.length);
  });

  it('names the failing operation when the store throws', async () => {
    const failingStore: SystemParameterSeedStore = {
      findExistingKeys: async () => new Set(),
      insertIfMissing: async (definition) => {
        if (definition.key === 'lockout_duration_minutes') throw new Error('connection reset');
        return true;
      },
    };

    await assert.rejects(seedSystemParameters(failingStore), (error: Error) => {
      assert.match(error.message, /system-parameters/);
      assert.match(error.message, /lockout_duration_minutes/);
      assert.match(error.message, /connection reset/);
      return true;
    });
  });
});
