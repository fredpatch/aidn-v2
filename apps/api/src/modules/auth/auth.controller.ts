import { Request, Response } from "express";
import * as authService from "./auth.service.js";
import { handleAuthError } from "../../shared/utils/error.js";
import {
  accessCookieOptions,
  refreshCookieOptions,
  clearAuthCookies,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "../../shared/guards/auth.middleware.js";
import { db } from "../../shared/db/index.js";
import { users } from "../../shared/db/schema.js";
import { eq } from "drizzle-orm";
import { buildUserPublic } from "./auth.helpers.js";

export async function login(req: Request, res: Response): Promise<void> {
  const { employeeCode, otp, password } = req.body ?? {};

  if (!employeeCode) {
    res.status(400).json({ message: "Matricule requis." });
    return;
  }

  try {
    const result = await authService.login({ employeeCode, otp, password, ip: req.ip });

    if (result.firstLogin && result.tokens) {
      res.cookie(ACCESS_TOKEN_COOKIE, result.tokens.accessToken, {
        ...accessCookieOptions,
        maxAge: 5 * 60 * 1000, // 5 minutes
      });
      res.json({ firstLogin: true, message: result.message });
      return;
    }

    if (result.tokens) {
      res.cookie(ACCESS_TOKEN_COOKIE, result.tokens.accessToken, accessCookieOptions);
      res.cookie(REFRESH_TOKEN_COOKIE, result.tokens.refreshToken, refreshCookieOptions);
    }

    res.json({ firstLogin: false, user: result.user });
  } catch (error) {
    handleAuthError(res, error);
  }
}

export async function setPassword(req: Request, res: Response): Promise<void> {
  const { password, confirmation } = req.body ?? {};

  if (!password || !confirmation) {
    res.status(400).json({ message: "Mot de passe et confirmation requis." });
    return;
  }

  try {
    const { tokens, user } = await authService.setPassword({
      userId: req.user!.userId,
      password,
      confirmation,
      ip: req.ip,
    });

    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, accessCookieOptions);
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshCookieOptions);

    res.json({ message: "Mot de passe defini avec succes.", user });
  } catch (error) {
    handleAuthError(res, error);
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];

  if (!refreshToken) {
    res.status(401).json({ message: "Refresh token manquant." });
    return;
  }

  try {
    const { accessToken } = await authService.refreshToken(refreshToken);
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, accessCookieOptions);
    res.json({ message: "Token renouvele." });
  } catch (error) {
    clearAuthCookies(res);
    handleAuthError(res, error);
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    await authService.logAudit({
      userId: req.user!.userId,
      action: "LOGOUT",
      module: "M13",
      ip: req.ip,
    });
  } catch (error) {
    console.error("[auth/logout] Audit error:", error);
  } finally {
    clearAuthCookies(res);
    res.json({ message: "Deconnexion reussie." });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId));
    if (!user) {
      res.status(404).json({ message: "Utilisateur introuvable." });
      return;
    }
    res.json(await buildUserPublic(user));
  } catch (error) {
    console.error("[auth/me]", error);
    res.status(500).json({ message: "Erreur interne." });
  }
}
