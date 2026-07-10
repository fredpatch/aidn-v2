export interface SubmitRequestParams {
  applicantId: number;
  requestType: "recognition" | "issuance" | "modification" | "renewal";
  message?: string;
  fileUrl: string;
  mimeType: string;
  uploadAssetId?: number;
  submittedByUserId?: number; // set when reception/assistant_dg enters it manually
}

export interface RequestView {
  id: number;
  reference: string;
  applicantId: number;
  organisationId: number;
  requestType: string;
  message: string | null;
  status: string;
  rejectionReason: string | null;
  circuitStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}
