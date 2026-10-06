import { FormEvent, useId, useState } from 'react';
import { apiErrorMessage } from '../../../lib/axios';
import { notify } from '../../../lib/notify';
import { submitMyRequest } from '../../../lib/api/requests.api';
import { uploadFile } from '../../../lib/uploads';
import { FileDropzone } from '../../../components/files/FileDropzone';

export function SubmitRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [requestType, setRequestType] = useState('issuance');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const typeId = useId();
  const messageId = useId();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      const msg = 'Merci de joindre votre demande scannée (PDF, Word, PNG ou JPG).';
      setError(msg);
      notify.warning(msg);
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = await uploadFile(file);
      await submitMyRequest({
        requestType,
        message,
        uploadAssetId: uploaded.uploadAssetId,
      });
      notify.success('Demande soumise avec succès.');
      onSubmitted();
    } catch (err) {
      const msg = apiErrorMessage(err, 'Impossible de soumettre la demande.');
      setError(msg);
      notify.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <p className="text-anac-muted text-sm">
        Choisissez le type de demande et joignez votre courrier scanné.
      </p>
      {error && <p role="alert" className="text-anac-danger text-sm">{error}</p>}
      <div>
        <label className="label" htmlFor={typeId}>Type de demande</label>
        <select
          id={typeId}
          className="input"
          value={requestType}
          onChange={(e) => setRequestType(e.target.value)}
        >
          <option value="issuance">Délivrance d&apos;un nouvel agrément</option>
          <option value="recognition">Reconnaissance d&apos;agrément</option>
          <option value="modification">Modification d&apos;un agrément existant</option>
          <option value="renewal">Renouvellement d&apos;un agrément existant</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor={messageId}>Message (optionnel)</label>
        <textarea
          id={messageId}
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
        />
      </div>
      <div>
        <p className="label">Votre demande scannée</p>
        <FileDropzone label="Joindre ma demande scannée" file={file} onFileChange={setFile} disabled={submitting} />
      </div>
      <button type="submit" className="btn-primary w-full" disabled={submitting}>
        {submitting ? 'Envoi...' : 'Soumettre ma demande'}
      </button>
    </form>
  );
}
