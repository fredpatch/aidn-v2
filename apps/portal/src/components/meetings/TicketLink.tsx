import { Download } from 'lucide-react';
import { meetingTicketHref } from '../../lib/api/meetings.api';

/** Downloads the invitation PDF (the API checks ownership and names the file). */
export function TicketLink({ meetingId, label = "Télécharger l'invitation (PDF)" }: { meetingId: number; label?: string }) {
  return (
    <a
      href={meetingTicketHref(meetingId)}
      download
      className="btn-secondary inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
    >
      <Download size={13} aria-hidden="true" />
      {label}
    </a>
  );
}
