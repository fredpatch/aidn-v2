import { Request, Response } from "express";
import * as applicantAuthService from "./applicant-auth.service.js";
import { handleAuthError } from "../../shared/utils/error.js";
import {
  applicantAccessCookieOptions,
  applicantRefreshCookieOptions,
  clearApplicantAuthCookies,
  APPLICANT_ACCESS_TOKEN_COOKIE,
  APPLICANT_REFRESH_TOKEN_COOKIE,
} from "../../shared/guards/auth.middleware.js";

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: "Email et mot de passe requis." });
    return;
  }

  try {
    const { tokens, applicant } = await applicantAuthService.login({ email, password });

    res.cookie(APPLICANT_ACCESS_TOKEN_COOKIE, tokens.accessToken, applicantAccessCookieOptions);
    res.cookie(APPLICANT_REFRESH_TOKEN_COOKIE, tokens.refreshToken, applicantRefreshCookieOptions);

    res.json({ applicant });
  } catch (error) {
    handleAuthError(res, error);
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken = req.cookies?.[APPLICANT_REFRESH_TOKEN_COOKIE];

  if (!refreshToken) {
    res.status(401).json({ message: "Refresh token manquant." });
    return;
  }

  try {
    const { accessToken } = await applicantAuthService.refreshToken(refreshToken);
    res.cookie(APPLICANT_ACCESS_TOKEN_COOKIE, accessToken, applicantAccessCookieOptions);
    res.json({ message: "Token renouvele." });
  } catch (error) {
    clearApplicantAuthCookies(res);
    handleAuthError(res, error);
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  clearApplicantAuthCookies(res);
  res.json({ message: "Deconnexion reussie." });
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    const applicant = await applicantAuthService.me(req.applicant!.applicantId);
    res.json(applicant);
  } catch (error) {
    handleAuthError(res, error);
  }
}
