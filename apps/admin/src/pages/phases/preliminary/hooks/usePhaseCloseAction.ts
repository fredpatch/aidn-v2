import { closePhase, uploadFile } from '../api';
import { useAsyncAction } from './useAsyncAction';

export function usePhaseCloseAction(
  setActionError: (message: string | null) => void,
  onChanged: () => void
) {
  const { busy, run } = useAsyncAction();

  async function close(params: {
    phaseId: number;
    note?: string;
    file?: File | null;
  }): Promise<boolean> {
    setActionError(null);

    const result = await run(async () => {
      let closureDocumentUrl: string | undefined;
      let closureDocumentMimeType: string | undefined;

      if (params.file) {
        const uploaded = await uploadFile(params.file);
        closureDocumentUrl = uploaded.fileUrl;
        closureDocumentMimeType = uploaded.mimeType;
      }

      await closePhase({
        phaseId: params.phaseId,
        closureDocumentUrl,
        closureDocumentMimeType,
        closureNote: params.note || undefined,
      });
    });

    if (result !== undefined) {
      onChanged();
      return true;
    }

    setActionError('Impossible de cloturer la phase.');
    return false;
  }

  return {
    busy,
    close,
  };
}
