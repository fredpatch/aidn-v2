import {
  fetchCertificatesBundle,
  fetchDeepEvaluationBundle,
  fetchFormalBundle,
  fetchPreliminaryBundle,
  fetchSiteInspectionBundle,
} from '../../../lib/api/requests.api';
import type { RequestView } from '../../../lib/api/requests.types';
import type { PhaseCode } from '../../../lib/react-query/queryKeys';
import { buildPreliminaryPresentation, summarizePreliminary } from '../components/PreliminaryPhaseSection';
import { buildFormalPresentation, summarizeFormal } from '../components/FormalPhaseSection';
import { buildDeepEvaluationPresentation, summarizeDeepEvaluation } from '../components/DeepEvaluationSection';
import { buildSiteInspectionPresentation, summarizeSiteInspection } from '../components/SiteInspectionSection';
import { buildCertificatesPresentation, summarizeCertificates } from '../components/CertificatesSection';
import {
  buildBanner,
  buildProgressItems,
  isIntakeDone,
  phasesReachable,
  type PhasePresentation,
  type PhaseSnapshot,
} from '../progress';
import { usePhaseBundle } from './usePhaseBundle';

function snapshot<T extends { phase: { status: string } | null }>(
  query: { bundle: T | null; isLoading: boolean; loadFailed: boolean },
  enabled: boolean,
  present: (bundle: T) => PhasePresentation,
  summarize: (bundle: T) => string,
): PhaseSnapshot {
  const { bundle } = query;
  const opened = !!bundle?.phase;
  return {
    enabled,
    isLoading: query.isLoading,
    loadFailed: query.loadFailed,
    phaseStatus: bundle?.phase?.status ?? null,
    presentation: bundle && opened ? present(bundle) : null,
    summary: bundle && opened ? summarize(bundle) : null,
  };
}

/**
 * Stage of every phase + the top banner for one dossier (active or terminal).
 * Uses the same query keys as the phase sections, so it adds no API call.
 * M3 loads from the DN hand-off, M4-M7 once processing started (in progress,
 * completed or rejected). A cancelled dossier never reached the DN: nothing loads.
 */
export function useDossierProgress(request: RequestView) {
  const m3Enabled = isIntakeDone(request);
  const laterEnabled = phasesReachable(request);

  const m3 = usePhaseBundle(request.id, 'M3', fetchPreliminaryBundle, m3Enabled);
  const m4 = usePhaseBundle(request.id, 'M4', fetchFormalBundle, laterEnabled);
  const m5 = usePhaseBundle(request.id, 'M5', fetchDeepEvaluationBundle, laterEnabled);
  const m6 = usePhaseBundle(request.id, 'M6', fetchSiteInspectionBundle, laterEnabled);
  const m7 = usePhaseBundle(request.id, 'M7', fetchCertificatesBundle, laterEnabled);

  const snapshots: Record<PhaseCode, PhaseSnapshot> = {
    M3: snapshot(m3, m3Enabled, buildPreliminaryPresentation, summarizePreliminary),
    M4: snapshot(m4, laterEnabled, buildFormalPresentation, summarizeFormal),
    M5: snapshot(m5, laterEnabled, buildDeepEvaluationPresentation, summarizeDeepEvaluation),
    M6: snapshot(m6, laterEnabled, buildSiteInspectionPresentation, summarizeSiteInspection),
    M7: snapshot(m7, laterEnabled, buildCertificatesPresentation, summarizeCertificates),
  };

  const items = buildProgressItems(snapshots);
  return {
    items,
    banner: buildBanner(request, items),
    intakeDone: m3Enabled,
    loading: items.some((item) => item.stage === 'loading'),
  };
}
