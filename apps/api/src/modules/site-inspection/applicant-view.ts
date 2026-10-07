import type { SiteInspectionBundle, SiteVisitView } from './site-inspection.types.js';

/** What an applicant may see of the site visit: the assigned R3 agent is an
 *  internal user id, not applicant data. */
export type ApplicantSiteVisitView = Omit<SiteVisitView, 'r3AgentId'>;

export interface ApplicantSiteInspectionBundle extends Omit<SiteInspectionBundle, 'siteVisit' | 'inspection'> {
  siteVisit: ApplicantSiteVisitView | null;
  /** The "avis R3" is DN-internal (modules-feasibility.md, doc visibility rules). */
  inspection: null;
}

/** Applicant view of the M6 bundle. Site visit fields are whitelisted, so a
 *  field added to SiteVisitView later stays hidden until listed here. */
export function toApplicantSiteInspectionBundle(bundle: SiteInspectionBundle): ApplicantSiteInspectionBundle {
  const visit = bundle.siteVisit;
  return {
    phase: bundle.phase,
    payment: bundle.payment,
    siteVisit: visit
      ? { id: visit.id, scheduledAt: visit.scheduledAt, location: visit.location, status: visit.status }
      : null,
    inspection: null,
  };
}
