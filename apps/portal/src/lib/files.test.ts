import { accessPathFor, fileAccessErrorMessage, isOpenableAddress, previewKindForMime } from './files';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runFilesTests(): void {
  // Preview type comes from the grant's MIME type, never from the URL.
  assert(previewKindForMime('application/pdf') === 'pdf', 'PDF previews inline.');
  assert(previewKindForMime('image/png') === 'image', 'PNG previews as an image.');
  assert(previewKindForMime('image/jpeg') === 'image', 'JPEG previews as an image.');
  assert(previewKindForMime('image/svg+xml') === 'unsupported', 'SVG is not previewed (script risk).');
  assert(
    previewKindForMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document') === 'unsupported',
    'Word files are downloaded, not previewed.'
  );
  assert(previewKindForMime('') === 'unsupported', 'Unknown type is not previewed.');

  // Only stable addresses can be opened; legacy or foreign values show as unavailable.
  assert(isOpenableAddress('/api/files/183'), 'A stable address is openable.');
  assert(!isOpenableAddress('/uploads/2026/x.pdf'), 'A legacy address is not openable.');
  assert(!isOpenableAddress('https://evil.test/a.pdf'), 'A foreign URL is not openable.');
  assert(!isOpenableAddress(null), 'No address is not openable.');

  // The access request goes through the API client (base /api).
  assert(accessPathFor('/api/files/183') === '/files/183/access', 'Access path is relative to the /api base.');
  assert(accessPathFor('/uploads/x.pdf') === null, 'No access path for a legacy address.');

  // Error messages.
  const notFound = { isAxiosError: true, response: { status: 404, data: { message: 'Fichier introuvable.' } } };
  assert(fileAccessErrorMessage(notFound) === 'Fichier introuvable ou accès refusé.', '404 message.');
  const ambiguous = { isAxiosError: true, response: { status: 401, data: { code: 'AMBIGUOUS_SESSION', message: 'Session ambiguë : reconnectez-vous depuis l’application concernée.' } } };
  assert(
    fileAccessErrorMessage(ambiguous) === 'Session ambiguë : reconnectez-vous depuis l’application concernée.',
    'Ambiguous-session message is shown as-is.'
  );
  assert(fileAccessErrorMessage(new Error('network')) === 'Impossible d’ouvrir le fichier.', 'Fallback message.');
}
