import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../../shared/db/index.js";
import { requests } from "../../shared/db/schema.js";

/** First 4 alphanumeric characters of the organisation's normalized name,
 *  uppercased, padded with 'X' if shorter. Human-recognizable, deterministic. */
function organisationCode(normalizedName: string): string {
  const alnum = normalizedName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return alnum.slice(0, 4).padEnd(4, "X");
}

/** Reference format: DEM-YYYY-MM-DD-ORGCODE-NN.
 *  No global incrementing counter (deliberately avoided - a per-day,
 *  per-organisation counter is simpler and never needs a reset policy).
 *  NN disambiguates the rare case of the same organisation submitting more
 *  than one request on the same calendar day (e.g. an earlier one was
 *  rejected, releasing the "one active request" rule the same day). */
export async function generateRequestReference(
  organisationId: number,
  organisationNormalizedName: string
): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(requests)
    .where(
      and(
        eq(requests.organisationId, organisationId),
        gte(requests.createdAt, dayStart),
        lt(requests.createdAt, dayEnd)
      )
    );

  const sequence = String((total ?? 0) + 1).padStart(2, "0");
  const orgCode = organisationCode(organisationNormalizedName);

  return `DEM-${year}-${month}-${day}-${orgCode}-${sequence}`;
}
