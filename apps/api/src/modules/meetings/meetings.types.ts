export interface ScheduleMeetingParams {
  phaseId: number;
  meetingType: 'preliminary' | 'formal' | 'site_visit';
  dnAgentId: number;
  scheduledAt: string; // ISO
  location?: string;
}

export interface MeetingView {
  id: number;
  phaseId: number;
  meetingType: string;
  dnAgentId: number;
  scheduledAt: Date;
  location: string | null;
  status: string;
  crDocumentUrl: string | null;
  crUploadedAt: Date | null;
  createdAt: Date;
}
