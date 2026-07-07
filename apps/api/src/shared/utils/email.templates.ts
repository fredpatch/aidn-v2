/** Minimal, dependency-free HTML templates. Kept deliberately plain -
 *  ANAC branding/styling can be layered on later without touching the
 *  sending logic in email.ts. */

function baseLayout(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1b2a5e;">${title}</h2>
      ${bodyHtml}
      <p style="color: #6b7a99; font-size: 12px; margin-top: 24px;">
        AIDN - Direction de la Navigabilite - OMA Service
      </p>
    </div>
  `;
}

export function otpEmailTemplate(params: {
  fullName: string;
  employeeCode: string;
  otp: string;
}): string {
  return baseLayout(
    'AIDN - Activation de votre compte',
    `
      <p>Bonjour ${params.fullName},</p>
      <p>Votre code d'activation (matricule <strong>${params.employeeCode}</strong>) est :</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${params.otp}</p>
      <p>Ce code expire dans quelques minutes.</p>
    `
  );
}

export function accountActivatedEmailTemplate(params: {
  fullName: string;
  employeeCode: string;
  dateTime: string;
  ip?: string;
}): string {
  return baseLayout(
    "AIDN - Confirmation d'activation de votre compte",
    `
      <p>Bonjour ${params.fullName},</p>
      <p>Votre compte (matricule <strong>${params.employeeCode}</strong>) a ete active le ${params.dateTime}.</p>
      ${params.ip ? `<p style="color: #6b7a99; font-size: 12px;">Adresse IP : ${params.ip}</p>` : ''}
    `
  );
}

export function dgCircuitAlertEmailTemplate(params: {
  reference: string;
  daysStuck: number;
}): string {
  return baseLayout(
    `AIDN - Demande ${params.reference} en attente de signature`,
    `
      <p>La demande <strong>${params.reference}</strong> est en attente de signature DG
      depuis ${params.daysStuck} jour(s).</p>
      <p>Merci de verifier l'avancement du parapheur.</p>
    `
  );
}

export function certificateReadyEmailTemplate(params: { reference: string }): string {
  return baseLayout(
    'AIDN - Votre certificat est disponible',
    `<p>Votre certificat (reference <strong>${params.reference}</strong>) est pret. Merci de vous presenter a la Direction de la Navigabilite pour le retrait.</p>`
  );
}

export function dossierRejectedEmailTemplate(params: {
  reference: string;
  reason: string;
}): string {
  return baseLayout(
    'AIDN - Dossier rejete',
    `<p>Votre dossier (reference <strong>${params.reference}</strong>) a ete rejete.</p>
     <p><strong>Motif :</strong> ${params.reason}</p>`
  );
}

export function documentNeedsCorrectionEmailTemplate(params: {
  reference: string;
  deadline: string;
}): string {
  return baseLayout(
    'AIDN - Document a corriger',
    `<p>Un document de votre dossier (reference <strong>${params.reference}</strong>) necessite une correction.</p>
     <p>Merci de le retransmettre avant le <strong>${params.deadline}</strong>.</p>`
  );
}
