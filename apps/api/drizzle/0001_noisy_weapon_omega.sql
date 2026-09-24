CREATE TYPE "public"."document_template_key" AS ENUM('preliminary_evaluation_declaration', 'dn_air_r2_3_f_e_010', 'dn_air_r2_3_f_e_011', 'dn_air_r2_3_f_e_012');--> statement-breakpoint
ALTER TYPE "public"."document_owner_type" ADD VALUE 'document_template';--> statement-breakpoint
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
ALTER TABLE "preliminary_evaluation_forms" ADD COLUMN "template_id" integer;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preliminary_evaluation_forms" ADD CONSTRAINT "preliminary_evaluation_forms_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE no action ON UPDATE no action;