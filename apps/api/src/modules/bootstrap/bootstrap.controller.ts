import { Request, Response } from "express";
import * as bootstrapService from "./bootstrap.service.js";

/** GET /api/bootstrap/status - checked by the React client on startup to
 *  decide whether to show the bootstrap screen or the login screen. */
export async function status(_req: Request, res: Response): Promise<void> {
  try {
    const initialised = await bootstrapService.isInitialised();
    res.json({ initialised });
  } catch (error) {
    console.error("[bootstrap/status]", error);
    res.status(500).json({ message: "Erreur interne." });
  }
}

/** POST /api/bootstrap/init - creates the first SU. Disabled once the
 *  system is already initialised. */
export async function init(req: Request, res: Response): Promise<void> {
  try {
    const alreadyInitialised = await bootstrapService.isInitialised();
    if (alreadyInitialised) {
      res.status(403).json({
        message: "Le systeme est deja initialise.",
        code: "SYSTEM_ALREADY_INITIALISED",
      });
      return;
    }

    const { employeeCode, fullName, email, password, confirmation } = req.body ?? {};

    if (!employeeCode || !fullName || !email || !password || !confirmation) {
      res.status(400).json({
        message: "Tous les champs sont requis : employeeCode, fullName, email, password, confirmation.",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ message: "Email invalide." });
      return;
    }

    if (password !== confirmation) {
      res.status(400).json({ message: "Les mots de passe ne correspondent pas." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caracteres." });
      return;
    }

    await bootstrapService.initialiseSuperAdmin({ employeeCode, fullName, email, password });

    res.status(201).json({
      message: "Super Admin cree avec succes. Vous pouvez maintenant vous connecter.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";

    if (message === "SYSTEM_ALREADY_INITIALISED") {
      res.status(403).json({ message: "Le systeme est deja initialise.", code: message });
      return;
    }
    if (message === "EMPLOYEE_CODE_EXISTS") {
      res.status(409).json({ message: "Ce matricule est deja utilise.", code: message });
      return;
    }

    console.error("[bootstrap/init]", error);
    res.status(500).json({ message: "Erreur interne." });
  }
}
