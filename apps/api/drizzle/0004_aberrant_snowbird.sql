ALTER TYPE "public"."document_owner_type" ADD VALUE 'certificate_document';--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "approval_reference_number" varchar(100);--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "initial_issue_date" timestamp;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "current_issue_date" timestamp;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "dg_full_name_override" text;--> statement-breakpoint
ALTER TABLE "certificates" ADD COLUMN "scope_details" jsonb;
