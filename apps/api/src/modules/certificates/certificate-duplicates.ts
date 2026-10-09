/** K8b - read-only check run before migration 0004 (unique index
 *  certificates_request_id_idx): lists every request holding more than one
 *  certificate. The index cannot be created while such rows exist, and which
 *  certificate to keep is a business decision - this never writes. */

export interface CertificateDuplicate {
  request_id: number;
  request_reference: string;
  certificate_count: number;
  certificate_ids: number[];
  certificate_references: string[];
  certificate_statuses: string[];
  created_at: Date[];
}

export const CERTIFICATE_DUPLICATES_QUERY = `
  SELECT c.request_id,
         r.reference AS request_reference,
         count(*)::int AS certificate_count,
         array_agg(c.id ORDER BY c.id) AS certificate_ids,
         array_agg(c.reference ORDER BY c.id) AS certificate_references,
         array_agg(c.status::text ORDER BY c.id) AS certificate_statuses,
         array_agg(c.created_at ORDER BY c.id) AS created_at
  FROM certificates c
  JOIN requests r ON r.id = c.request_id
  GROUP BY c.request_id, r.reference
  HAVING count(*) > 1
  ORDER BY c.request_id`;

export async function findCertificateDuplicates(client: {
  query: (sql: string) => Promise<{ rows: unknown[] }>;
}): Promise<CertificateDuplicate[]> {
  const { rows } = await client.query(CERTIFICATE_DUPLICATES_QUERY);
  return rows as CertificateDuplicate[];
}
