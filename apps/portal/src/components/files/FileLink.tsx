import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { openStoredFile } from '../../lib/file-access';
import { fileAccessErrorMessage, isOpenableAddress } from '../../lib/files';
import { notify } from '../../lib/notify';
import { cn } from '../../lib/utils';

interface FileLinkProps {
  /** Stable file address (/api/files/<id>). Anything else renders as unavailable. */
  address: string | null | undefined;
  children: ReactNode;
  /** Force a download instead of opening in a new tab. */
  download?: boolean;
  className?: string;
  title?: string;
}

/** The only way to open a stored file: requests a short-lived signed link
 *  on click, so no stable address is ever rendered as a plain link. */
export default function FileLink({ address, children, download = false, className, title }: FileLinkProps) {
  const [busy, setBusy] = useState(false);

  if (!isOpenableAddress(address)) {
    return (
      <span className={cn('cursor-not-allowed text-anac-muted', className)} title="Fichier indisponible">
        {children}
      </span>
    );
  }

  async function handleClick() {
    setBusy(true);
    try {
      await openStoredFile(address!, download ? 'attachment' : 'inline');
    } catch (error) {
      notify.error(fileAccessErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={title}
      className={cn('inline-flex items-center gap-1 text-left', className ?? 'text-anac-blue underline')}
    >
      {busy && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
