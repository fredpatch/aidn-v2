import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../../lib/axios';
import { fetchPreliminaryBundle, startPreliminaryPhase } from '../api';
import type { PreliminaryBundle } from '../types';
import { useAsyncAction } from './useAsyncAction';

export function usePreliminaryBundle(
  requestId: string | undefined,
  setActionError: (message: string | null) => void
) {
  const [bundle, setBundle] = useState<PreliminaryBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { busy: startingPhase, run: runStartAction } = useAsyncAction();

  const load = useCallback(async () => {
    if (!requestId) {
      setError('Identifiant de demande manquant.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchPreliminaryBundle(requestId);
      setBundle(data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Impossible de charger la phase.'));
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  async function startPhase() {
    if (!requestId) {
      setActionError('Identifiant de demande manquant.');
      return;
    }

    setActionError(null);
    const result = await runStartAction(async () => {
      await startPreliminaryPhase(requestId);
    });

    if (result !== undefined) {
      await load();
    } else {
      setActionError('Impossible de demarrer la phase.');
    }
  }

  return {
    bundle,
    loading,
    error,
    reload: load,
    startPhase,
    startingPhase,
  };
}
