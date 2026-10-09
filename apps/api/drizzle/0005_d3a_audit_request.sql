ALTER TABLE "audit_logs" ADD COLUMN "request_id" integer;--> statement-breakpoint
CREATE INDEX "audit_logs_request_created_idx" ON "audit_logs" USING btree ("request_id","created_at");
--> statement-breakpoint
-- D3a backfill: link past dossier events to their request, with the same
-- action -> entity lists as src/modules/auth/audit-request.ts (kept in sync by
-- audit-request.test.ts). Unlinkable rows stay NULL. Re-runnable: only NULL
-- rows are touched, and only ids of existing requests are written.
UPDATE audit_logs a SET request_id = (a.details->>'requestId')::int
FROM requests r
WHERE a.request_id IS NULL
  AND jsonb_typeof(a.details->'requestId') = 'number'
  AND r.id = (a.details->>'requestId')::int;
--> statement-breakpoint
UPDATE audit_logs a SET request_id = a.entity_id
FROM requests r
WHERE a.request_id IS NULL AND r.id = a.entity_id
  AND a.action IN ('DG_CIRCUIT_ALERT_SENT', 'DG_CIRCUIT_DOCUMENT_REPLACED', 'DG_CIRCUIT_PENDING_REVIEW', 'DG_CIRCUIT_SENT_TO_SIGNATURE', 'DG_CIRCUIT_SIGNED', 'DG_CIRCUIT_SIGNED_RETURNED', 'REQUEST_CANCELLED', 'REQUEST_COMPLETED', 'REQUEST_SUBMITTED');
--> statement-breakpoint
UPDATE audit_logs a SET request_id = x.request_id
FROM phases x WHERE x.id = a.entity_id
  AND a.request_id IS NULL
  AND a.action IN ('PHASE_CLOSED', 'PHASE_OPENED');
--> statement-breakpoint
UPDATE audit_logs a SET request_id = x.request_id
FROM dg_circuit_documents x WHERE x.id = a.entity_id
  AND a.request_id IS NULL
  AND a.action IN ('COURRIER_SENT_TO_SIGNATURE', 'COURRIER_SIGNED_RETURNED', 'FORMAL_LETTER_SIGNED', 'FORMAL_LETTER_SUBMITTED', 'FORMAL_LETTER_TRANSMITTED', 'PRELIMINARY_DECLARATION_CIRCUIT_CREATED');
--> statement-breakpoint
UPDATE audit_logs a SET request_id = x.request_id
FROM certificates x WHERE x.id = a.entity_id
  AND a.request_id IS NULL
  AND a.action IN ('CERTIFICATE_CREATED', 'CERTIFICATE_DOCUMENT_GENERATED', 'CERTIFICATE_FIELDS_UPDATED', 'CERTIFICATE_SIGNED_RETURN_REGISTERED', 'CERTIFICATE_STATUS_CHANGED', 'CERTIFICATE_TYPE_OVERRIDDEN');
--> statement-breakpoint
UPDATE audit_logs a SET request_id = p.request_id
FROM payments x JOIN phases p ON p.id = x.phase_id
WHERE x.id = a.entity_id
  AND a.request_id IS NULL
  AND a.action IN ('INVOICE_UPLOADED', 'PAYMENT_PROOF_UPLOADED', 'PAYMENT_REJECTED', 'PAYMENT_VALIDATED');
--> statement-breakpoint
UPDATE audit_logs a SET request_id = p.request_id
FROM meetings x JOIN phases p ON p.id = x.phase_id
WHERE x.id = a.entity_id
  AND a.request_id IS NULL
  AND (a.action IN ('MEETING_REPORT_ATTACHED', 'MEETING_RESCHEDULED', 'MEETING_SCHEDULED', 'SITE_VISIT_HELD') OR a.action LIKE 'MEETING\_%');
--> statement-breakpoint
UPDATE audit_logs a SET request_id = p.request_id
FROM site_inspections x JOIN phases p ON p.id = x.phase_id
WHERE x.id = a.entity_id
  AND a.request_id IS NULL
  AND a.action IN ('INSPECTION_VERDICT_SUBMITTED');
--> statement-breakpoint
UPDATE audit_logs a SET request_id = p.request_id
FROM formal_request_documents x JOIN phases p ON p.id = x.phase_id
WHERE x.id = a.entity_id
  AND a.request_id IS NULL
  AND a.action IN ('FORMAL_DOCUMENT_SUBMITTED');
--> statement-breakpoint
UPDATE audit_logs a SET request_id = p.request_id
FROM preliminary_evaluation_forms x JOIN phases p ON p.id = x.phase_id
WHERE x.id = a.entity_id
  AND a.request_id IS NULL
  AND a.action IN ('PRELIMINARY_EVALUATION_MADE_AVAILABLE', 'PRELIMINARY_EVALUATION_SUBMITTED');
--> statement-breakpoint
UPDATE audit_logs a SET request_id = p.request_id
FROM document_evaluations e
  JOIN formal_request_documents x ON x.id = e.formal_request_document_id
  JOIN phases p ON p.id = x.phase_id
WHERE e.id = a.entity_id
  AND a.request_id IS NULL
  AND a.action IN ('DOCUMENT_RESUBMITTED', 'DOCUMENT_VERDICT_SET');
