import { Eye } from 'lucide-react';
import { useState } from 'react';
import DocumentViewer from './DocumentViewer';

interface DocumentPreviewLinkProps {
  title: string;
  url: string;
  label?: string;
  className?: string;
}

export default function DocumentPreviewLink({
  title,
  url,
  label = 'voir le fichier',
  className = 'underline text-anac-blue',
}: DocumentPreviewLinkProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`inline-flex items-center gap-1 ${className}`}
        onClick={() => setOpen(true)}
      >
        <Eye size={12} aria-hidden="true" />
        {label}
      </button>
      <DocumentViewer file={open ? { title, url } : null} onClose={() => setOpen(false)} />
    </>
  );
}
