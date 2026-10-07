/** M6-RESCHEDULE-1 follow-up - read-only check for data written before the
 *  fix (Batch H1). Never writes to the database.
 *
 *  Before H1, submitInspectionVerdict() could pick a superseded site visit
 *  (status 'rescheduled') when a visit had been rescheduled, so an avis R3
 *  may be attached to the wrong meeting. This lists every site inspection
 *  whose meeting is not the phase's current visit (latest non-rescheduled
 *  site_visit), plus inspections signed by an R3 other than the one assigned
 *  to that current visit. An empty report means no historical data is affected.
 *
 *  `--check` exits non-zero when anything is found (same convention as
 *  db-status.ts), so it can gate a deployment.
 *
 *  Run: npx tsx src/scripts/check-site-inspection-integrity.ts [--check] */
import 'dotenv/config';
import { Pool } from 'pg';

interface Finding {
  inspection_id: number;
  request_reference: string;
  phase_id: number;
  linked_meeting_id: number;
  linked_meeting_status: string;
  current_meeting_id: number | null;
  inspection_r3_id: number;
  current_r3_id: number | null;
  issue: string;
}

const QUERY = `
  WITH current_visit AS (
    SELECT DISTINCT ON (m.phase_id) m.phase_id, m.id AS meeting_id, m.dn_agent_id
    FROM meetings m
    WHERE m.meeting_type = 'site_visit' AND m.status <> 'rescheduled'
    ORDER BY m.phase_id, m.scheduled_at DESC
  )
  SELECT si.id AS inspection_id,
         r.reference AS request_reference,
         si.phase_id,
         si.meeting_id AS linked_meeting_id,
         lm.status::text AS linked_meeting_status,
         cv.meeting_id AS current_meeting_id,
         si.r3_agent_id AS inspection_r3_id,
         cv.dn_agent_id AS current_r3_id,
         CASE
           WHEN cv.meeting_id IS NULL THEN 'no current site visit for this phase'
           WHEN si.meeting_id <> cv.meeting_id THEN 'avis attached to a superseded visit'
           ELSE 'avis signed by an R3 other than the assigned one'
         END AS issue
  FROM site_inspections si
  JOIN meetings lm ON lm.id = si.meeting_id
  JOIN phases p ON p.id = si.phase_id
  JOIN requests r ON r.id = p.request_id
  LEFT JOIN current_visit cv ON cv.phase_id = si.phase_id
  WHERE cv.meeting_id IS NULL
     OR si.meeting_id <> cv.meeting_id
     OR si.r3_agent_id <> cv.dn_agent_id
  ORDER BY si.id`;

async function run(): Promise<void> {
  const check = process.argv.includes('--check');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query<Finding>(QUERY);
    if (rows.length === 0) {
      console.log('OK - every site inspection is attached to the current visit of its phase.');
      return;
    }
    console.log(`${rows.length} site inspection(s) need review:`);
    console.table(rows);
    if (check) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
