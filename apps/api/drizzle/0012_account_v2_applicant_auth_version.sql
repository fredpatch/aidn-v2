ALTER TABLE "applicants" ADD COLUMN "auth_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;