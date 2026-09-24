CREATE TYPE "public"."upload_source_app" AS ENUM('admin', 'portal', 'api', 'unknown');--> statement-breakpoint
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
ALTER TABLE "upload_assets" ADD CONSTRAINT "upload_assets_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_assets" ADD CONSTRAINT "upload_assets_uploaded_by_applicant_id_applicants_id_fk" FOREIGN KEY ("uploaded_by_applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_assets_created_idx" ON "upload_assets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "upload_assets_linked_idx" ON "upload_assets" USING btree ("linked_owner_type","linked_owner_id");--> statement-breakpoint
CREATE INDEX "upload_assets_user_idx" ON "upload_assets" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "upload_assets_applicant_idx" ON "upload_assets" USING btree ("uploaded_by_applicant_id");