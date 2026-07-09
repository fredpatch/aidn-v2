import { makeDeclarationAvailable } from '../api';
import { useAsyncAction } from './useAsyncAction';

export function useDeclarationActions(
  setActionError: (message: string | null) => void,
  onChanged: () => void
) {
  const { busy, run } = useAsyncAction();

  async function makeAvailable(phaseId: number, returnDays?: number): Promise<boolean> {
    setActionError(null);
    const result = await run(async () => {
      await makeDeclarationAvailable(phaseId, returnDays);
    });

    if (result !== undefined) {
      onChanged();
      return true;
    }

    setActionError('Impossible de rendre la declaration disponible.');
    return false;
  }

  return {
    busy,
    makeAvailable,
  };
}
