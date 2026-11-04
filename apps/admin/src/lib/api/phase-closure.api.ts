import type { PhaseClosureState, PhaseClosureView } from '@aidn/shared';
import { api } from '../axios';

/** WORKFLOW-FOUNDATION-1B - the closure courrier of a phase, for every phase
 *  page (one surface, no per-phase wrapper). The circuit steps (mise en
 *  circuit, retour signé) are run from /courriers (courrier-tasks API). */

export async function fetchPhaseClosure(phaseId: number): Promise<PhaseClosureState> {
  const { data } = await api.get(`/phase-closures/phases/${phaseId}`);
  return data;
}

export async function startPhaseClosure(phaseId: number, uploadAssetId: number): Promise<PhaseClosureView> {
  const { data } = await api.post(`/phase-closures/phases/${phaseId}`, { uploadAssetId });
  return data;
}
