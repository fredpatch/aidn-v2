/** M8 - the one canonical location of uploaded files: apps/api/uploads.
 *
 *  Resolved from this module's location, not process.cwd(), so it is the same
 *  whether the API runs from src/ (tsx) or dist/ (node), and from any working
 *  directory. src/shared and dist/shared are both two levels below apps/api.
 *  Files are never served from here directly: /api/files resolves an asset's
 *  storage_key inside this root (STORAGE-0A). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UPLOADS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
