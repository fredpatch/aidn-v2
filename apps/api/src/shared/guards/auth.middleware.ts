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
    res.status(401).json({ message: 'Non authentifié.' });
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    // Expired token - client should call /api/auth/refresh
    res.status(401).json({ message: 'Session expirée.', code: 'TOKEN_EXPIRED' });
  }
}

export function authenticateApplicant(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[APPLICANT_ACCESS_TOKEN_COOKIE];

  if (!token) {
    res.status(401).json({ message: 'Non authentifié.' });
    return;
  }

  try {
    req.applicant = verifyApplicantAccessToken(token);
    next();
  } catch {
    res.status(401).json({ message: 'Session expirée.', code: 'TOKEN_EXPIRED' });
  }
}

export const AMBIGUOUS_SESSION_BODY = {
  message: 'Session ambiguë : reconnectez-vous depuis l’application concernée.',
  code: 'AMBIGUOUS_SESSION',
} as const;

/** Which app sent the request: the `Origin` header, or - when the browser
 *  omits it (same-origin GET through the dev/nginx proxy) - the origin of
 *  `Referer`. Matched against ADMIN_ORIGIN / PORTAL_ORIGIN only; anything
 *  else (or both env vars equal) is unknown. */
export function requestApp(req: Request): 'admin' | 'portal' | null {
  const origin = req.get('origin') ?? refererOrigin(req.get('referer'));
  if (!origin) return null;
  const isAdmin = !!process.env.ADMIN_ORIGIN && origin === process.env.ADMIN_ORIGIN;
  const isPortal = !!process.env.PORTAL_ORIGIN && origin === process.env.PORTAL_ORIGIN;
  if (isAdmin === isPortal) return null;
  return isAdmin ? 'admin' : 'portal';
}

function refererOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

function verifyOrNull<T>(verify: (token: string) => T, token: string | undefined): T | null {
  if (!token) return null;
  try {
    return verify(token);
  } catch {
    return null;
  }
}

/** Endpoints shared by the portal (applicant) and the admin (staff), e.g.
 *  M1 submission: portal self-submission or reception/assistant_dg manual
 *  entry. Both cookies can be present at once (same host, cookies are not
 *  port-scoped), so the session is chosen by identity domain, never by
 *  fallback (BUG-PORTAL-INTAKE-1, same rule as STORAGE-0A A1):
 *  - portal app -> applicant session only (`authenticateApplicant`, so an
 *    expired token answers TOKEN_EXPIRED and the portal refreshes);
 *  - admin app -> staff session only (`authenticate`);
 *  - unknown app (curl, server-to-server) -> the single valid session;
 *    two valid sessions -> 401 AMBIGUOUS_SESSION; none -> 401. */
export function authenticateEither(req: Request, res: Response, next: NextFunction): void {
  const app = requestApp(req);
  if (app === 'portal') return authenticateApplicant(req, res, next);
  if (app === 'admin') return authenticate(req, res, next);

  const staff = verifyOrNull(verifyAccessToken, req.cookies?.[ACCESS_TOKEN_COOKIE]);
  const applicant = verifyOrNull(verifyApplicantAccessToken, req.cookies?.[APPLICANT_ACCESS_TOKEN_COOKIE]);
  if (staff && applicant) {
    res.status(401).json(AMBIGUOUS_SESSION_BODY);
    return;
  }
  if (staff) req.user = staff;
  else if (applicant) req.applicant = applicant;
  else {
    res.status(401).json({ message: 'Non authentifié.' });
    return;
  }
  next();
}

/** Role gate - internal roles only, multi-role aware (see packages/shared
 *  INTERNAL_ROLES). Use after `authenticate`. */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const roles = req.user?.roles ?? [];
    const hasAccess = roles.some((r) => allowedRoles.includes(r));
    if (!hasAccess) {
      res.status(403).json({ message: 'Accès refusé pour ce rôle.' });
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
      res.status(403).json({ message: 'Accès refusé pour ce rôle.' });
      return;
    }
    next();
  };
}

/** Use after authenticateEither for portal-only write actions. */
export function requireApplicant(req: Request, res: Response, next: NextFunction): void {
  if (!req.applicant) {
    res.status(403).json({ message: 'Accès réservé au portail postulant.' });
    return;
  }
  next();
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE);
  res.clearCookie(REFRESH_TOKEN_COOKIE);
}

export function clearApplicantAuthCookies(res: Response): void {
  res.clearCookie(APPLICANT_ACCESS_TOKEN_COOKIE);
  res.clearCookie(APPLICANT_REFRESH_TOKEN_COOKIE);
}
