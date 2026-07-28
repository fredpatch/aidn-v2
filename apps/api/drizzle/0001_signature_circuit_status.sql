ALTER TYPE "public"."dg_circuit_status" ADD VALUE IF NOT EXISTS 'in_signature_circuit';
ALTER TABLE "dg_circuit_documents" ADD COLUMN IF NOT EXISTS "signature_sent_at" timestamp;
