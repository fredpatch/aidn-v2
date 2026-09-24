ALTER TYPE "public"."document_owner_type" ADD VALUE 'meeting_report';--> statement-breakpoint
ALTER TYPE "public"."document_owner_type" ADD VALUE 'phase_closure_document';--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "cr_document_url" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "cr_uploaded_at" timestamp;