import cron from 'node-cron';
import { cleanupStaleOrphanUploads } from '../modules/uploads/uploads.service.js';

/** Marks and physically deletes stale unlinked uploads on a daily schedule.
 *  Retention is read from system_parameters key `upload_orphan_retention_days`
 *  with a fallback of 14 days. */
export async function runUploadOrphanCleanup(): Promise<void> {
  await cleanupStaleOrphanUploads({});
}

/** Runs once per day at 03:30. */
export function startUploadOrphanCleanupJob(): void {
  cron.schedule('30 3 * * *', () => {
    runUploadOrphanCleanup().catch((error) => {
      console.error('[jobs/upload-orphan-cleanup] Failed:', error);
    });
  });
}
