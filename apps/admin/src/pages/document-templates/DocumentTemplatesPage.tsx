import { useEffect, useState, FormEvent } from "react";
import { UploadCloud } from "lucide-react";
import { api, apiErrorMessage } from "../../lib/axios";
import { Button } from "../../components/ui/button";

interface TemplateView {
  id: number;
  key: string;
  label: string;
  fileUrl: string | null;
  mimeType: string | null;
  uploadedAt: string | null;
  active: boolean;
}

// Every key the app currently knows about, whether or not a file has been
// uploaded for it yet - lets DN see at a glance what's still missing.
const KNOWN_TEMPLATES: Array<{ key: string; defaultLabel: string }> = [
  { key: "preliminary_evaluation_declaration", defaultLabel: "Declaration de pre-evaluation (M3)" },
  { key: "dn_air_r2_3_f_e_010", defaultLabel: "DN-AIR-R2-3-F-E-010 - Demande d'agrement d'OMA (M4)" },
  { key: "dn_air_r2_3_f_e_011", defaultLabel: "DN-AIR-R2-3-F-E-011 - Etat de conformite (M4)" },
  { key: "dn_air_r2_3_f_e_012", defaultLabel: "DN-AIR-R2-3-F-E-012 - Acceptation du personnel d'encadrement (M4)" },
];

export default function DocumentTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/document-templates");
      setTemplates(data);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger les modeles."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-anac-navy text-xl font-semibold">Modeles de documents</h1>
        <p className="text-anac-muted text-sm">
          Formulaires vierges mis a disposition des postulants pour telechargement.
        </p>
      </div>

      {error && <p className="text-anac-danger text-sm">{error}</p>}

      <div className="space-y-3">
        {KNOWN_TEMPLATES.map((known) => {
          const existing = templates.find((t) => t.key === known.key);
          return (
            <div key={known.key} className="card flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{existing?.label ?? known.defaultLabel}</p>
                {existing?.fileUrl ? (
                  <a
                    href={`http://localhost:4000${existing.fileUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-anac-blue underline text-xs"
                  >
                    Voir le fichier actuel
                  </a>
                ) : (
                  <p className="text-anac-warning text-xs">Aucun fichier configure</p>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={() => setEditingKey(known.key)} className="gap-1.5">
                <UploadCloud size={14} />
                {existing?.fileUrl ? "Remplacer" : "Configurer"}
              </Button>
            </div>
          );
        })}
      </div>

      {editingKey && (
        <UploadTemplateForm
          templateKey={editingKey}
          defaultLabel={KNOWN_TEMPLATES.find((k) => k.key === editingKey)?.defaultLabel ?? editingKey}
          onDone={() => {
            setEditingKey(null);
            load();
          }}
          onCancel={() => setEditingKey(null)}
        />
      )}

      {loading && <p className="text-anac-muted text-sm">Chargement...</p>}
    </div>
  );
}

function UploadTemplateForm({
  templateKey,
  defaultLabel,
  onDone,
  onCancel,
}: {
  templateKey: string;
  defaultLabel: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(defaultLabel);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Merci de selectionner un fichier.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data: uploaded } = await api.post("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await api.post("/document-templates", {
        key: templateKey,
        label,
        fileUrl: uploaded.fileUrl,
        mimeType: uploaded.mimeType,
      });

      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible d'enregistrer le modele."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      {error && <p className="text-anac-danger text-sm">{error}</p>}
      <div>
        <label className="label">Libelle</label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} required />
      </div>
      <div>
        <label className="label">Fichier (PDF, Word, PNG, JPG)</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Enregistrement..." : "Enregistrer"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
