import { escapeHtml } from '../../shared/pdf/html-pdf.js';

/** Meetings are stored as UTC instants; the invitation states Libreville time
 *  whatever the server's own TZ (the staging container runs on UTC). */
export const INVITATION_TIME_ZONE = 'Africa/Libreville';

export interface MeetingInvitationData {
  meetingId: number;
  meetingType: string;
  meetingStatus: string;
  scheduledAt: Date;
  /** Typed by the DN (site visits); null for preliminary / formal meetings. */
  location: string | null;
  agentName: string | null;
  requestReference: string | null;
  requestType: string | null;
  organisationName: string | null;
  contactName: string | null;
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  preliminary: 'Réunion préliminaire',
  formal: 'Réunion formelle',
  site_visit: 'Visite sur site',
};

const REQUEST_SUBJECTS: Record<string, string> = {
  recognition: "reconnaissance d'agrément RAG 5.3",
  issuance: "délivrance d'agrément RAG 5.3",
  modification: "modification d'agrément RAG 5.3",
  renewal: "renouvellement d'agrément RAG 5.3",
};

/** Business rule: only a meeting still to be held has a valid invitation.
 *  Any other status keeps the document but marks it void, with the reason. */
const VOID_REASONS: Record<string, string> = {
  rescheduled: 'la réunion a été reprogrammée. Consultez votre espace postulant pour la nouvelle date.',
  held: 'la réunion a déjà eu lieu.',
  no_show: 'la réunion est clôturée (absence constatée).',
  file_cancelled: 'le dossier a été annulé.',
};

export function meetingTypeLabel(meetingType: string): string {
  return MEETING_TYPE_LABELS[meetingType] ?? 'Réunion';
}

export function invitationNumber(meetingId: number): string {
  return `RE-${String(meetingId).padStart(6, '0')}`;
}

/** null when the invitation is valid (meeting still scheduled). */
export function invitationVoidReason(meetingStatus: string): string | null {
  if (meetingStatus === 'scheduled') return null;
  return VOID_REASONS[meetingStatus] ?? "la réunion n'est plus planifiée.";
}

function librevilleParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: INVITATION_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** "07/10/2026 à 09:15", Libreville time. */
function formatGeneratedAt(date: Date): string {
  const p = new Intl.DateTimeFormat('fr-FR', {
    timeZone: INVITATION_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const v = Object.fromEntries(p.map((part) => [part.type, part.value]));
  return `${v.day}/${v.month}/${v.year} à ${v.hour}:${v.minute}`;
}

/** "invitation-DEM-2026-10-05-OMAT-02-2026-10-13.pdf" - ASCII only, safe in a header. */
export function invitationFileName(data: Pick<MeetingInvitationData, 'meetingId' | 'requestReference' | 'scheduledAt'>): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: INVITATION_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data.scheduledAt);
  const base = (data.requestReference ?? invitationNumber(data.meetingId)).replace(/[^A-Za-z0-9-]/g, '_');
  return `invitation-${base}-${p}.pdf`;
}

const STYLES = `
@page { size: A4; margin: 18mm 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #1a2340; font-size: 11pt; margin: 0; }
header { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #1b2a5e; padding-bottom: 10px; }
header img { height: 54px; }
.org { font-size: 9pt; color: #6b7a99; line-height: 1.4; }
.org strong { color: #1b2a5e; font-size: 10.5pt; display: block; }
.docref { margin-left: auto; text-align: right; font-size: 8.5pt; color: #6b7a99; }
h1 { color: #1b2a5e; font-size: 20pt; margin: 26px 0 2px; letter-spacing: .5px; }
.sub { color: #2b4dae; font-size: 12pt; font-weight: bold; margin: 0 0 20px; }
.to { font-size: 10pt; margin-bottom: 18px; }
.when { display: flex; border: 1px solid #d1d9e6; border-radius: 8px; overflow: hidden; }
.when > div { padding: 14px 16px; flex: 1; }
.when .date { background: #1b2a5e; color: #fff; flex: 0 0 34%; }
.when .date .d { font-size: 30pt; font-weight: bold; line-height: 1; }
.when .date .m::first-letter { text-transform: uppercase; }
.when .date .m { font-size: 11pt; }
.when .date .h { font-size: 15pt; font-weight: bold; margin-top: 10px; }
.when .date .tz { font-size: 8pt; opacity: .8; }
.k { color: #6b7a99; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .6px; }
.v { font-weight: bold; margin: 2px 0 12px; }
.v:last-child { margin-bottom: 0; }
.notes { margin-top: 22px; background: #f4f6fa; border-left: 4px solid #2b4dae; padding: 12px 16px; font-size: 10pt; line-height: 1.5; }
.notes ul { margin: 6px 0 0; padding-left: 18px; }
.void { margin-bottom: 18px; border: 2px solid #dc2626; color: #dc2626; padding: 10px 14px; border-radius: 6px; font-weight: bold; font-size: 10.5pt; }
.is-void .when, .is-void .notes { opacity: .45; }
footer { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1px solid #d1d9e6; padding-top: 6px; font-size: 8pt; color: #6b7a99; display: flex; justify-content: space-between; gap: 12px; }
`;

