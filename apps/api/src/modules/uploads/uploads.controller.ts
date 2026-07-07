import { Request, Response } from "express";
import { ACCEPTED_DOCUMENT_MIME_TYPES } from "@aidn/shared";

/** Generic upload endpoint, reused by every module that needs a file
 *  (M1 demande, M4 formal documents, M5 payment proof, etc.). Storage is
 *  local disk for now (see server.ts static serving) - swappable for
 *  object storage later without changing this contract. */
export async function upload(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ message: "Aucun fichier recu." });
    return;
  }

  if (!ACCEPTED_DOCUMENT_MIME_TYPES.includes(req.file.mimetype as (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number])) {
    res.status(400).json({
      message: "Type de fichier non accepte. Formats acceptes : PDF, Word, PNG, JPG.",
    });
    return;
  }

  res.status(201).json({
    fileUrl: `/uploads/${req.file.filename}`,
    mimeType: req.file.mimetype,
    originalName: req.file.originalname,
  });
}
