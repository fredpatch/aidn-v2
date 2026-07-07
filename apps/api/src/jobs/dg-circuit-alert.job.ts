import cron from "node-cron";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "../shared/db/index.js";
import { dgCircuitDocuments, requests, userRoles, notifications } from "../shared/db/schema.js";
import { getIntegerValue } from "../modules/system-parameters/system-parameters.service.js";
import { logAudit } from "../modules/auth/auth.service.js";

/** Pattern "Circuit DG" - alerts DN + reception/assistant_dg when a document
 *  has sat in "signed" (awaiting hand-off to DN) longer than the configured
 *  threshold (default 3 business days). Writes to the notifications table
 *  only for now - actual email sending is wired in Sprint 10 (Notifications
 *  module), per the decision to lay out the skeleton first. */
export async function runDgCircuitAlertCheck(): Promise<void> {
  const thresholdDays = await getIntegerValue("dg_circuit_alert_days", 3);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);

  const stuckDocs = await db
    .select()
    .from(dgCircuitDocuments)
    .where(
      and(
        eq(dgCircuitDocuments.status, "signed"),
        lt(dgCircuitDocuments.signedAt, cutoff),
        isNull(dgCircuitDocuments.blockedAlertSentAt)
      )
    );

  if (stuckDocs.length === 0) return;

  // Recipients: every internal user holding dn_agent, dn_supervisor,
  // reception, or assistant_dg - matches the M1 decision that both DN and
  // reception/assistant_dg get the alert simultaneously.
  const recipientRoles = ["dn_agent", "dn_supervisor", "reception", "assistant_dg"];
  const recipientRows = await db.select().from(userRoles);
  const recipientUserIds = [
    ...new Set(recipientRows.filter((r) => recipientRoles.includes(r.role)).map((r) => r.userId)),
  ];

  for (const doc of stuckDocs) {
    const [request] = await db.select().from(requests).where(eq(requests.id, doc.requestId));
    if (!request) continue;

    for (const userId of recipientUserIds) {
      await db.insert(notifications).values({
        recipientType: "internal",
        userId,
        channel: "in_app",
        eventType: "DG_CIRCUIT_STUCK",
        message: `La demande ${request.reference} est en attente de signature DG depuis plus de ${thresholdDays} jour(s).`,
        requestId: request.id,
      });
    }

    await db
      .update(dgCircuitDocuments)
      .set({ blockedAlertSentAt: new Date() })
      .where(eq(dgCircuitDocuments.id, doc.id));

    await logAudit({
      action: "DG_CIRCUIT_ALERT_SENT",
      module: "M1",
      entityId: request.id,
      details: { reference: request.reference, thresholdDays },
    });
  }
}

/** Runs once per day at 07:00 - adjust schedule once real usage patterns
 *  are known. Not started automatically in tests; call startDgCircuitAlertJob()
 *  explicitly from server.ts. */
export function startDgCircuitAlertJob(): void {
  cron.schedule("0 7 * * *", () => {
    runDgCircuitAlertCheck().catch((error) => {
      console.error("[jobs/dg-circuit-alert] Failed:", error);
    });
  });
}