/** Every interpolated value goes through escapeHtml (DN free text included). */
export function buildMeetingInvitationHtml(
  data: MeetingInvitationData,
  { logo, generatedAt }: { logo: string | null; generatedAt: Date },
): string {
  const e = escapeHtml;
  const type = meetingTypeLabel(data.meetingType);
  const number = invitationNumber(data.meetingId);
  const when = librevilleParts(data.scheduledAt);
  const voidReason = invitationVoidReason(data.meetingStatus);
  const subject = data.requestType && REQUEST_SUBJECTS[data.requestType]
    ? `${type} relative à votre demande de ${REQUEST_SUBJECTS[data.requestType]}`
    : type;
  const recipient = data.organisationName
    ? `<b>${e(data.organisationName)}</b>${data.contactName ? ` · à l'attention de ${e(data.contactName)}` : ''}`
    : `<b>${e(data.contactName ?? 'Non renseigné')}</b>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Invitation ${e(number)} - ${e(type)}</title>
<style>${STYLES}</style>
</head>
<body class="${voidReason ? 'is-void' : ''}">
  <header>
    ${logo ? `<img src="${e(logo)}" alt="" />` : ''}
    <div class="org"><strong>Agence Nationale de l'Aviation Civile</strong>Direction de la Navigabilité</div>
    <div class="docref">Invitation n° ${e(number)}${data.requestReference ? `<br />Dossier ${e(data.requestReference)}` : ''}</div>
  </header>
  <h1>INVITATION</h1>
  <p class="sub">${e(type)}</p>
  ${voidReason ? `<div class="void" role="alert">⚠ Cette invitation n'est plus valable : ${e(voidReason)}</div>` : ''}
  <div class="to"><div class="k">Destinataire</div>${recipient}</div>
  <div class="when">
    <div class="date">
      <div class="m">${e(when.weekday)}</div>
      <div class="d">${e(when.day)}</div>
      <div class="m">${e(when.month)} ${e(when.year)}</div>
      <div class="h">${e(when.hour)} h ${e(when.minute)}</div>
      <div class="tz">heure de Libreville</div>
    </div>
    <div>
      <div class="k">Objet</div><div class="v">${e(subject)}</div>
      ${data.location ? `<div class="k">Lieu</div><div class="v">${e(data.location)}</div>` : ''}
      <div class="k">Agent de la Direction de la Navigabilité</div><div class="v">${e(data.agentName ?? 'Non renseigné')}</div>
    </div>
  </div>
  <div class="notes"><b>Informations pratiques</b><ul>
    <li>Merci de vous présenter quelques minutes avant l'heure indiquée, muni de cette invitation.</li>
    <li>En cas d'empêchement, prévenez la Direction de la Navigabilité au plus tôt : une absence non justifiée peut entraîner l'annulation du dossier.</li>
  </ul></div>
  <footer>
    <span>Document généré automatiquement par AIDN, sans signature, le ${e(formatGeneratedAt(generatedAt))} (heure de Libreville)</span>
    <span>Invitation n° ${e(number)}</span>
  </footer>
</body>
</html>`;
}
