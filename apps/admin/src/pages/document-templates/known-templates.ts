import { classifyTemplateHealth } from "@aidn/shared";

export type Phase = "preliminary" | "formal";

export interface KnownTemplate {
  key: string;
  defaultLabel: string;
  phase: Phase;
  module: string;
  usageDescription: string;
}

export const PHASE_LABELS: Record<Phase, string> = {
  preliminary: "Phase préliminaire",
  formal: "Demande formelle",
};

// Every key the app currently knows about, whether or not a file has been
// uploaded for it yet - lets DN see at a glance what's still missing.
// Phase/usage metadata is UI-only; the backend only knows the key.
export const KNOWN_TEMPLATES: KnownTemplate[] = [
  {
    key: "preliminary_evaluation_declaration",
    defaultLabel: "Déclaration de pré-évaluation",
    phase: "preliminary",
    module: "M3",
    usageDescription: "Formulaire vierge remis au postulant après la réunion préliminaire",
  },
  {
    key: "dn_air_r2_3_f_e_010",
    defaultLabel: "DN-AIR-R2-3-F-E-010",
    phase: "formal",
    module: "M4",
    usageDescription: "Demande d’agrément d’OMA",
  },
  {
    key: "dn_air_r2_3_f_e_011",
    defaultLabel: "DN-AIR-R2-3-F-E-011",
    phase: "formal",
    module: "M4",
    usageDescription: "État de conformité à la réglementation en vigueur",
  },
  {
    key: "dn_air_r2_3_f_e_012",
    defaultLabel: "DN-AIR-R2-3-F-E-012",
    phase: "formal",
    module: "M4",
    usageDescription: "Acceptation du personnel d’encadrement",
  },
];

export type TemplatePageStatus = "available" | "missing" | "inactive" | "unconfigured";

/** Same precedence as the SU « État du système » view (shared rule):
 *  no row -> à configurer; inactive -> inactif; null or absent file ->
 *  fichier introuvable; otherwise disponible. The server already checked
 *  the file, so storage counts as reachable here. */
export function deriveTemplatePageStatus(
  existing: { active: boolean; fileUrl: string | null; fileExists: boolean } | undefined
): TemplatePageStatus {
  const status = classifyTemplateHealth(existing, { storageAvailable: true });
  if (status === "missing") return "unconfigured";
  if (status === "inactive") return "inactive";
  if (status === "healthy") return "available";
  return "missing";
}
