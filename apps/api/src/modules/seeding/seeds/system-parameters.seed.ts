/** Authoritative default system parameters. Used by API startup seeding and
 *  by `npm run seed:params` - there is no other copy of these definitions.
 *
 *  Rule: a missing key is created with its default; an existing key is left
 *  exactly as it is (value, type, module and description), so an
 *  administrator's configuration always wins. To ship a new parameter, add a
 *  definition here - the next startup creates it everywhere it is missing. */
import { inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../../shared/db/schema.js';
import { SeedingError, type SeedItemResult, type SeedResult } from '../seeding.types.js';

export interface SystemParameterSeedDefinition {
  key: string;
  defaultValue: string;
  type: 'integer' | 'boolean' | 'text';
  module: string;
  description: string;
}

export const SYSTEM_PARAMETER_SEEDS: readonly SystemParameterSeedDefinition[] = [
  {
    key: 'otp_expiration_minutes',
    defaultValue: '15',
    type: 'integer',
    module: 'AUTH',
    description: "Duree de validite d'un code OTP de premiere connexion.",
  },
  {
    key: 'lockout_max_attempts',
    defaultValue: '5',
    type: 'integer',
    module: 'AUTH',
    description: 'Nombre de tentatives de connexion echouees avant blocage temporaire.',
  },
  {
    key: 'lockout_duration_minutes',
    defaultValue: '30',
    type: 'integer',
    module: 'AUTH',
    description: 'Duree du blocage temporaire apres depassement du nombre de tentatives.',
  },
  {
    key: 'dg_circuit_alert_days',
    defaultValue: '3',
    type: 'integer',
    module: 'M1',
    description: 'Seuil (jours ouvres) avant alerte de blocage du circuit DG.',
  },
  {
    key: 'public_holidays',
    // Empty on purpose: DN enters the official list (movable holidays change
    // every year); until then working days exclude weekends only.
    defaultValue: '',
    type: 'text',
    module: 'M1',
    description:
      'Jours feries exclus des jours ouvres (circuit DG) : AAAA-MM-JJ pour une date precise, MM-JJ pour chaque annee, separes par des virgules.',
  },
  {
    key: 'preliminary_evaluation_return_days',
    defaultValue: '15',
    type: 'integer',
    module: 'M3',
    description:
      'Delai par defaut (jours) pour le retour de la declaration de pre-evaluation, configurable par DN a chaque envoi.',
  },
  {
    key: 'upload_orphan_retention_days',
    // defaultValue: '14',
    defaultValue: '3650',
    type: 'integer',
    module: 'M8',
    description:
      'Delai (jours) avant marquage/suppression des uploads non lies a une piece metier.',
  },
  {
    key: 'dashboard_sla_phase_m3_days',
    defaultValue: '15',
    type: 'integer',
    module: 'M12',
    description: 'Cible dashboard (jours calendaires) pour une phase preliminaire ouverte.',
  },
  {
    key: 'dashboard_sla_phase_m4_days',
    defaultValue: '20',
    type: 'integer',
    module: 'M12',
    description: 'Cible dashboard (jours calendaires) pour une phase demande formelle ouverte.',
  },
  {
    key: 'dashboard_sla_phase_m5_days',
    defaultValue: '30',
    type: 'integer',
    module: 'M12',
    description:
      'Cible dashboard (jours calendaires) pour une phase evaluation approfondie ouverte.',
  },
  {
    key: 'dashboard_sla_phase_m6_days',
    defaultValue: '30',
    type: 'integer',
    module: 'M12',
    description:
      'Cible dashboard (jours calendaires) pour une phase demonstration/inspection ouverte.',
  },
  {
    key: 'dashboard_sla_phase_m7_days',
    defaultValue: '10',
    type: 'integer',
    module: 'M12',
    description: 'Cible dashboard (jours calendaires) pour une phase delivrance ouverte.',
  },
  {
    key: 'dashboard_sla_signature_deposit_days',
    defaultValue: '1',
    type: 'integer',
    module: 'M12',
    description:
      'Cible dashboard (jours calendaires) entre depot courrier et mise en circuit signature.',
  },
  {
    key: 'dashboard_sla_invoice_upload_days',
    defaultValue: '2',
    type: 'integer',
    module: 'M12',
    description: 'Cible dashboard (jours calendaires) pour envoi facture par S5.',
  },
  {
    key: 'dashboard_sla_payment_validation_days',
    defaultValue: '1',
    type: 'integer',
    module: 'M12',
    description: 'Cible dashboard (jours calendaires) pour validation preuve paiement par S5.',
  },
  {
    key: 'dashboard_sla_document_evaluation_days',
    defaultValue: '2',
    type: 'integer',
    module: 'M12',
    description: 'Cible dashboard (jours calendaires) pour verdict DN sur une piece documentaire.',
  },
  {
    key: 'certificate_dg_full_name',
    defaultValue: 'Général de Division Eric Tristan Franck MOUSSAVOU',
    type: 'text',
    module: 'M7',
    description:
      'Nom complet du Directeur General affiche par defaut sur les certificats generes. DN peut le remplacer au cas par cas (dgFullNameOverride) sans changer ce defaut.',
  },
];

/** Storage operations the seed needs. The DB implementation is below; tests
 *  use an in-memory one with the same contract. */
export interface SystemParameterSeedStore {
  findExistingKeys(keys: string[]): Promise<Set<string>>;
  /** Inserts the definition unless the key exists. Returns true if a row was
   *  created, false if the key was already there (including a lost race). */
  insertIfMissing(definition: SystemParameterSeedDefinition): Promise<boolean>;
}

const SEED_NAME = 'system-parameters';

export async function seedSystemParameters(
  store: SystemParameterSeedStore,
  definitions: readonly SystemParameterSeedDefinition[] = SYSTEM_PARAMETER_SEEDS
): Promise<SeedResult> {
  let existing: Set<string>;
  try {
    existing = await store.findExistingKeys(definitions.map((definition) => definition.key));
  } catch (error) {
    throw new SeedingError(SEED_NAME, 'lookup of existing keys', error);
  }

  const items: SeedItemResult[] = [];
  for (const definition of definitions) {
    if (existing.has(definition.key)) {
      items.push({ key: definition.key, status: 'skipped' });
      continue;
    }
    let created: boolean;
    try {
      created = await store.insertIfMissing(definition);
    } catch (error) {
      throw new SeedingError(SEED_NAME, `insert of "${definition.key}"`, error);
    }
    items.push({ key: definition.key, status: created ? 'created' : 'skipped' });
  }

  const created = items.filter((item) => item.status === 'created').length;
  return {
    name: SEED_NAME,
    label: 'System parameters',
    created,
    skipped: items.length - created,
    items,
  };
}

/** Accepts the root db or a transaction - both expose the same query API. */
type SeedExecutor = Pick<NodePgDatabase<typeof schema>, 'select' | 'insert'>;

export function createDbSystemParameterStore(executor: SeedExecutor): SystemParameterSeedStore {
  return {
    async findExistingKeys(keys) {
      if (keys.length === 0) return new Set();
      const rows = await executor
        .select({ key: schema.systemParameters.key })
        .from(schema.systemParameters)
        .where(inArray(schema.systemParameters.key, keys));
      return new Set(rows.map((row) => row.key));
    },
    async insertIfMissing(definition) {
      const inserted = await executor
        .insert(schema.systemParameters)
        .values({
          key: definition.key,
          value: definition.defaultValue,
          type: definition.type,
          module: definition.module,
          description: definition.description,
        })
        .onConflictDoNothing({ target: schema.systemParameters.key })
        .returning({ id: schema.systemParameters.id });
      return inserted.length > 0;
    },
  };
}
