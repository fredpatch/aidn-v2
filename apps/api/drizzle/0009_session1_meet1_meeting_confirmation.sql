CREATE TYPE "public"."meeting_confirmation_status" AS ENUM('awaiting_applicant', 'awaiting_dn', 'confirmed', 'not_required');--> statement-breakpoint
CREATE TYPE "public"."meeting_negotiation_event_kind" AS ENUM('dn_proposed', 'applicant_confirmed', 'applicant_alternate_proposed', 'dn_alternate_accepted', 'dn_alternate_refused', 'dn_confirmed_on_behalf', 'dn_rescheduled');--> statement-breakpoint
CREATE TABLE "meeting_negotiation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer NOT NULL,
	"kind" "meeting_negotiation_event_kind" NOT NULL,
	"slot_at" timestamp,
	"remark" text,
	"reason" text,
	"resulting_meeting_id" integer,
	"actor_user_id" integer,
	"actor_applicant_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_negotiation_events_one_actor_chk" CHECK (("meeting_negotiation_events"."actor_user_id" IS NULL) <> ("meeting_negotiation_events"."actor_applicant_id" IS NULL)),
	CONSTRAINT "meeting_negotiation_events_payload_chk" CHECK (CASE "meeting_negotiation_events"."kind"
        WHEN 'dn_proposed' THEN "meeting_negotiation_events"."actor_user_id" IS NOT NULL AND "meeting_negotiation_events"."slot_at" IS NOT NULL
        WHEN 'applicant_confirmed' THEN "meeting_negotiation_events"."actor_applicant_id" IS NOT NULL
        WHEN 'applicant_alternate_proposed' THEN "meeting_negotiation_events"."actor_applicant_id" IS NOT NULL AND "meeting_negotiation_events"."slot_at" IS NOT NULL AND btrim(coalesce("meeting_negotiation_events"."remark", '')) <> ''
        WHEN 'dn_alternate_accepted' THEN "meeting_negotiation_events"."actor_user_id" IS NOT NULL AND "meeting_negotiation_events"."slot_at" IS NOT NULL AND "meeting_negotiation_events"."resulting_meeting_id" IS NOT NULL
        WHEN 'dn_alternate_refused' THEN "meeting_negotiation_events"."actor_user_id" IS NOT NULL AND "meeting_negotiation_events"."slot_at" IS NOT NULL AND btrim(coalesce("meeting_negotiation_events"."reason", '')) <> ''
        WHEN 'dn_confirmed_on_behalf' THEN "meeting_negotiation_events"."actor_user_id" IS NOT NULL AND btrim(coalesce("meeting_negotiation_events"."remark", '')) <> ''
        WHEN 'dn_rescheduled' THEN "meeting_negotiation_events"."actor_user_id" IS NOT NULL AND "meeting_negotiation_events"."slot_at" IS NOT NULL AND "meeting_negotiation_events"."resulting_meeting_id" IS NOT NULL
        ELSE false
      END)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "applicant_id" integer;--> statement-breakpoint
-- SESSION1-MEET-1: the type was CREATED above in this same transaction, so its
-- values are usable here (the 55P04 restriction only concerns a value added to a
-- pre-existing enum). Temporary default = legacy rows become confirmed.
ALTER TABLE "meetings" ADD COLUMN "confirmation_status" "meeting_confirmation_status" DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "alternate_scheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "alternate_remark" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
-- Hand-written data step (not generated): legacy M6 site visits need no
-- confirmation; legacy confirmed rows get created_at as a technical proxy.
UPDATE "meetings" SET "confirmation_status" = 'not_required' WHERE "meeting_type" = 'site_visit';--> statement-breakpoint
UPDATE "meetings" SET "confirmed_at" = "created_at" WHERE "confirmation_status" = 'confirmed';--> statement-breakpoint
-- No permanent default: every insert must state its confirmation status.
ALTER TABLE "meetings" ALTER COLUMN "confirmation_status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "meeting_negotiation_events" ADD CONSTRAINT "meeting_negotiation_events_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_negotiation_events" ADD CONSTRAINT "meeting_negotiation_events_resulting_meeting_id_meetings_id_fk" FOREIGN KEY ("resulting_meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_negotiation_events" ADD CONSTRAINT "meeting_negotiation_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_negotiation_events" ADD CONSTRAINT "meeting_negotiation_events_actor_applicant_id_applicants_id_fk" FOREIGN KEY ("actor_applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_negotiation_events_meeting_created_idx" ON "meeting_negotiation_events" USING btree ("meeting_id","created_at","id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_applicant_idx" ON "audit_logs" USING btree ("applicant_id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_single_actor_chk" CHECK (NOT ("audit_logs"."user_id" IS NOT NULL AND "audit_logs"."applicant_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_alternate_coherent_chk" CHECK (("meetings"."confirmation_status" = 'awaiting_dn') = ("meetings"."alternate_scheduled_at" IS NOT NULL AND "meetings"."alternate_remark" IS NOT NULL) AND ("meetings"."alternate_scheduled_at" IS NULL) = ("meetings"."alternate_remark" IS NULL));--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_confirmed_at_chk" CHECK (("meetings"."confirmation_status" = 'confirmed') = ("meetings"."confirmed_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_type_confirmation_chk" CHECK (("meetings"."meeting_type" = 'site_visit') = ("meetings"."confirmation_status" = 'not_required'));