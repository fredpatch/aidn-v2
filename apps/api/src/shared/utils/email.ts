import nodemailer from "nodemailer";
import {
  otpEmailTemplate,
  accountActivatedEmailTemplate,
  dgCircuitAlertEmailTemplate,
  certificateReadyEmailTemplate,
  dossierRejectedEmailTemplate,
  documentNeedsCorrectionEmailTemplate,
} from "./email.templates.js";

// Env var names match SICOT's (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
// SMTP_FROM) so existing SICOT SMTP credentials can be reused as-is.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT ?? "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function verifyEmailConnection(): Promise<void> {
  try {
    await transporter.verify();
    console.log("SMTP connection OK");
  } catch (error) {
    console.warn("SMTP unavailable - emails will not be sent", error);
  }
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(options: EmailOptions): Promise<void> {
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? "AIDN <aidn@anac.ga>",
    ...options,
  });
}

export async function sendOTPEmail(params: {
  to: string;
  fullName: string;
  employeeCode: string;
  otp: string;
}): Promise<void> {
  const { to, ...templateParams } = params;
  await sendEmail({
    to,
    subject: "AIDN - Activation de votre compte",
    html: otpEmailTemplate(templateParams),
  });
}

export async function sendAccountActivatedEmail(params: {
  to: string;
  fullName: string;
  employeeCode: string;
  dateTime: string;
  ip?: string;
}): Promise<void> {
  const { to, ...templateParams } = params;
  await sendEmail({
    to,
    subject: "AIDN - Confirmation d'activation de votre compte",
    html: accountActivatedEmailTemplate(templateParams),
  });
}

/** M1 pattern "Circuit DG" - stuck-parapheur alert, sent to internal staff. */
export async function sendDgCircuitAlertEmail(params: {
  to: string;
  reference: string;
  daysStuck: number;
}): Promise<void> {
  const { to, ...templateParams } = params;
  await sendEmail({
    to,
    subject: `AIDN - Demande ${params.reference} en attente de signature`,
    html: dgCircuitAlertEmailTemplate(templateParams),
  });
}

/** M11 - one of the few events that DOES get an email to the applicant. */
export async function sendCertificateReadyEmail(params: {
  to: string;
  reference: string;
}): Promise<void> {
  const { to, ...templateParams } = params;
  await sendEmail({
    to,
    subject: "AIDN - Votre certificat est disponible",
    html: certificateReadyEmailTemplate(templateParams),
  });
}

export async function sendDossierRejectedEmail(params: {
  to: string;
  reference: string;
  reason: string;
}): Promise<void> {
  const { to, ...templateParams } = params;
  await sendEmail({
    to,
    subject: "AIDN - Dossier rejete",
    html: dossierRejectedEmailTemplate(templateParams),
  });
}

export async function sendDocumentNeedsCorrectionEmail(params: {
  to: string;
  reference: string;
  deadline: string;
}): Promise<void> {
  const { to, ...templateParams } = params;
  await sendEmail({
    to,
    subject: "AIDN - Document a corriger",
    html: documentNeedsCorrectionEmailTemplate(templateParams),
  });
}
