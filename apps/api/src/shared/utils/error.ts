import { Response } from 'express';

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
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';

    for (const { prefix, status, message: buildMessage } of prefixHandlers) {
      if (message.startsWith(prefix)) {
        const id = message.split(':')[1];
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
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  };
}

export const handleAuthError = createErrorHandler(
  {
    ACCOUNT_NOT_FOUND: { status: 401, message: 'Compte introuvable ou inactif.' },
    ACCOUNT_LOCKED: { status: 423, message: 'Compte temporairement bloque. Reessayez plus tard.' },
    ACCOUNT_INACTIVE: { status: 401, message: 'Compte inactif.' },
    OTP_REQUIRED: { status: 400, message: 'Code OTP requis.' },
    OTP_NOT_GENERATED: { status: 400, message: 'Aucun OTP genere pour ce compte.' },
    OTP_EXPIRED: { status: 400, message: 'Code OTP expire.' },
    OTP_INVALID: { status: 401, message: 'Code OTP invalide.' },
    PASSWORD_REQUIRED: { status: 400, message: 'Mot de passe requis.' },
    PASSWORD_NOT_SET: { status: 400, message: 'Mot de passe non defini.' },
    PASSWORD_INVALID: { status: 401, message: 'Mot de passe invalide.' },
    PASSWORDS_DO_NOT_MATCH: { status: 400, message: 'Les mots de passe ne correspondent pas.' },
    PASSWORD_TOO_SHORT: {
      status: 400,
      message: 'Le mot de passe doit contenir au moins 8 caracteres.',
    },
  },
  '[auth]'
);

export const handleUsersError = createErrorHandler(
  {
    USER_NOT_FOUND: { status: 404, message: 'Utilisateur introuvable.' },
    EMPLOYEE_CODE_EXISTS: { status: 409, message: 'Ce matricule est deja utilise.' },
    EMAIL_EXISTS: { status: 409, message: 'Cet email est deja utilise.' },
    SU_CANNOT_BE_DEACTIVATED: {
      status: 403,
      message: 'Le Super Admin ne peut pas etre desactive.',
    },
  },
  '[users]'
);

export const handleRequestsError = createErrorHandler(
  {
    REQUEST_ALREADY_ACTIVE: {
      status: 409,
      message: 'Une demande est deja active pour cet organisme.',
    },
    REQUEST_NOT_FOUND: { status: 404, message: 'Demande introuvable.' },
    REQUEST_NOT_CANCELLABLE: {
      status: 409,
      message: 'Cette demande ne peut plus etre annulee (deja signee ou au-dela).',
    },
    APPLICANT_NOT_FOUND: { status: 404, message: 'Postulant introuvable.' },
    DG_CIRCUIT_NOT_FOUND: { status: 404, message: 'Circuit DG introuvable pour cette demande.' },
    INVALID_CIRCUIT_TRANSITION: {
      status: 409,
      message: 'Transition de statut invalide pour ce circuit.',
    },
  },
  '[requests]'
);

export const handlePhasesError = createErrorHandler(
  {
    REQUEST_NOT_FOUND: { status: 404, message: 'Demande introuvable.' },
    REQUEST_NOT_READY_FOR_PHASE: {
      status: 409,
      message: "La demande doit etre en attente de traitement avant d'ouvrir cette phase.",
    },
    PHASE_ALREADY_OPEN: {
      status: 409,
      message: 'Cette phase est deja ouverte pour cette demande.',
    },
    PHASE_NOT_FOUND: { status: 404, message: 'Phase introuvable.' },
    PHASE_ALREADY_CLOSED: { status: 409, message: 'Cette phase est deja cloturee.' },
    MEETING_NOT_RESOLVED: {
      status: 409,
      message:
        "La reunion doit d'abord etre resolue (tenue, absence, ou dossier annule) avant de cloturer la phase.",
    },
    DECLARATION_NOT_SUBMITTED: {
      status: 409,
      message:
        "Le postulant doit d'abord retourner sa declaration de pre-evaluation remplie avant de cloturer la phase.",
    },
  },
  '[phases]'
);

