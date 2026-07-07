import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ── Enums ────────────────────────────────────────────────────────────────
// Kept aligned with packages/shared/src/statuses.ts - update both together.

export const internalRoleEnum = pgEnum("internal_role", [
  "reception",
  "assistant_dg",
  "dn_agent",
  "dn_supervisor",
  "r3_agent",
  "s5_agent",
  "SU",
]);

export const requestTypeEnum = pgEnum("request_type", [
  "recognition",
  "issuance",
  "modification",
  "renewal",
]);

/** Pattern "Circuit DG" - shared by intake (M1) and the M4 official letter */
export const dgCircuitStatusEnum = pgEnum("dg_circuit_status", [
  "submitted",
  "signed",
  "pending_review",
]);

export const dgCircuitEntityTypeEnum = pgEnum("dg_circuit_entity_type", [
  "intake_request",
  "formal_request_letter",
]);

/** Overall dossier status - includes terminal states not part of the DG circuit.
 *  "rejected" and "completed" are the only statuses that release the
 *  "one active request per organisation" rule (see requests table below). */
export const requestStatusEnum = pgEnum("request_status", [
  "submitted",
  "signed",
  "pending_review",
  "in_progress",
  "rejected",
  "completed",
  "cancelled",
]);

export const phaseCodeEnum = pgEnum("phase_code", [
  "M3", // Preliminary
  "M4", // Formal request
  "M5", // In-depth evaluation
  "M6", // Demonstration / inspection
  "M7", // Delivery
]);

export const phaseStatusEnum = pgEnum("phase_status", ["open", "closed"]);

/** Pattern "Reunion / Visite" - shared by M3, M4, M6 */
export const meetingTypeEnum = pgEnum("meeting_type", ["preliminary", "formal", "site_visit"]);
export const meetingStatusEnum = pgEnum("meeting_status", [
  "scheduled",
  "held",
  "no_show",
  "rescheduled",
  "file_cancelled",
]);

/** M4 - the 10 named documents besides the official letter (11th item) */
export const formalDocumentSlotEnum = pgEnum("formal_document_slot", [
  "form_dn_air_r2_3_f_e_010",
  "form_dn_air_r2_3_f_e_012_personnel",
  "certification_personnel_list",
  "maintenance_procedures_manual",
  "quality_manual",
  "sms_manual",
  "capability_list",
  "training_program",
  "subcontractor_contracts",
  "technical_documents",
  "compliance_statement_011",
]);

export const documentSubmissionStatusEnum = pgEnum("document_submission_status", [
  "missing",
  "submitted",
]);

/** M5 - per-document evaluation verdict */
export const documentVerdictEnum = pgEnum("document_verdict", [
  "validated",
  "rejected",
  "needs_correction",
]);

/** M6 - R3 site inspection verdict, submitted in one action with a note */
export const inspectionVerdictEnum = pgEnum("inspection_verdict", [
  "compliant",
  "non_compliant",
  "compliant_with_reserves",
]);

/** M9 - payment proof lifecycle, reused by M5/M6/M7 */
export const paymentProofStatusEnum = pgEnum("payment_proof_status", [
  "awaiting_invoice",
  "awaiting_proof",
  "pending_validation",
  "validated",
  "rejected",
]);

export const paymentRejectionActionEnum = pgEnum("payment_rejection_action", [
  "request_new_proof",
  "reject_dossier",
]);

/** M7 - certificate lifecycle; the phase stays open through this entire cycle
 *  because time-to-deliver is the tracked KPI */
export const certificateTypeEnum = pgEnum("certificate_type", ["agreement", "recognition"]);
export const certificateStatusEnum = pgEnum("certificate_status", [
  "in_preparation",
  "printed",
  "signed",
  "archived",
  "notified",
  "collected",
]);

/** M8 - document version / trash pattern, reused across every upload point */
export const documentOwnerTypeEnum = pgEnum("document_owner_type", [
  "dg_circuit_document",
  "formal_request_document",
  "preliminary_evaluation_form",
  "payment_invoice",
  "payment_proof",
]);

