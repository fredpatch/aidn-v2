import fs from 'node:fs';
import { Request, Response } from 'express';
import { ACCESS_TOKEN_COOKIE, APPLICANT_ACCESS_TOKEN_COOKIE } from '../../shared/guards/auth.middleware.js';
import { verifyAccessToken, verifyApplicantAccessToken } from '../../shared/utils/jwt.js';
import { createFileGrant, fileGrantSecret, verifyFileGrant, type FileDisposition } from './file-grant.js';
import { buildFileHeaders, resolveFileActor } from './file-delivery.js';
import { authorizeFile, findAsset, locateAssetFile, type StoredAsset } from './files.service.js';
import type { FileActor } from './file-access.policy.js';

const NOT_FOUND = { message: 'Fichier introuvable.' };
const INVALID_GRANT = { message: 'Lien expiré ou invalide.' };

function assetId(req: Request): number | null {
  const id = Number(req.params.id);
  return /^[1-9]\d*$/.test(String(req.params.id)) && Number.isSafeInteger(id) ? id : null;
}

function tryVerify<T>(verify: () => T): T | null {
  try {
    return verify();
  } catch {
    return null;
  }
}

/** Amendment A1: never guess between two valid sessions. */
function actorFrom(req: Request, res: Response): FileActor | null {
  const staffToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  const applicantToken = req.cookies?.[APPLICANT_ACCESS_TOKEN_COOKIE];
  const resolution = resolveFileActor({
    staff: staffToken ? tryVerify(() => verifyAccessToken(staffToken)) : null,
    applicant: applicantToken ? tryVerify(() => verifyApplicantAccessToken(applicantToken)) : null,
    origin: req.get('origin'),
    adminOrigin: process.env.ADMIN_ORIGIN,
    portalOrigin: process.env.PORTAL_ORIGIN,
  });
  if (resolution.actor) return resolution.actor;
  if (resolution.error === 'ambiguous') {
    res.status(401).json({
      message: 'Session ambiguë : reconnectez-vous depuis l’application concernée.',
      code: 'AMBIGUOUS_SESSION',
    });
  } else {
    // Same shape as authenticate(): lets the apps refresh an expired session.
    res.status(401).json({ message: 'Session expirée.', code: 'TOKEN_EXPIRED' });
  }
  return null;
}

/** Streams an authorized asset with server-derived headers (also used by
 *  report downloads, whose route already enforces its roles). */
export async function sendAssetFile(res: Response, asset: StoredAsset, disposition: FileDisposition): Promise<void> {
  const file = await locateAssetFile(asset);
  if (!file) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  res.set(
    buildFileHeaders({ mimeType: asset.mimeType, originalName: asset.originalName, sizeBytes: file.sizeBytes }, disposition)
  );
  const readStream = fs.createReadStream(file.path);
  readStream.on('error', (error) => {
    // Never log the request URL here: it may carry a grant.
    console.error(`[files] Read failed for asset ${asset.id}:`, error.message);
    if (!res.headersSent) res.status(404).json(NOT_FOUND);
    else res.destroy();
  });
  res.on('close', () => readStream.destroy());
  readStream.pipe(res);
}

/** GET /api/files/:id - the stable address, for authenticated programmatic use. */
export async function get(req: Request, res: Response): Promise<void> {
  const id = assetId(req);
  const actor = actorFrom(req, res);
  if (!actor) return;
  try {
    const asset = id === null ? null : await authorizeFile(actor, id);
    if (!asset) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    await sendAssetFile(res, asset, 'inline');
  } catch (error) {
    console.error('[files/get]', error instanceof Error ? error.message : error);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
}

/** POST /api/files/:id/access - checks access, returns a 5-minute signed link. */
export async function access(req: Request, res: Response): Promise<void> {
  const id = assetId(req);
  const actor = actorFrom(req, res);
  if (!actor) return;

  const disposition = (req.body ?? {}).disposition ?? 'inline';
  if (disposition !== 'inline' && disposition !== 'attachment') {
    res.status(400).json({ message: 'Mode de remise invalide (inline ou attachment).' });
    return;
  }

  try {
    const asset = id === null ? null : await authorizeFile(actor, id);
    if (!asset || !(await locateAssetFile(asset))) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    const { token, expiresAt } = createFileGrant({ assetId: asset.id, actor, disposition, secret: fileGrantSecret() });
    res.set('Cache-Control', 'no-store');
    res.json({
      url: `/api/files/${asset.id}/content?grant=${encodeURIComponent(token)}`,
      expiresAt: expiresAt.toISOString(),
      mimeType: asset.mimeType,
      originalName: asset.originalName,
      sizeBytes: asset.sizeBytes,
      disposition,
    });
  } catch (error) {
    console.error('[files/access]', error instanceof Error ? error.message : error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
}

/** GET /api/files/:id/content?grant= - the grant alone authorizes; the
 *  disposition comes from the signed grant only. */
export async function content(req: Request, res: Response): Promise<void> {
  const id = assetId(req);
  const token = typeof req.query.grant === 'string' ? req.query.grant : '';
  const grant = id === null ? null : verifyFileGrant(token, id, { secret: fileGrantSecret() });
  if (!grant || id === null) {
    res.status(403).json(INVALID_GRANT);
    return;
  }
  try {
    const asset = await findAsset(id);
    if (!asset) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    await sendAssetFile(res, asset, grant.disposition);
  } catch (error) {
    console.error('[files/content]', error instanceof Error ? error.message : error);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
}
