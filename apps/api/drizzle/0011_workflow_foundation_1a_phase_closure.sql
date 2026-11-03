CREATE TYPE "public"."phase_closure_status" AS ENUM('submitted', 'in_signature_circuit', 'signed_returned');--> statement-breakpoint
-- The composite foreign key below needs this unique index first.
CREATE UNIQUE INDEX "phases_id_request_idx" ON "phases" USING btree ("id","request_id");--> statement-breakpoint
CREATE TABLE "phase_closure_circuits" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"request_id" integer NOT NULL,
	"status" "phase_closure_status" DEFAULT 'submitted' NOT NULL,
	"draft_document_url" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"signature_sent_at" timestamp,
	"signed_at" timestamp,
	"signed_document_url" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phase_closure_circuits_status_coherent_chk" CHECK (("phase_closure_circuits"."signature_sent_at" IS NOT NULL) = ("phase_closure_circuits"."status" IN ('in_signature_circuit', 'signed_returned'))
        AND ("phase_closure_circuits"."signed_at" IS NOT NULL) = ("phase_closure_circuits"."status" = 'signed_returned')
        AND ("phase_closure_circuits"."signed_document_url" IS NOT NULL) = ("phase_closure_circuits"."status" = 'signed_returned'))
);
--> statement-breakpoint
ALTER TABLE "phase_closure_circuits" ADD CONSTRAINT "phase_closure_circuits_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_closure_circuits" ADD CONSTRAINT "phase_closure_circuits_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_closure_circuits" ADD CONSTRAINT "phase_closure_circuits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_closure_circuits" ADD CONSTRAINT "phase_closure_circuits_phase_request_fk" FOREIGN KEY ("phase_id","request_id") REFERENCES "public"."phases"("id","request_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "phase_closure_circuits_phase_idx" ON "phase_closure_circuits" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "phase_closure_circuits_request_idx" ON "phase_closure_circuits" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "phase_closure_circuits_status_idx" ON "phase_closure_circuits" USING btree ("status");