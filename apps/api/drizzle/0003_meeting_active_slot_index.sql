DROP INDEX IF EXISTS "meetings_dn_agent_slot_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_dn_agent_slot_idx" ON "meetings" USING btree ("dn_agent_id","scheduled_at") WHERE "status" = 'scheduled';
