import { Download, Eye, MoreVertical } from 'lucide-react';
import { SelectableTableRow } from '../../../components/common/SelectableTableRow';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { TableState } from '../../../components/common/TableState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { CONTACT_ORDER_SHORT, STATUS_STYLES } from '../accountRequestLabels';
import { formatDateTime } from '../accountRequestFormatters';
import type { AccountRequestView, ApplicantAccountView } from '../types';

export function PendingRequestsTable({
  requests,
  selectedId,
  onSelect,
}: {
  requests: AccountRequestView[];
  selectedId: number | null;
  onSelect: (request: AccountRequestView) => void;
}) {
  if (requests.length === 0) {
    return (
      <TableState
        state="empty"
        title="Aucune demande en attente"
        description="Les demandes envoyees depuis le portail apparaitront ici."
        className="min-h-[220px]"
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-anac-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-anac-navy">
            {requests.length} demande(s) en attente
          </h2>
          <p className="text-xs text-anac-muted">
            Selectionnez une demande pour verifier l'organisme.
          </p>
        </div>
      </div>
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow>
            <TableHead>Organisation</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Soumise le</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <SelectableTableRow
              key={request.id}
              selected={selectedId === request.id}
              onSelect={() => onSelect(request)}
              ariaLabel={`Selectionner la demande de compte ${request.organisationNameInput}`}
            >
              <TableCell>
                <p className="font-semibold text-anac-navy">{request.organisationNameInput}</p>
                <p className="text-xs text-anac-muted">
                  {request.originalApprovalNumber ?? 'Agrement non renseigne'}
                </p>
              </TableCell>
              <TableCell>{request.contactFullName}</TableCell>
              <TableCell className="text-anac-muted">{request.contactEmail}</TableCell>
              <TableCell>{formatDateTime(request.submittedAt)}</TableCell>
              <TableCell>
                <StatusBadge label="En attente" tone={STATUS_STYLES.pending} />
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  onClick={() => onSelect(request)}
                  className="rounded-md border border-anac-border p-1.5 text-anac-blue"
                >
                  <Eye size={14} aria-hidden="true" />
                  <span className="sr-only">Voir la demande</span>
                </button>
              </TableCell>
            </SelectableTableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

export function ApplicantAccountsTable({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: ApplicantAccountView[];
  selectedId: number | null;
  onSelect: (account: ApplicantAccountView) => void;
}) {
  if (accounts.length === 0) {
    return (
      <TableState
        state="empty"
        title="Aucun compte approuve"
        description="Les comptes approuves apparaitront ici apres validation."
        className="min-h-[220px]"
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-anac-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-anac-navy">
            {accounts.length} compte(s) approuve(s)
          </h2>
          <p className="text-xs text-anac-muted">
            Selectionnez un compte pour consulter son profil.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md border border-anac-border px-3 py-1.5 text-xs font-semibold text-anac-navy">
          <Download size={14} aria-hidden="true" />
          Exporter
        </button>
      </div>
      <Table className="min-w-[940px]">
        <TableHeader>
          <TableRow>
            <TableHead>Organisation</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Profil</TableHead>
            <TableHead>Date d&apos;approbation</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <SelectableTableRow
              key={account.id}
              selected={selectedId === account.id}
              onSelect={() => onSelect(account)}
              ariaLabel={`Selectionner le compte postulant ${account.fullName} de ${account.organisationName}`}
            >
              <TableCell>
                <p className="font-semibold text-anac-navy">{account.organisationName}</p>
                <p className="text-xs text-anac-muted">Organisation #{account.organisationId}</p>
              </TableCell>
              <TableCell>
                <p>{account.fullName}</p>
                {account.phone ? <p className="text-xs text-anac-muted">{account.phone}</p> : null}
              </TableCell>
              <TableCell className="text-anac-muted">{account.email}</TableCell>
              <TableCell>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-anac-muted">
                  {CONTACT_ORDER_SHORT[account.contactOrder] ?? account.contactOrder}
                </span>
              </TableCell>
              <TableCell>{formatDateTime(account.createdAt)}</TableCell>
              <TableCell>
                <StatusBadge
                  label={account.active ? 'Actif' : 'Suspension'}
                  tone={STATUS_STYLES[account.active ? 'active' : 'suspended']}
                />
              </TableCell>
              <TableCell>
                <MoreVertical size={14} className="text-anac-muted" aria-hidden="true" />
              </TableCell>
            </SelectableTableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
