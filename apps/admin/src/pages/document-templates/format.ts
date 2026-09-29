const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "image/png": "PNG",
  "image/jpeg": "JPG",
};

export function formatMimeType(mimeType: string | null): string | null {
  if (!mimeType) return null;
  return MIME_LABELS[mimeType] ?? mimeType.split("/").pop()?.toUpperCase() ?? null;
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null): string | null {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : null;
}

export function formatDateTime(value: string | null): string | null {
  const date = parseDate(value);
  return date ? dateTimeFormatter.format(date) : null;
}
