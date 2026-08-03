ALTER TABLE "reports" ADD COLUMN "report_key" varchar(50) DEFAULT 'processing_delay' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "filters" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "summary" jsonb;
