import { Response } from "express";

type ErrorMap = Record<string, { status: number; message: string }>;
type PrefixHandler = { prefix: string; status: number; message: (id: string) => string };

/** Factory: service-layer error code (a thrown Error's .message) -> HTTP response.
 *  Services throw plain SCREAMING_SNAKE_CASE error codes; controllers never
 *  need to know HTTP status codes, only this mapping does. */
function createErrorHandler(
  errorMap: ErrorMap,
  logPrefix: string,
  prefixHandlers: PrefixHandler[] = []
) {
  return (res: Response, error: unknown): void => {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";

    for (const { prefix, status, message: buildMessage } of prefixHandlers) {
      if (message.startsWith(prefix)) {
        const id = message.split(":")[1];
        res.status(status).json({ message: buildMessage(id), code: prefix });
        return;
      }
    }

    const mapped = errorMap[message];
    if (mapped) {
      res.status(mapped.status).json({ message: mapped.message, code: message });
      return;
    }

    console.error(logPrefix, error);
    res.status(500).json({ message: "Erreur interne du serveur." });
  };
}

export const handleAuthError = createErrorHandler(
  {
    ACCOUNT_NOT_FOUND: { status: 401, message: "Compte introuvable ou inactif." },
    ACCOUNT_LOCKED: { status: 423, message: "Compte temporairement bloque. Reessayez plus tard." },
    ACCOUNT_INACTIVE: { status: 401, message: "Compte inactif." },
    OTP_REQUIRED: { status: 400, message: "Code OTP requis." },
    OTP_NOT_GENERATED: { status: 400, message: "Aucun OTP genere pour ce compte." },
    OTP_EXPIRED: { status: 400, message: "Code OTP expire." },
    OTP_INVALID: { status: 401, message: "Code OTP invalide." },
    PASSWORD_REQUIRED: { status: 400, message: "Mot de passe requis." },
    PASSWORD_NOT_SET: { status: 400, message: "Mot de passe non defini." },
    PASSWORD_INVALID: { status: 401, message: "Mot de passe invalide." },
    PASSWORDS_DO_NOT_MATCH: { status: 400, message: "Les mots de passe ne correspondent pas." },
    PASSWORD_TOO_SHORT: {
      status: 400,
      message: "Le mot de passe doit contenir au moins 8 caracteres.",
    },
  },
  "[auth]"
);

export const handleUsersError = createErrorHandler(
  {
    USER_NOT_FOUND: { status: 404, message: "Utilisateur introuvable." },
    EMPLOYEE_CODE_EXISTS: { status: 409, message: "Ce matricule est deja utilise." },
    EMAIL_EXISTS: { status: 409, message: "Cet email est deja utilise." },
    SU_CANNOT_BE_DEACTIVATED: {
      status: 403,
      message: "Le Super Admin ne peut pas etre desactive.",
    },
  },
  "[users]"
);

export const handleRequestsError = createErrorHandler(
  {
    REQUEST_ALREADY_ACTIVE: {
      status: 409,
      message: "Une demande est deja active pour cet organisme.",
    },
    REQUEST_NOT_FOUND: { status: 404, message: "Demande introuvable." },
    REQUEST_NOT_CANCELLABLE: {
      status: 409,
      message: "Cette demande ne peut plus etre annulee (deja signee ou au-dela).",
    },
    APPLICANT_NOT_FOUND: { status: 404, message: "Postulant introuvable." },
    DG_CIRCUIT_NOT_FOUND: { status: 404, message: "Circuit DG introuvable pour cette demande." },
    INVALID_CIRCUIT_TRANSITION: {
      status: 409,
      message: "Transition de statut invalide pour ce circuit.",
    },
  },
  "[requests]"
);