/** M13 - applicant account request review flow (public registration) */
export const accountRequestStatusEnum = pgEnum("account_request_status", [
  "pending",
  "approved",
  "rejected",
]);

/** M13 - contact ordering label only; permissions are strictly equal across
 *  contacts of the same organisation, never an access-control tier */
export const applicantContactOrderEnum = pgEnum("applicant_contact_order", [
  "primary",
  "secondary",
  "tertiary",
]);

/** M11 - notification recipient/channel */
export const notificationRecipientTypeEnum = pgEnum("notification_recipient_type", [
  "applicant",
  "internal",
]);
export const notificationChannelEnum = pgEnum("notification_channel", ["in_app", "email"]);

/** M12 - report generation and AI-assisted analysis review */
export const reportFormatEnum = pgEnum("report_format", ["pdf", "excel"]);
export const reportTriggerEnum = pgEnum("report_trigger", ["monthly_auto", "on_demand"]);
export const aiAnalysisStatusEnum = pgEnum("ai_analysis_status", [
  "not_applicable",
  "unreviewed",
  "reviewed",
  "rejected",
]);

// ── M13 - Internal users & roles ────────────────────────────────────────────
/** Mirrors SICOT's login model: employee code as login identifier, OTP-based
 *  first login, bcrypt password thereafter, failed-attempt lockout. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  employeeCode: varchar("employee_code", { length: 20 }).notNull().unique(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  // Nullable: unset until the user completes first login via OTP.
  passwordHash: varchar("password_hash", { length: 255 }),
  otpHash: varchar("otp_hash", { length: 255 }),
  otpExpiresAt: timestamp("otp_expires_at"),
  firstLogin: boolean("first_login").notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Mirrors SICOT's parametres table: admin-configurable values (OTP expiry,
 *  lockout policy, default alert thresholds) instead of hardcoded constants. */
export const parameterTypeEnum = pgEnum("parameter_type", ["integer", "boolean", "text"]);

export const systemParameters = pgTable("system_parameters", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  type: parameterTypeEnum("type").notNull(),
  module: varchar("module", { length: 20 }).notNull(), // M1, M13, AUTH...
  description: text("description"),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Join table so a user can hold more than one internal role at once */
export const userRoles = pgTable(
  "user_roles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    role: internalRoleEnum("role").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_roles_user_role_idx").on(t.userId, t.role)]
);

