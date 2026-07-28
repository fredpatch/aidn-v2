CREATE TYPE "public"."account_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ai_analysis_status" AS ENUM('not_applicable', 'unreviewed', 'reviewed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."applicant_contact_order" AS ENUM('primary', 'secondary', 'tertiary');--> statement-breakpoint
CREATE TYPE "public"."certificate_status" AS ENUM('in_preparation', 'printed', 'signed', 'archived', 'notified', 'collected');--> statement-breakpoint
CREATE TYPE "public"."certificate_type" AS ENUM('agreement', 'recognition');--> statement-breakpoint
CREATE TYPE "public"."dg_circuit_entity_type" AS ENUM('intake_request', 'formal_request_letter');--> statement-breakpoint
CREATE TYPE "public"."dg_circuit_status" AS ENUM('submitted', 'signed', 'pending_review');--> statement-breakpoint
CREATE TYPE "public"."document_owner_type" AS ENUM('dg_circuit_document', 'formal_request_document', 'preliminary_evaluation_form', 'payment_invoice', 'payment_proof', 'document_template', 'meeting_report', 'phase_closure_document', 'certificate_document');--> statement-breakpoint
CREATE TYPE "public"."document_submission_status" AS ENUM('missing', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."document_template_key" AS ENUM('preliminary_evaluation_declaration', 'dn_air_r2_3_f_e_010', 'dn_air_r2_3_f_e_011', 'dn_air_r2_3_f_e_012');--> statement-breakpoint
CREATE TYPE "public"."document_verdict" AS ENUM('validated', 'rejected', 'needs_correction');--> statement-breakpoint
CREATE TYPE "public"."formal_document_slot" AS ENUM('form_dn_air_r2_3_f_e_010', 'form_dn_air_r2_3_f_e_012_personnel', 'certification_personnel_list', 'maintenance_procedures_manual', 'quality_manual', 'sms_manual', 'capability_list', 'training_program', 'subcontractor_contracts', 'technical_documents', 'compliance_statement_011');--> statement-breakpoint
CREATE TYPE "public"."inspection_verdict" AS ENUM('compliant', 'non_compliant', 'compliant_with_reserves');--> statement-breakpoint
CREATE TYPE "public"."internal_role" AS ENUM('reception', 'assistant_dg', 'dn_agent', 'dn_supervisor', 'r3_agent', 's5_agent', 'SU');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('scheduled', 'held', 'no_show', 'rescheduled', 'file_cancelled');--> statement-breakpoint
CREATE TYPE "public"."meeting_type" AS ENUM('preliminary', 'formal', 'site_visit');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('in_app', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_recipient_type" AS ENUM('applicant', 'internal');--> statement-breakpoint
CREATE TYPE "public"."parameter_type" AS ENUM('integer', 'boolean', 'text');--> statement-breakpoint
CREATE TYPE "public"."payment_proof_status" AS ENUM('awaiting_invoice', 'awaiting_proof', 'pending_validation', 'validated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payment_rejection_action" AS ENUM('request_new_proof', 'reject_dossier');--> statement-breakpoint
CREATE TYPE "public"."phase_code" AS ENUM('M3', 'M4', 'M5', 'M6', 'M7');--> statement-breakpoint
CREATE TYPE "public"."phase_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."report_format" AS ENUM('pdf', 'excel');--> statement-breakpoint
CREATE TYPE "public"."report_trigger" AS ENUM('monthly_auto', 'on_demand');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('submitted', 'signed', 'pending_review', 'in_progress', 'rejected', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('recognition', 'issuance', 'modification', 'renewal');--> statement-breakpoint
CREATE TYPE "public"."upload_source_app" AS ENUM('admin', 'portal', 'api', 'unknown');--> statement-breakpoint
CREATE TABLE "account_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_name_input" varchar(255) NOT NULL,
	"legal_address" text NOT NULL,
	"requested_email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"original_approval_number" varchar(100),
	"contact_full_name" varchar(200) NOT NULL,
	"contact_email" varchar(255) NOT NULL,
	"contact_phone" varchar(50),
	"password_hash" varchar(255) NOT NULL,
	"matched_organisation_id" integer,
	"status" "account_request_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"form_started_at" timestamp NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applicants" (
	"id" serial PRIMARY KEY NOT NULL,
	"organisation_id" integer NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"password_hash" varchar(255) NOT NULL,
	"contact_order" "applicant_contact_order" DEFAULT 'primary' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "applicants_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(100) NOT NULL,
	"module" varchar(20) NOT NULL,
	"entity_id" integer,
	"details" jsonb,
	"ip" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"reference" varchar(30) NOT NULL,
	"certificate_type" "certificate_type" NOT NULL,
	"type_overridden_by" integer,
	"status" "certificate_status" DEFAULT 'in_preparation' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"printed_at" timestamp,
	"signed_at" timestamp,
	"archived_at" timestamp,
	"notified_at" timestamp,
	"collected_at" timestamp,
	"approval_reference_number" varchar(100),
	"expires_at" timestamp,
	"initial_issue_date" timestamp,
	"current_issue_date" timestamp,
	"dg_full_name_override" text,
	"scope_details" jsonb,
	CONSTRAINT "certificates_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "dg_circuit_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" "dg_circuit_entity_type" NOT NULL,
	"request_id" integer NOT NULL,
	"status" "dg_circuit_status" DEFAULT 'submitted' NOT NULL,
	"deposited_at" timestamp DEFAULT now() NOT NULL,
	"signed_at" timestamp,
	"pending_review_at" timestamp,
	"blocked_alert_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"formal_request_document_id" integer NOT NULL,
	"verdict" "document_verdict",
	"evaluated_by" integer,
	"evaluated_at" timestamp,
	"correction_deadline" timestamp,
	"resubmitted_file_url" text,
	"resubmitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" "document_template_key" NOT NULL,
	"label" text NOT NULL,
	"file_url" text,
	"mime_type" varchar(100),
	"uploaded_by" integer,
	"uploaded_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "document_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_type" "document_owner_type" NOT NULL,
	"owner_id" integer NOT NULL,
	"file_url" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"uploaded_by" integer,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"trashed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "formal_request_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"slot" "formal_document_slot" NOT NULL,
	"status" "document_submission_status" DEFAULT 'missing' NOT NULL,
	"file_url" text,
	"submitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"meeting_type" "meeting_type" NOT NULL,
	"dn_agent_id" integer NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"location" text,
	"status" "meeting_status" DEFAULT 'scheduled' NOT NULL,
	"ticket_document_url" text,
	"cr_document_url" text,
	"cr_uploaded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_type" "notification_recipient_type" NOT NULL,
	"applicant_id" integer,
	"user_id" integer,
	"channel" "notification_channel" NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"message" text NOT NULL,
	"request_id" integer,
	"read_at" timestamp,
	"email_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"normalized_name" varchar(255) NOT NULL,
	"legal_address" text NOT NULL,
	"phone" varchar(50),
	"email" varchar(255),
	"original_approval_number" varchar(100),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"invoice_file_url" text,
	"invoice_uploaded_at" timestamp,
	"proof_file_url" text,
	"proof_uploaded_at" timestamp,
	"status" "payment_proof_status" DEFAULT 'awaiting_invoice' NOT NULL,
	"validated_by" integer,
	"validated_at" timestamp,
	"rejection_action" "payment_rejection_action",
	"rejection_reason" text
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"phase_code" "phase_code" NOT NULL,
	"status" "phase_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"closure_document_url" text,
	"closure_note" text
);
--> statement-breakpoint
CREATE TABLE "preliminary_evaluation_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"template_id" integer,
	"made_available_at" timestamp,
	"return_deadline" timestamp,
	"submitted_file_url" text,
	"submitted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"format" "report_format" NOT NULL,
	"trigger" "report_trigger" NOT NULL,
	"file_url" text,
	"generated_by" integer,
	"ai_analysis_text" text,
	"ai_analysis_status" "ai_analysis_status" DEFAULT 'not_applicable' NOT NULL,
	"ai_analysis_edited_text" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" varchar(30) NOT NULL,
	"applicant_id" integer NOT NULL,
	"organisation_id" integer NOT NULL,
	"request_type" "request_type" NOT NULL,
	"message" text,
	"status" "request_status" DEFAULT 'submitted' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "requests_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "site_inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"meeting_id" integer NOT NULL,
	"r3_agent_id" integer NOT NULL,
	"verdict" "inspection_verdict" NOT NULL,
	"note" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_parameters" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"type" "parameter_type" NOT NULL,
	"module" varchar(20) NOT NULL,
	"description" text,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_parameters_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "upload_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_url" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by_user_id" integer,
	"uploaded_by_applicant_id" integer,
	"uploaded_from_app" "upload_source_app" DEFAULT 'unknown' NOT NULL,
	"uploaded_from_origin" text,
	"uploaded_from_ip" varchar(45),
	"uploaded_user_agent" text,
	"module_hint" varchar(20),
	"linked_owner_type" "document_owner_type",
	"linked_owner_id" integer,
	"linked_at" timestamp,
	"orphaned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role" "internal_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_code" varchar(20) NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"otp_hash" varchar(255),
	"otp_expires_at" timestamp,
	"first_login" boolean DEFAULT true NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_employee_code_unique" UNIQUE("employee_code"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_matched_organisation_id_organisations_id_fk" FOREIGN KEY ("matched_organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_type_overridden_by_users_id_fk" FOREIGN KEY ("type_overridden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dg_circuit_documents" ADD CONSTRAINT "dg_circuit_documents_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_evaluations" ADD CONSTRAINT "document_evaluations_formal_request_document_id_formal_request_documents_id_fk" FOREIGN KEY ("formal_request_document_id") REFERENCES "public"."formal_request_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_evaluations" ADD CONSTRAINT "document_evaluations_evaluated_by_users_id_fk" FOREIGN KEY ("evaluated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formal_request_documents" ADD CONSTRAINT "formal_request_documents_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_dn_agent_id_users_id_fk" FOREIGN KEY ("dn_agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preliminary_evaluation_forms" ADD CONSTRAINT "preliminary_evaluation_forms_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preliminary_evaluation_forms" ADD CONSTRAINT "preliminary_evaluation_forms_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_inspections" ADD CONSTRAINT "site_inspections_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_inspections" ADD CONSTRAINT "site_inspections_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_inspections" ADD CONSTRAINT "site_inspections_r3_agent_id_users_id_fk" FOREIGN KEY ("r3_agent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_parameters" ADD CONSTRAINT "system_parameters_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_assets" ADD CONSTRAINT "upload_assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_assets" ADD CONSTRAINT "upload_assets_uploaded_by_applicant_id_applicants_id_fk" FOREIGN KEY ("uploaded_by_applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_requests_pending_contact_email_idx" ON "account_requests" USING btree ("contact_email") WHERE "account_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "applicants_organisation_idx" ON "applicants" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_module_idx" ON "audit_logs" USING btree ("module");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dg_circuit_documents_entity_idx" ON "dg_circuit_documents" USING btree ("entity_type","request_id");--> statement-breakpoint
CREATE INDEX "dg_circuit_documents_status_idx" ON "dg_circuit_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_evaluations_request_document_idx" ON "document_evaluations" USING btree ("formal_request_document_id");--> statement-breakpoint
CREATE INDEX "document_versions_owner_idx" ON "document_versions" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "document_versions_trashed_idx" ON "document_versions" USING btree ("trashed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "formal_request_documents_phase_slot_idx" ON "formal_request_documents" USING btree ("phase_id","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_dn_agent_slot_idx" ON "meetings" USING btree ("dn_agent_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "meetings_phase_idx" ON "meetings" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "notifications_applicant_idx" ON "notifications" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_normalized_name_idx" ON "organisations" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_phase_idx" ON "payments" USING btree ("phase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phases_request_phase_idx" ON "phases" USING btree ("request_id","phase_code");--> statement-breakpoint
CREATE INDEX "phases_status_idx" ON "phases" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_one_active_per_organisation_idx" ON "requests" USING btree ("organisation_id") WHERE "requests"."status" NOT IN ('rejected', 'completed', 'cancelled');--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "upload_assets_created_idx" ON "upload_assets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "upload_assets_linked_idx" ON "upload_assets" USING btree ("linked_owner_type","linked_owner_id");--> statement-breakpoint
CREATE INDEX "upload_assets_user_idx" ON "upload_assets" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "upload_assets_applicant_idx" ON "upload_assets" USING btree ("uploaded_by_applicant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_idx" ON "user_roles" USING btree ("user_id","role");