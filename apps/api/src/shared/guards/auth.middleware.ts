import { Request, NextFunction, Response } from "express";
import { verifyAccessToken, TokenPayload } from "../utils/jwt.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const ACCESS_TOKEN_COOKIE = "aidn_access";
export const REFRESH_TOKEN_COOKIE = "aidn_refresh";

export const accessCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

export const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];

  if (!token) {
    res.status(401).json({ message: "Non authentifie." });
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    // Expired token - client should call /api/auth/refresh
    res.status(401).json({ message: "Session expiree.", code: "TOKEN_EXPIRED" });
  }
}

/** Role gate - internal roles only, multi-role aware (see packages/shared
 *  INTERNAL_ROLES). Use after `authenticate`. */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const roles = req.user?.roles ?? [];
    const hasAccess = roles.some((r) => allowedRoles.includes(r));
    if (!hasAccess) {
      res.status(403).json({ message: "Acces refuse pour ce role." });
      return;
    }
    next();
  };
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE);
  res.clearCookie(REFRESH_TOKEN_COOKIE);
}
