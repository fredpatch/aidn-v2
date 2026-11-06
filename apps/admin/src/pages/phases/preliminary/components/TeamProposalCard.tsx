import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Modal } from '../../../../components/ui/modal';
import { useAuth } from '../../../../hooks/useAuth';
import { apiErrorMessage } from '../../../../lib/axios';
import {
  fetchDossierTeam,
  fetchEligibleTeamMembers,
  saveTeamProposal,
  type DossierTeamState,
  type TeamProposal,
} from '../../../../lib/api/dossier-teams.api';
import { queryKeys } from '../../../../lib/react-query/queryKeys';

export default function TeamProposalCard({
  requestId,
  dossierClosed,
}: {
  requestId: string;
  dossierClosed: boolean;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const query = useQuery({
    queryKey: queryKeys.dossierTeams.byRequest(requestId),
    queryFn: () => fetchDossierTeam(requestId),
  });
  const canEdit = !dossierClosed && !!user?.roles.some((r) => r === 'dn_supervisor' || r === 'SU');
  const proposal = query.data?.proposal;
  return (
    <section className="card space-y-3" aria-label="Équipe proposée pour le dossier">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-anac-navy">Équipe proposée pour le dossier</h2>
        {canEdit && query.isSuccess && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Modifier la proposition
          </Button>
        )}
      </div>
      {query.isLoading ? (
        <p className="text-sm text-anac-muted">Chargement de la proposition…</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-anac-danger">
          {apiErrorMessage(query.error, 'Impossible de charger la proposition d’équipe.')}
        </p>
      ) : proposal ? (
        <>
          <p className="text-sm text-anac-muted">Proposition enregistrée</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-anac-muted">Membres proposés</dt>
              <dd>
                <ul>
                  {proposal.members.map((m) => (
                    <li key={m.id}>
                      <span>{m.fullName}</span>{' '}
                      <span className="text-anac-muted">({m.employeeCode})</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="text-anac-muted">Numéro d’agrément proposé</dt>
              <dd className="break-words font-medium">{proposal.proposedApprovalNumber}</dd>
            </div>
            <div>
              <dt className="text-anac-muted">Dernière mise à jour</dt>
              <dd>{new Date(proposal.updatedAt).toLocaleString('fr-FR')}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-sm text-anac-muted">Aucune proposition d’équipe enregistrée.</p>
      )}
      <p className="text-xs text-anac-muted">
        La proposition devra être validée dans la suite du circuit avant affectation définitive.
      </p>
      {editing && canEdit && (
        <ProposalEditor
          requestId={requestId}
          proposal={proposal ?? null}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}

function ProposalEditor({
  requestId,
  proposal,
  onClose,
}: {
  requestId: string;
  proposal: TeamProposal | null;
  onClose: () => void;
}) {
  const formId = useId();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(proposal?.members.map((m) => m.id) ?? []);
  const [number, setNumber] = useState(proposal?.proposedApprovalNumber ?? '');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const eligible = useQuery({
    queryKey: queryKeys.dossierTeams.eligibleMembers(),
    queryFn: fetchEligibleTeamMembers,
  });
  const mutation = useMutation({
    mutationFn: () =>
      saveTeamProposal(requestId, { memberIds: selected, proposedApprovalNumber: number.trim() }),
    onSuccess: async (state: DossierTeamState) => {
      queryClient.setQueryData(queryKeys.dossierTeams.byRequest(requestId), state);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dossierTeams.byRequest(requestId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.requests.all }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'Impossible d’enregistrer la proposition.')),
  });
  const members = [
    ...(eligible.data ?? []),
    ...(proposal?.members ?? []).filter((m) => !eligible.data?.some((e) => e.id === m.id)),
  ];
  const visible = members.filter((m) =>
    `${m.fullName} ${m.employeeCode}`
      .toLocaleLowerCase('fr')
      .includes(search.trim().toLocaleLowerCase('fr'))
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!selected.length || !number.trim() || number.trim().length > 100) {
      setError(
        'Sélectionnez au moins un membre et renseignez un numéro proposé de 1 à 100 caractères.'
      );
      return;
    }
    mutation.mutate();
  }
  return (
    <Modal
      title="Modifier la proposition"
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={mutation.isPending || !eligible.isSuccess}>
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="mt-4 space-y-4">
        {error && (
          <p role="alert" className="text-sm text-anac-danger">
            {error}
          </p>
        )}
        <label className="block space-y-1 text-sm">
          <span>Rechercher un membre DN</span>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom ou matricule"
          />
        </label>
        <fieldset disabled={mutation.isPending} className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Membres proposés ({selected.length})</legend>
          {eligible.isLoading && <p className="text-sm text-anac-muted">Chargement des membres…</p>}
          {eligible.isError && (
            <p role="alert" className="text-sm text-anac-danger">
              Impossible de charger les membres DN.
            </p>
          )}
          <div className="max-h-52 space-y-2 overflow-y-auto">
            {visible.map((m) => {
              const isEligible = !!eligible.data?.some((e) => e.id === m.id);
              return (
                <label key={m.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(m.id)}
                    disabled={!isEligible && !selected.includes(m.id)}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked ? [...ids, m.id] : ids.filter((id) => id !== m.id)
                      )
                    }
                  />
                  <span>
                    {m.fullName} ({m.employeeCode}){!isEligible && ' - non éligible, à retirer'}
                  </span>
                </label>
              );
            })}
            {eligible.isSuccess && !visible.length && (
              <p className="text-sm text-anac-muted">Aucun membre DN trouvé.</p>
            )}
          </div>
        </fieldset>
        <label className="block space-y-1 text-sm">
          <span>Numéro d’agrément proposé</span>
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            maxLength={100}
            disabled={mutation.isPending}
          />
        </label>
      </form>
    </Modal>
  );
}
