import { useId, useState, type DragEvent } from 'react';
import { AlertTriangle, FileText, UploadCloud, X } from 'lucide-react';
import { ACCEPTED_DOCUMENT_MIME_TYPES } from '@aidn/shared';

/** The API's multer limit (apps/api uploads.route.ts). Measured against the
 *  running API: a file of exactly this size is already refused (413), so
 *  the largest accepted file is MAX_UPLOAD_BYTES - 1. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
export const TEXT_DOCUMENT_ACCEPT = '.pdf,.doc,.docx';

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function formatsLabel(accept: string): string {
  const names = new Set(
    accept.split(',').map((ext) => {
      const e = ext.trim().toLowerCase();
      if (e === '.doc' || e === '.docx') return 'Word';
      if (e === '.jpg' || e === '.jpeg') return 'JPG';
      return e.replace('.', '').toUpperCase();
    }),
  );
  return [...names].join(', ');
}

/**
 * Same checks the server applies, before any byte is sent: extension in the
 * field's accept list, MIME in the shared accepted list (when the browser
 * reports one), not empty, within the size limit. Returns the French error
 * message, or null when the file is acceptable.
 */
export function validateUploadFile(file: File, accept: string, maxBytes = MAX_UPLOAD_BYTES): string | null {
  const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  const allowed = accept.split(',').map((ext) => ext.trim().toLowerCase());
  if (!allowed.includes(extension) || (file.type && !(ACCEPTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type))) {
    return `Format non accepté (${file.name}). Formats acceptés : ${formatsLabel(accept)}.`;
  }
  if (file.size === 0) return `Le fichier ${file.name} est vide.`;
  if (file.size >= maxBytes) {
    return `${file.name} fait ${formatSize(file.size)} (maximum ${formatSize(maxBytes)}). Réduisez-le ou numérisez-le en qualité inférieure.`;
  }
  return null;
}

/**
 * Controlled file picker: click or drag-and-drop, validated client-side,
 * shows the chosen file with a remove button. A real <input type="file">
 * stays underneath (visually hidden), so keyboard and screen readers work.
 */
export function FileDropzone({
  label,
  file,
  onFileChange,
  accept = DOCUMENT_ACCEPT,
  maxBytes = MAX_UPLOAD_BYTES,
  disabled = false,
  compact = false,
}: {
  label: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  maxBytes?: number;
  disabled?: boolean;
  /** Single-line variant for dense lists (formal documents, corrections). */
  compact?: boolean;
}) {
  const inputId = useId();
  const hintId = useId();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const hint = `${formatsLabel(accept)} · ${formatSize(maxBytes)} max`;

  function pick(candidate: File | undefined) {
    if (!candidate) return;
    const problem = validateUploadFile(candidate, accept, maxBytes);
    setError(problem);
    onFileChange(problem ? null : candidate);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) pick(event.dataTransfer.files?.[0]);
  }

  if (file) {
    return (
      <div className="flex items-center gap-2 rounded border border-anac-success/40 bg-white px-3 py-2">
        <FileText size={16} className="flex-shrink-0 text-anac-success" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-anac-navy">{file.name}</p>
          <p className="text-[11px] text-anac-muted">{formatSize(file.size)}</p>
        </div>
        <button
          type="button"
          onClick={() => onFileChange(null)}
          disabled={disabled}
          aria-label={`Retirer ${file.name}`}
          className="rounded p-1 text-anac-muted hover:bg-anac-gray hover:text-anac-navy"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer rounded border border-dashed transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-anac-sky ${
          compact ? 'items-center gap-2 px-3 py-2' : 'flex-col items-center gap-1 px-4 py-4 text-center'
        } ${
          error
            ? 'border-anac-danger/50 bg-anac-danger/5'
            : dragging
              ? 'border-anac-blue bg-anac-sky/10'
              : 'border-anac-border bg-white hover:bg-anac-gray'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <UploadCloud size={compact ? 14 : 20} className="flex-shrink-0 text-anac-muted" aria-hidden="true" />
        <span className={compact ? 'text-xs text-anac-navy' : 'text-sm font-medium text-anac-navy'}>{label}</span>
        <span className="text-[11px] text-anac-muted" id={hintId}>
          {compact ? `(${hint})` : <>Glissez un fichier ou <span className="text-anac-blue underline">parcourez</span> · {hint}</>}
        </span>
        <input
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          aria-describedby={hintId}
          className="sr-only"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            // Allow re-selecting the same file after removing it.
            event.target.value = '';
          }}
        />
      </label>
      {error && (
        <p role="alert" className="mt-1 flex items-start gap-1 text-xs text-anac-danger">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
