import { describe, expect, it } from 'vitest';
import type { DnAnnotationTask } from '../../lib/api/dn-annotation';
import { countDnTabs, dnActionLabel, filterDnTasks, inDnTab } from './dnAnnotationBuckets';

function task(overrides: Partial<DnAnnotationTask>): DnAnnotationTask {
  return {
    id: 'dn_director_annotation:1',
    bucket: 'to_send',
    requestId: 1,
    requestReference: 'DEM-2026-0001',
    requestType: 'issuance',
    organisationName: 'Air Gabon',
    applicantName: 'Marie Obame',
    circuitDocumentId: 1,
    statusLabel: 'À transmettre au Directeur DN',
    fileUrl: '/api/files/1',
    mimeType: 'application/pdf',
    createdAt: '2026-10-01T08:00:00.000Z',
    sentToDirectorAt: null,
    returnedAt: null,
    availableActions: ['send_to_director'],
    dossierStatus: 'submitted',
    dossierClosed: false,
    directorWorkingDays: null,
    predatesProcess: false,
    ...overrides,
  };
}

describe('Circuit Directeur DN tabs', () => {
  it('counts each task in its own tab', () => {
    const counts = countDnTabs([
      task({}),
      task({ id: 'b', bucket: 'with_director', availableActions: ['upload_annotated_return'] }),
      task({ id: 'c', bucket: 'returned', availableActions: [] }),
    ]);
    expect(counts).toEqual({ to_send: 1, with_director: 1, returned: 1 });
  });

  it('drops a pending task of a closed dossier, keeps the received annotation for history', () => {
    expect(inDnTab(task({ dossierClosed: true }), 'to_send')).toBe(false);
    expect(inDnTab(task({ bucket: 'returned', dossierClosed: true, availableActions: [] }), 'returned')).toBe(true);
  });

  it('searches reference, organisation and applicant without accents', () => {
    const tasks = [task({}), task({ id: 'x', organisationName: 'Heli Union', requestReference: 'DEM-2026-0002' })];
    expect(filterDnTasks(tasks, 'to_send', 'heli')).toHaveLength(1);
    expect(filterDnTasks(tasks, 'to_send', 'obamé')).toHaveLength(2);
  });

  it('offers the action matching the state, and none once received', () => {
    expect(dnActionLabel(task({}))).toBe('Marquer en circuit Directeur DN');
    expect(dnActionLabel(task({ availableActions: ['upload_annotated_return'] }))).toBe('Téléverser le retour annoté');
    expect(dnActionLabel(task({ availableActions: [] }))).toBeNull();
  });
});
