/** Seeds the default configurable values referenced throughout the app.
 *  Run once after the first migration: `npx tsx src/scripts/seed-system-parameters.ts`
 *  Safe to re-run - existing keys are left untouched. */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../shared/db/index.js';
import { systemParameters } from '../shared/db/schema.js';

const DEFAULTS: Array<{
  key: string;
  value: string;
  type: 'integer' | 'boolean' | 'text';
  module: string;
  description: string;
}> = [
  {
    key: 'otp_expiration_minutes',
    value: '15',
    type: 'integer',
    module: 'AUTH',
    description: "Duree de validite d'un code OTP de premiere connexion.",
  },
  {
    key: 'lockout_max_attempts',
    value: '5',
    type: 'integer',
    module: 'AUTH',
    description: 'Nombre de tentatives de connexion echouees avant blocage temporaire.',
  },
  {
    key: 'lockout_duration_minutes',
    value: '30',
    type: 'integer',
    module: 'AUTH',
    description: 'Duree du blocage temporaire apres depassement du nombre de tentatives.',
  },
  {
    key: 'dg_circuit_alert_days',
    value: '3',
    type: 'integer',
    module: 'M1',
    description: 'Seuil (jours ouvres) avant alerte de blocage du circuit DG.',
  },
  {
    key: 'preliminary_evaluation_return_days',
    value: '15',
    type: 'integer',
    module: 'M3',
    description:
      'Delai par defaut (jours) pour le retour de la declaration de pre-evaluation, configurable par DN a chaque envoi.',
  },
  {
    key: 'upload_orphan_retention_days',
    value: '14',
    type: 'integer',
    module: 'M8',
    description:
      'Delai (jours) avant marquage/suppression des uploads non lies a une piece metier.',
  },
  {
    key: 'certificate_dg_full_name',
    value: 'Général de Division Eric Tristan Franck MOUSSAVOU',
    type: 'text',
    module: 'M7',
    description:
      "Nom complet du Directeur General affiche par defaut sur les certificats generes. DN peut le remplacer au cas par cas (dgFullNameOverride) sans changer ce defaut.",
  },
];

async function seed(): Promise<void> {
  for (const param of DEFAULTS) {
    const [existing] = await db
      .select()
      .from(systemParameters)
      .where(eq(systemParameters.key, param.key));

    if (existing) {
      console.log(`[seed] ${param.key} already exists, skipping.`);
      continue;
    }

    await db.insert(systemParameters).values(param);
    console.log(`[seed] Created ${param.key} = ${param.value}`);
  }

  console.log('[seed] Done.');
  process.exit(0);
}

seed().catch((error) => {
  console.error('[seed] Failed:', error);
  process.exit(1);
});
