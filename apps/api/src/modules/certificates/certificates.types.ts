export interface PaymentView {
  id: number;
  status: string;
  invoiceFileUrl: string | null;
  invoiceUploadedAt: Date | null;
  proofFileUrl: string | null;
  proofUploadedAt: Date | null;
  validatedAt: Date | null;
  rejectionReason: string | null;
  rejectionAction: string | null;
}

export interface ScopeCategory {
  qualification: string;
  qualificationEn: string;
  limitations: string;
}

export interface ScopeDetails {
  aeronefs: ScopeCategory;
  moteurs: ScopeCategory;
  composants: ScopeCategory;
  specialisee: ScopeCategory;
}

export const EMPTY_SCOPE_CATEGORY: ScopeCategory = {
  qualification: '',
  qualificationEn: '',
  limitations: '',
};

export const EMPTY_SCOPE_DETAILS: ScopeDetails = {
  aeronefs: { ...EMPTY_SCOPE_CATEGORY },
  moteurs: { ...EMPTY_SCOPE_CATEGORY },
  composants: { ...EMPTY_SCOPE_CATEGORY },
  specialisee: { ...EMPTY_SCOPE_CATEGORY },
};

export interface CertificateView {
  id: number;
  reference: string;
  certificateType: 'agreement' | 'recognition';
  typeOverriddenBy: number | null;
  status: string;
  createdAt: Date;
  printedAt: Date | null;
  signedAt: Date | null;
  archivedAt: Date | null;
  notifiedAt: Date | null;
  collectedAt: Date | null;
  approvalReferenceNumber: string | null;
  expiresAt: Date | null;
  initialIssueDate: Date | null;
  currentIssueDate: Date | null;
  dgFullNameOverride: string | null;
  scopeDetails: ScopeDetails | null;
  // time-to-deliver / time-to-collect KPIs, computed, not stored
  daysToDeliver: number | null; // createdAt -> notifiedAt
  daysToCollect: number | null; // notifiedAt -> collectedAt
}

export interface CertificateBundle {
  phase: {
    id: number;
    status: string;
    openedAt: Date;
    closedAt: Date | null;
  } | null;
  payment: PaymentView | null;
  certificate: CertificateView | null;
}

/** Data shape the HTML template's renderCertificate(data) expects - the full
 *  22-field contract locked with Fred. Keep in sync with the {tag} names in
 *  apps/api/src/templates/certificates/*.html. */
export interface CertificateTemplateData {
  deliveranceAuthorityCertificate: string;
  approvalReferenceNumber: string;
  organisationName: string;
  legalAddress: string;
  phone: string;
  email: string;
  expiresAt: string;
  initialIssueDate: string;
  currentIssueDate: string;
  dgFullName: string;
  qualificationAeronefs: string;
  qualificationAeronefsEn: string;
  limitationsAeronefs: string;
  qualificationMoteurs: string;
  qualificationMoteursEn: string;
  limitationsMoteurs: string;
  qualificationComposants: string;
  qualificationComposantsEn: string;
  limitationsComposants: string;
  qualificationSpecialisee: string;
  qualificationSpecialiseeEn: string;
  limitationsSpecialisee: string;
}
