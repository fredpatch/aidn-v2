import { Request, Response } from "express";
import * as templatesService from "./document-templates.service.js";
import { DOCUMENT_TEMPLATE_KEYS, type DocumentTemplateKey } from "@aidn/shared";

function isValidKey(key: string): key is DocumentTemplateKey {
  return (DOCUMENT_TEMPLATE_KEYS as readonly string[]).includes(key);
}

export async function list(_req: Request, res: Response): Promise<void> {
  try {
    const templates = await templatesService.listTemplates();
    res.json(templates);
  } catch (error) {
    console.error("[document-templates/list]", error);
    res.status(500).json({ message: "Erreur interne." });
  }
}

/** Reachable by either staff or applicant - both sides need to download the
 *  current blank form for a given key (M3 declaration, M4 forms). */
export async function getByKey(req: Request, res: Response): Promise<void> {
  const key = req.params.key as string;
  if (!isValidKey(key)) {
    res.status(400).json({ message: "Cle de modele inconnue." });
    return;
  }

  try {
    const template = await templatesService.getTemplateByKey(key);
    if (!template || !template.active || !template.fileUrl) {
      res.status(404).json({ message: "Modele non disponible." });
      return;
    }
    res.json(template);
  } catch (error) {
    console.error("[document-templates/getByKey]", error);
    res.status(500).json({ message: "Erreur interne." });
  }
}

export async function upsert(req: Request, res: Response): Promise<void> {
  const { key, label, fileUrl, mimeType } = req.body ?? {};

  if (!key || !label || !fileUrl || !mimeType) {
    res.status(400).json({ message: "key, label, fileUrl et mimeType sont requis." });
    return;
  }
  if (!isValidKey(key)) {
    res.status(400).json({ message: "Cle de modele inconnue." });
    return;
  }

  try {
    const template = await templatesService.upsertTemplate({
      key,
      label,
      fileUrl,
      mimeType,
      uploadedByUserId: req.user!.userId,
    });
    res.status(201).json(template);
  } catch (error) {
    console.error("[document-templates/upsert]", error);
    res.status(500).json({ message: "Erreur interne." });
  }
}