// ── M13 - Organisations & applicant accounts ────────────────────────────────
export const organisations = pgTable(
  "organisations",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
    legalAddress: text("legal_address").notNull(),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    originalApprovalNumber: varchar("original_approval_number", { length: 100 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("organisations_normalized_name_idx").on(t.normalizedName)]
);

export const applicants = pgTable(
  "applicants",
  {
    id: serial("id").primaryKey(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisations.id),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    phone: varchar("phone", { length: 50 }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    contactOrder: applicantContactOrderEnum("contact_order").notNull().default("primary"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("applicants_organisation_idx").on(t.organisationId)]
);

/** Public account request flow - see project/modules-feasibility.md M13.
 *  Anti-bot (honeypot + minimum elapsed time) is validated at submission time
 *  and is not persisted here. Partial unique index enforces "one active
 *  (pending) request per contact email" without blocking resubmission after
 *  a past request was approved or rejected. */
export const accountRequests = pgTable(
  "account_requests",
  {
    id: serial("id").primaryKey(),
    organisationNameInput: varchar("organisation_name_input", { length: 255 }).notNull(),
    legalAddress: text("legal_address").notNull(),
    requestedEmail: varchar("requested_email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    originalApprovalNumber: varchar("original_approval_number", { length: 100 }),
    contactFullName: varchar("contact_full_name", { length: 200 }).notNull(),
    contactEmail: varchar("contact_email", { length: 255 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 50 }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    matchedOrganisationId: integer("matched_organisation_id").references(() => organisations.id),
    status: accountRequestStatusEnum("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: integer("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    formStartedAt: timestamp("form_started_at").notNull(),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("account_requests_pending_contact_email_idx")
      .on(t.contactEmail)
      .where(sql`${t.status} = 'pending'`),
  ]
);

// ── M1 - Requests (dossiers) ────────────────────────────────────────────────
/** "One active request per organisation" rule: enforced with a partial unique
 *  index on organisationId, active whenever status is NOT in ('rejected',
 *  'completed'). This is the DB-level backstop for the rule locked in M1 -
 *  application code must still check it before insert for a clean error
 *  message, but the constraint is what actually prevents the race. */
export const requests = pgTable(
  "requests",
  {
    id: serial("id").primaryKey(),
    reference: varchar("reference", { length: 30 }).notNull().unique(), // DEM-YYYY-MM-DD-ORGCODE-NN
    applicantId: integer("applicant_id")
      .notNull()
      .references(() => applicants.id),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisations.id),
    requestType: requestTypeEnum("request_type").notNull(),
    message: text("message"),
    status: requestStatusEnum("status").notNull().default("submitted"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("requests_one_active_per_organisation_idx")
      .on(t.organisationId)
      .where(sql`${t.status} NOT IN ('rejected', 'completed', 'cancelled')`),
    index("requests_status_idx").on(t.status),
  ]
);

/** Pattern "Circuit DG" - reused for the intake request itself and, later,
 *  for the M4 official letter. requestId points at requests.id in both cases;
 *  entityType distinguishes which circuit instance this row represents. */
export const dgCircuitDocuments = pgTable(
  "dg_circuit_documents",
  {
    id: serial("id").primaryKey(),
    entityType: dgCircuitEntityTypeEnum("entity_type").notNull(),
    requestId: integer("request_id")
      .notNull()
      .references(() => requests.id),
    status: dgCircuitStatusEnum("status").notNull().default("submitted"),
    depositedAt: timestamp("deposited_at").notNull().defaultNow(),
    signedAt: timestamp("signed_at"),
    pendingReviewAt: timestamp("pending_review_at"),
    blockedAlertSentAt: timestamp("blocked_alert_sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dg_circuit_documents_entity_idx").on(t.entityType, t.requestId),
    index("dg_circuit_documents_status_idx").on(t.status),
  ]
);

// ── M3-M7 - Phases ───────────────────────────────────────────────────────────
export const phases = pgTable(
  "phases",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => requests.id),
    phaseCode: phaseCodeEnum("phase_code").notNull(),
    status: phaseStatusEnum("status").notNull().default("open"),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
    closureDocumentUrl: text("closure_document_url"),
    closureNote: text("closure_note"),
  },
  (t) => [
    uniqueIndex("phases_request_phase_idx").on(t.requestId, t.phaseCode),
    index("phases_status_idx").on(t.status),
  ]
);

/** Pattern "Reunion / Visite" - M3 preliminary meeting, M4 formal meeting,
 *  M6 site visit. Hard-conflict rule (M10): the same DN agent cannot hold two
 *  meetings at the exact same scheduledAt - enforced with a unique index, so
 *  the insert itself fails rather than relying on an app-level check alone.
 *  Same-day/different-time overlap is a soft warning handled in the app
 *  layer, not a DB constraint. */
export const meetings = pgTable(
  "meetings",
  {
    id: serial("id").primaryKey(),
    phaseId: integer("phase_id")
      .notNull()
      .references(() => phases.id),
    meetingType: meetingTypeEnum("meeting_type").notNull(),
    dnAgentId: integer("dn_agent_id")
      .notNull()
      .references(() => users.id),
    scheduledAt: timestamp("scheduled_at").notNull(),
    location: text("location"), // used for site_visit, null otherwise
    status: meetingStatusEnum("status").notNull().default("scheduled"),
    ticketDocumentUrl: text("ticket_document_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meetings_dn_agent_slot_idx").on(t.dnAgentId, t.scheduledAt),
    index("meetings_phase_idx").on(t.phaseId),
  ]
);

// ── M3 - Preliminary evaluation declaration ─────────────────────────────────
export const preliminaryEvaluationForms = pgTable("preliminary_evaluation_forms", {
  id: serial("id").primaryKey(),
  phaseId: integer("phase_id")
    .notNull()
    .references(() => phases.id),
  madeAvailableAt: timestamp("made_available_at"),
  returnDeadline: timestamp("return_deadline"), // set dynamically by DN
  submittedFileUrl: text("submitted_file_url"),
  submittedAt: timestamp("submitted_at"),
});

// ── M4 - Formal request documents (10 named items, letter tracked separately
//    via dg_circuit_documents) ────────────────────────────────────────────
export const formalRequestDocuments = pgTable(
  "formal_request_documents",
  {
    id: serial("id").primaryKey(),
    phaseId: integer("phase_id")
      .notNull()
      .references(() => phases.id),
    slot: formalDocumentSlotEnum("slot").notNull(),
    status: documentSubmissionStatusEnum("status").notNull().default("missing"),
    fileUrl: text("file_url"),
    submittedAt: timestamp("submitted_at"),
  },
  (t) => [uniqueIndex("formal_request_documents_phase_slot_idx").on(t.phaseId, t.slot)]
);

// ── M5 - Per-document evaluation (reuses the M4 uploaded files) ────────────
export const documentEvaluations = pgTable(
  "document_evaluations",
  {
    id: serial("id").primaryKey(),
    formalRequestDocumentId: integer("formal_request_document_id")
      .notNull()
      .references(() => formalRequestDocuments.id),
    verdict: documentVerdictEnum("verdict"),
    evaluatedBy: integer("evaluated_by").references(() => users.id),
    evaluatedAt: timestamp("evaluated_at"),
    correctionDeadline: timestamp("correction_deadline"), // dynamic, creates urgency
    resubmittedFileUrl: text("resubmitted_file_url"),
    resubmittedAt: timestamp("resubmitted_at"),
  },
  (t) => [index("document_evaluations_request_document_idx").on(t.formalRequestDocumentId)]
);

// ── M6 - Site inspection (R3 avis, verdict + note in one submission) ───────
export const siteInspections = pgTable("site_inspections", {
  id: serial("id").primaryKey(),
  phaseId: integer("phase_id")
    .notNull()
    .references(() => phases.id),
  meetingId: integer("meeting_id")
    .notNull()
    .references(() => meetings.id),
  r3AgentId: integer("r3_agent_id")
    .notNull()
    .references(() => users.id),
  verdict: inspectionVerdictEnum("verdict").notNull(),
  note: text("note").notNull(),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

// ── M9 - Payments (reused by M5, M6, M7) ────────────────────────────────────
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    phaseId: integer("phase_id")
      .notNull()
      .references(() => phases.id),
    invoiceFileUrl: text("invoice_file_url"),
    invoiceUploadedAt: timestamp("invoice_uploaded_at"),
    proofFileUrl: text("proof_file_url"),
    proofUploadedAt: timestamp("proof_uploaded_at"),
    status: paymentProofStatusEnum("status").notNull().default("awaiting_invoice"),
    validatedBy: integer("validated_by").references(() => users.id),
    validatedAt: timestamp("validated_at"),
    rejectionAction: paymentRejectionActionEnum("rejection_action"),
    rejectionReason: text("rejection_reason"),
  },
  (t) => [uniqueIndex("payments_phase_idx").on(t.phaseId)]
);

// ── M7 - Certificates ────────────────────────────────────────────────────────
export const certificates = pgTable("certificates", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id")
    .notNull()
    .references(() => requests.id),
  reference: varchar("reference", { length: 30 }).notNull().unique(), // CERT-YYYY-XXXX
  certificateType: certificateTypeEnum("certificate_type").notNull(),
  typeOverriddenBy: integer("type_overridden_by").references(() => users.id),
  status: certificateStatusEnum("status").notNull().default("in_preparation"),
  // createdAt is the point zero of the time-to-deliver KPI: set at payment validation.
  createdAt: timestamp("created_at").notNull().defaultNow(),
  printedAt: timestamp("printed_at"),
  signedAt: timestamp("signed_at"),
  archivedAt: timestamp("archived_at"),
  notifiedAt: timestamp("notified_at"), // time-to-collect KPI starts here
  collectedAt: timestamp("collected_at"), // time-to-collect KPI ends here
});

// ── M8 - Document versions & trash (reused across every upload point) ──────
export const documentVersions = pgTable(
  "document_versions",
  {
    id: serial("id").primaryKey(),
    ownerType: documentOwnerTypeEnum("owner_type").notNull(),
    ownerId: integer("owner_id").notNull(),
    fileUrl: text("file_url").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    uploadedBy: integer("uploaded_by").references(() => users.id),
    uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
    isCurrent: boolean("is_current").notNull().default(true),
    trashedAt: timestamp("trashed_at"),
  },
  (t) => [
    index("document_versions_owner_idx").on(t.ownerType, t.ownerId),
    index("document_versions_trashed_idx").on(t.trashedAt),
  ]
);

// ── M11 - Notifications ─────────────────────────────────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    recipientType: notificationRecipientTypeEnum("recipient_type").notNull(),
    applicantId: integer("applicant_id").references(() => applicants.id),
    userId: integer("user_id").references(() => users.id),
    channel: notificationChannelEnum("channel").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(), // e.g. CERTIFICATE_READY
    message: text("message").notNull(),
    requestId: integer("request_id").references(() => requests.id),
    readAt: timestamp("read_at"),
    emailSentAt: timestamp("email_sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_applicant_idx").on(t.applicantId),
    index("notifications_user_idx").on(t.userId),
    index("notifications_created_at_idx").on(t.createdAt),
  ]
);

// ── M12 - Reports & AI analysis ──────────────────────────────────────────────
export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  format: reportFormatEnum("format").notNull(),
  trigger: reportTriggerEnum("trigger").notNull(),
  fileUrl: text("file_url"),
  generatedBy: integer("generated_by").references(() => users.id), // null = system
  aiAnalysisText: text("ai_analysis_text"),
  aiAnalysisStatus: aiAnalysisStatusEnum("ai_analysis_status").notNull().default("not_applicable"),
  aiAnalysisEditedText: text("ai_analysis_edited_text"), // DN can edit before validating
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── M13 - Audit log ──────────────────────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(), // SCREAMING_SNAKE_CASE
    module: varchar("module", { length: 20 }).notNull(), // M1, M3..M13
    entityId: integer("entity_id"),
    details: jsonb("details"),
    ip: varchar("ip", { length: 45 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_user_idx").on(t.userId),
    index("audit_logs_module_idx").on(t.module),
    index("audit_logs_created_at_idx").on(t.createdAt),
  ]
);

// ── Relations (minimal, for the query builder's `with` API) ────────────────
export const usersRelations = relations(users, ({ many }) => ({
  roles: many(userRoles),
}));

export const organisationsRelations = relations(organisations, ({ many }) => ({
  applicants: many(applicants),
  requests: many(requests),
}));

export const applicantsRelations = relations(applicants, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [applicants.organisationId],
    references: [organisations.id],
  }),
  requests: many(requests),
}));

export const requestsRelations = relations(requests, ({ one, many }) => ({
  applicant: one(applicants, { fields: [requests.applicantId], references: [applicants.id] }),
  organisation: one(organisations, {
    fields: [requests.organisationId],
    references: [organisations.id],
  }),
  phases: many(phases),
  certificates: many(certificates),
}));

export const phasesRelations = relations(phases, ({ one, many }) => ({
  request: one(requests, { fields: [phases.requestId], references: [requests.id] }),
  meetings: many(meetings),
  payments: many(payments),
}));
