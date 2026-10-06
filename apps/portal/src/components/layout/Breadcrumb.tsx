import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/** "← Parent / Current" - the way back out of a detail page. */
export function Breadcrumb({ parent, current }: { parent: { to: string; label: string }; current: string }) {
  return (
    <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1.5 text-sm">
      <Link to={parent.to} className="inline-flex items-center gap-1 text-anac-blue hover:underline">
        <ArrowLeft size={14} aria-hidden="true" />
        {parent.label}
      </Link>
      <span className="text-anac-muted" aria-hidden="true">/</span>
      <span aria-current="page" className="truncate text-anac-muted">{current}</span>
    </nav>
  );
}
