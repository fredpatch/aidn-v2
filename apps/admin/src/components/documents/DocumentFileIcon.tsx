import { File, FileImage, FileSpreadsheet, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DocumentFileIconProps {
  fileUrl?: string | null;
  className?: string;
}

function extensionFromUrl(fileUrl?: string | null): string {
  if (!fileUrl) return '';
  const cleanUrl = fileUrl.split('?')[0] ?? '';
  return cleanUrl.split('.').pop()?.toLowerCase() ?? '';
}

export default function DocumentFileIcon({ fileUrl, className }: DocumentFileIconProps) {
  const extension = extensionFromUrl(fileUrl);
  const isPdf = extension === 'pdf';
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension);
  const isSpreadsheet = ['xls', 'xlsx', 'csv'].includes(extension);
  const isWord = ['doc', 'docx'].includes(extension);

  const Icon = isImage ? FileImage : isSpreadsheet ? FileSpreadsheet : isPdf || isWord ? FileText : File;
  const tone = isPdf
    ? 'border-red-100 bg-red-50 text-red-600'
    : isImage
      ? 'border-sky-100 bg-sky-50 text-sky-600'
      : isSpreadsheet
        ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
        : isWord
          ? 'border-blue-100 bg-blue-50 text-blue-600'
          : 'border-anac-border bg-anac-gray text-anac-muted';

  return (
    <span
      className={cn(
        'grid h-8 w-8 flex-shrink-0 place-items-center rounded border',
        tone,
        className
      )}
      aria-hidden="true"
    >
      <Icon size={15} />
    </span>
  );
}
