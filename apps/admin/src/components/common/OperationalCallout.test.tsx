import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { NextActionOwner, OperationalState } from '@aidn/shared';
import { OperationalCallout, type OperationalCalloutProps } from './OperationalCallout';

const reception: NextActionOwner = { kind: 'staff', label: 'Réception', roles: ['reception'] };
const cta = <button type="button">Agir</button>;
const secondary = <a href="/x">Consulter la phase</a>;

function renderCallout(state: OperationalState, over: Partial<OperationalCalloutProps> = {}) {
  return render(
    <OperationalCallout state={state} title="Titre" description="Desc" owner={reception} canAct cta={cta} {...over} />
  );
}

describe('OperationalCallout', () => {
  it.each([
    ['action_required', 'Action requise'],
    ['information', 'Information'],
    ['done', 'Terminé'],
    ['blocked', 'Bloqué'],
  ] as const)('%s shows eyebrow %s, status role and owner line', (state, eyebrow) => {
    renderCallout(state);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(eyebrow)).toBeInTheDocument();
    expect(screen.getByText('Titre')).toBeInTheDocument();
    expect(screen.getByText(/Responsable :/)).toHaveTextContent('Responsable : Réception');
  });

  it('action_required + canAct renders the CTA inside the callout', () => {
    renderCallout('action_required');
    expect(screen.getByRole('status')).toContainElement(screen.getByRole('button', { name: 'Agir' }));
  });

  it('action_required + !canAct shows whose turn it is, no CTA, no button', () => {
    renderCallout('action_required', { canAct: false, secondary });
    expect(screen.getByText('En attente de : Réception')).toBeInTheDocument();
    expect(screen.getByText('Aucune action de votre part : Réception doit agir.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Consulter la phase' })).toBeInTheDocument();
  });

  it('waiting shows « En attente de » for the owner', () => {
    renderCallout('waiting', { canAct: false });
    expect(screen.getByText('En attente de : Réception')).toBeInTheDocument();
    expect(screen.queryByText(/Aucune action de votre part/)).toBeNull();
  });

  it('secondary is rendered when canAct too', () => {
    renderCallout('action_required', { secondary });
    expect(screen.getByRole('link', { name: 'Consulter la phase' })).toBeInTheDocument();
  });

  it('blocked shows the block reason', () => {
    renderCallout('blocked', { blockReason: 'Paiement manquant' });
    expect(screen.getByText('Paiement manquant')).toBeInTheDocument();
    expect(screen.getByText('Paiement manquant')).toHaveClass('text-anac-danger');
  });

  it.each(['action_required', 'waiting', 'information'] as const)(
    '%s shows the block reason in warning style (final review I1)',
    (state) => {
      renderCallout(state, { blockReason: 'Paiement manquant' });
      expect(screen.getByText('Paiement manquant')).toHaveClass('text-anac-warning');
    }
  );

  it('done hides the block reason', () => {
    renderCallout('done', { blockReason: 'Paiement manquant' });
    expect(screen.queryByText('Paiement manquant')).toBeNull();
  });

  it('waiting shows « En attente de » even when the viewer may act (SU, spec §7.1)', () => {
    const assistantDg: NextActionOwner = {
      kind: 'staff',
      label: 'Assistant DG',
      roles: ['assistant_dg', 'reception', 'SU'],
    };
    renderCallout('waiting', { owner: assistantDg, canAct: true });
    expect(screen.getByText('En attente de : Assistant DG')).toBeInTheDocument();
    expect(screen.queryByText(/Aucune action de votre part/)).toBeNull();
  });
});