export const handleMeetingsError = createErrorHandler(
  {
    PHASE_NOT_FOUND: { status: 404, message: 'Phase introuvable.' },
    PHASE_NOT_OPEN: {
      status: 409,
      message: 'La phase doit etre ouverte pour planifier une reunion.',
    },
    MEETING_SLOT_CONFLICT: {
      status: 409,
      message: 'Cet agent DN a deja une reunion planifiee exactement a ce creneau.',
    },
    MEETING_NOT_FOUND: { status: 404, message: 'Reunion introuvable.' },
    MEETING_NOT_SCHEDULED: {
      status: 409,
      message: "Cette reunion n'est plus au statut planifie.",
    },
    MEETING_NOT_HELD: {
      status: 409,
      message: "Le compte-rendu ne peut etre envoye qu'une fois la reunion tenue.",
    },
  },
  '[meetings]'
);

export const handlePreliminaryEvaluationError = createErrorHandler(
  {
    PHASE_NOT_FOUND: { status: 404, message: 'Phase introuvable.' },
    WRONG_PHASE: { status: 400, message: 'Cette action ne concerne que la phase preliminaire.' },
    PHASE_NOT_OPEN: { status: 409, message: 'La phase doit etre ouverte.' },
    TEMPLATE_NOT_CONFIGURED: {
      status: 409,
      message: "Le modele de declaration de pre-evaluation n'a pas encore ete configure par la DN.",
    },
    MEETING_NOT_HELD_YET: {
      status: 409,
      message:
        "La reunion preliminaire doit d'abord etre marquee tenue avant de rendre la declaration disponible.",
    },
    NOT_YET_AVAILABLE: {
      status: 409,
      message: "La declaration n'a pas encore ete mise a disposition par la DN.",
    },
  },
  '[preliminary-evaluation]'
);

export const handleDevToolsError = createErrorHandler(
  {
    STATUS_NOT_FOUND: { status: 404, message: 'Statut introuvable.' },
    RESET_FAILED: { status: 500, message: 'La reinitialisation a echoue.' },
  },
  '[dev-tools]'
);

export const handleSystemParametersError = createErrorHandler(
  {
    PARAMETER_NOT_FOUND: { status: 404, message: 'Parametre introuvable.' },
    INVALID_PARAMETER_VALUE: { status: 400, message: 'Valeur de parametre invalide.' },
  },
  '[system-parameters]'
);

export const handleFormalRequestError = createErrorHandler(
  {
    REQUEST_NOT_FOUND: { status: 404, message: 'Demande introuvable.' },
    M3_NOT_CLOSED: {
      status: 409,
      message:
        "La phase préliminaire doit être clôturée avant d'ouvrir la phase de demande formelle.",
    },
    PHASE_ALREADY_OPEN: {
      status: 409,
      message: 'Cette phase est déjà ouverte pour cette demande.',
    },
    PHASE_NOT_FOUND: { status: 404, message: 'Phase introuvable.' },
    PHASE_NOT_OPEN: { status: 409, message: 'La phase doit être ouverte.' },
    PHASE_ALREADY_CLOSED: { status: 409, message: 'Cette phase est déjà clôturée.' },
    LETTER_ALREADY_SUBMITTED: {
      status: 409,
      message: 'La lettre de demande formelle a déjà été soumise.',
    },
    LETTER_NOT_FOUND: { status: 404, message: 'Lettre de demande formelle introuvable.' },
    LETTER_NOT_TRANSMITTED: {
      status: 409,
      message:
        "La lettre de demande formelle doit d'abord être transmise à la DN avant de clôturer.",
    },
    SLOT_NOT_FOUND: { status: 404, message: 'Créneau de document introuvable pour cette phase.' },
    DOCUMENT_ALREADY_SUBMITTED: {
      status: 409,
      message: 'Ce document a déjà été soumis. Il ne peut pas être remplacé.',
    },
    DOCUMENTS_INCOMPLETE: {
      status: 409,
      message: 'Les 11 documents doivent tous être soumis avant de clôturer la phase.',
    },
    MEETING_NOT_RESOLVED: {
      status: 409,
      message: "La réunion formelle doit d'abord être résolue avant de clôturer la phase.",
    },
    INVALID_CIRCUIT_TRANSITION: {
      status: 409,
      message: 'Transition de statut invalide pour ce circuit.',
    },
  },
  '[formal-request]'
);
