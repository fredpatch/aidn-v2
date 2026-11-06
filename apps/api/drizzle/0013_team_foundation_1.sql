CREATE TABLE "dossier_team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossier_team_proposal_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposal_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dossier_team_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"proposed_approval_number" varchar(100) NOT NULL,
	"proposed_by" integer NOT NULL,
	"proposed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dossier_team_proposals_number_nonempty" CHECK (length(btrim("dossier_team_proposals"."proposed_approval_number")) > 0)
);
--> statement-breakpoint
CREATE TABLE "dossier_teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"approval_number" varchar(100) NOT NULL,
	"finalized_by" integer NOT NULL,
	"finalized_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dossier_teams_number_nonempty" CHECK (length(btrim("dossier_teams"."approval_number")) > 0)
);
--> statement-breakpoint
ALTER TABLE "dossier_team_members" ADD CONSTRAINT "dossier_team_members_team_id_dossier_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."dossier_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_team_members" ADD CONSTRAINT "dossier_team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_team_proposal_members" ADD CONSTRAINT "dossier_team_proposal_members_proposal_id_dossier_team_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."dossier_team_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_team_proposal_members" ADD CONSTRAINT "dossier_team_proposal_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_team_proposals" ADD CONSTRAINT "dossier_team_proposals_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_team_proposals" ADD CONSTRAINT "dossier_team_proposals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_teams" ADD CONSTRAINT "dossier_teams_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_teams" ADD CONSTRAINT "dossier_teams_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_team_members_team_user_idx" ON "dossier_team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "dossier_team_members_user_idx" ON "dossier_team_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_team_proposal_members_proposal_user_idx" ON "dossier_team_proposal_members" USING btree ("proposal_id","user_id");--> statement-breakpoint
CREATE INDEX "dossier_team_proposal_members_user_idx" ON "dossier_team_proposal_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_team_proposals_request_idx" ON "dossier_team_proposals" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dossier_teams_request_idx" ON "dossier_teams" USING btree ("request_id");