import { Printer } from 'lucide-react';
import { meetingTicketHref } from '../../lib/api/meetings.api';

/** Opens the printable invitation in a new tab (the API checks ownership). */
export function TicketLink({ meetingId, label = "Ouvrir / imprimer l'invitation" }: { meetingId: number; label?: string }) {
  return (
    <a
      href={meetingTicketHref(meetingId)}
      target="_blank"
      rel="noreferrer"
      className="btn-secondary inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
    >
      <Printer size={13} aria-hidden="true" />
      {label}
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}
