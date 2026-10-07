import { describe, expect, it } from 'vitest';
import { accessPathFor, fileAccessErrorMessage, isOpenableAddress, previewKindForMime } from './files';

describe('previewKindForMime - preview type comes from the grant MIME type, never the URL', () => {
  it.each([
    ['application/pdf', 'pdf'],
    ['image/png', 'image'],
    ['image/jpeg', 'image'],
    ['image/svg+xml', 'unsupported'], // script risk
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'unsupported'],
    ['', 'unsupported'],
  ])('%s -> %s', (mime, kind) => {
    expect(previewKindForMime(mime)).toBe(kind);
  });
});

describe('isOpenableAddress - only stable addresses can be opened', () => {
  it('accepts a stable address', () => expect(isOpenableAddress('/api/files/183')).toBe(true));
  it('refuses a legacy address', () => expect(isOpenableAddress('/uploads/2026/x.pdf')).toBe(false));
  it('refuses a foreign URL', () => expect(isOpenableAddress('https://evil.test/a.pdf')).toBe(false));
  it('refuses no address', () => expect(isOpenableAddress(null)).toBe(false));
});

describe('accessPathFor - access request goes through the API client (/api base)', () => {
  it('builds the access path', () => expect(accessPathFor('/api/files/183')).toBe('/files/183/access'));
  it('has no path for a legacy address', () => expect(accessPathFor('/uploads/x.pdf')).toBeNull());
});

describe('fileAccessErrorMessage', () => {
  it('maps 404', () => {
    const notFound = { isAxiosError: true, response: { status: 404, data: { message: 'Fichier introuvable.' } } };
    expect(fileAccessErrorMessage(notFound)).toBe('Fichier introuvable ou accès refusé.');
  });
  it('shows the ambiguous-session message as-is', () => {
    const message = 'Session ambiguë : reconnectez-vous depuis l’application concernée.';
    const ambiguous = { isAxiosError: true, response: { status: 401, data: { code: 'AMBIGUOUS_SESSION', message } } };
    expect(fileAccessErrorMessage(ambiguous)).toBe(message);
  });
  it('falls back for unknown errors', () => {
    expect(fileAccessErrorMessage(new Error('network'))).toBe('Impossible d’ouvrir le fichier.');
  });
});
