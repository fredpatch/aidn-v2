import { Request, NextFunction, Response } from 'express';
import {
  verifyAccessToken,
  verifyApplicantAccessToken,
  TokenPayload,
  ApplicantTokenPayload,
} from '../utils/jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
      applicant?: ApplicantTokenPayload;
    }
  }
}

export const ACCESS_TOKEN_COOKIE = 'aidn_access';
export const REFRESH_TOKEN_COOKIE = 'aidn_refresh';
export const APPLICANT_ACCESS_TOKEN_COOKIE = 'aidn_applicant_access';
export const APPLICANT_REFRESH_TOKEN_COOKIE = 'aidn_applicant_refresh';

export const accessCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

export const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const applicantAccessCookieOptions = {
  ...accessCookieOptions,
  maxAge: 30 * 60 * 1000, // 30 minutes
};

export const applicantRefreshCookieOptions = refreshCookieOptions;

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];

  if (!token) {
    res.status(401).json({ message: 'Non authentifie.' });
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    // Expired token - client should call /api/auth/refresh
    res.status(401).json({ message: 'Session expiree.', code: 'TOKEN_EXPIRED' });
  }
}

export function authenticateApplicant(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[APPLICANT_ACCESS_TOKEN_COOKIE];

  if (!token) {
    res.status(401).json({ message: 'Non authentifie.' });
    return;
  }

  try {
    req.applicant = verifyApplicantAccessToken(token);
    next();
  } catch {
    res.status(401).json({ message: 'Session expiree.', code: 'TOKEN_EXPIRED' });
  }
}

/** M1 - the demande submission endpoint is reachable from the portal
 *  (applicant) and from reception/assistant_dg entering a physical
 *  drop-off (staff) - see cross-cutting pattern "Circuit DG". Accepts
 *  either a valid applicant session or a valid staff session, attaching
 *  whichever one matched.
 *
 *  Both cookies can legitimately be present at once - admin and portal
 *  run on the same top-level domain (differ only by port in dev, and
 *  possibly by subdomain on-prem), so cookies aren't isolated between
 *  them the way a real cross-domain setup would isolate them. Without
 *  knowing which app actually sent the request, a stale staff session
 *  would silently win even when the caller is genuinely the portal.
 *
 *  Fix: use the standard `Origin` header (sent by the browser on every
 *  fetch/XHR call, no frontend change needed) to check the *matching*
 *  cookie first, falling back to the other one only if that fails or is
 *  absent. Requests with no recognized origin (server-to-server, curl,
 *  Postman) keep the previous staff-first behaviour. */
export function authenticateEither(req: Request, res: Response, next: NextFunction): void {
  const staffToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  const applicantToken = req.cookies?.[APPLICANT_ACCESS_TOKEN_COOKIE];

  const origin = req.get('origin');
  const preferApplicant = origin !== undefined && origin === process.env.PORTAL_ORIGIN;

  function tryStaff(): boolean {
    if (!staffToken) return false;
    try {
      req.user = verifyAccessToken(staffToken);
      return true;
    } catch {
      return false;
    }
  }

  function tryApplicant(): boolean {
    if (!applicantToken) return false;
    try {
      req.applicant = verifyApplicantAccessToken(applicantToken);
      return true;
    } catch {
      return false;
    }
  }

  const first = preferApplicant ? tryApplicant : tryStaff;
  const second = preferApplicant ? tryStaff : tryApplicant;

  if (first() || second()) {
    next();
    return;
  }

  res.status(401).json({ message: 'Non authentifie.' });
}

/** Role gate - internal roles only, multi-role aware (see packages/shared
 *  INTERNAL_ROLES). Use after `authenticate`. */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const roles = req.user?.roles ?? [];
    const hasAccess = roles.some((r) => allowedRoles.includes(r));
    if (!hasAccess) {
      res.status(403).json({ message: 'Acces refuse pour ce role.' });
      return;
    }
    next();
  };
}

/** Use after authenticateEither for endpoints shared by portal and admin.
 *  Applicants are allowed through; internal users must match one of the
 *  provided roles. */
export function requireApplicantOrRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.applicant) {
      next();
      return;
    }

    const roles = req.user?.roles ?? [];
    const hasAccess = roles.some((r) => allowedRoles.includes(r));
    if (!hasAccess) {
      res.status(403).json({ message: 'Acces refuse pour ce role.' });
      return;
    }
    next();
  };
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE);
  res.clearCookie(REFRESH_TOKEN_COOKIE);
}

export function clearApplicantAuthCookies(res: Response): void {
  res.clearCookie(APPLICANT_ACCESS_TOKEN_COOKIE);
  res.clearCookie(APPLICANT_REFRESH_TOKEN_COOKIE);
}
