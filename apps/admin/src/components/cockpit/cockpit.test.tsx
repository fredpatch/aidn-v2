import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AgingBadge } from './AgingBadge';
import { QueueColumn } from './QueueColumn';
import { CockpitUploadModal } from './CockpitUploadModal';
import { useUrlSelection } from '../../lib/cockpit/useUrlSelection';

const NOW = new Date('2026-10-16T12:00:00Z');
const FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true };

describe('<AgingBadge>', () => {
  it('overdue / warning / normal, working days, future due date, and nothing without a date', () => {
    const { rerender, container } = render(<AgingBadge urgency="overdue" since="2026-10-11T12:00:00Z" now={NOW} />);
    expect(screen.getByText('En retard · J+5')).toBeInTheDocument();
    rerender(<AgingBadge urgency="warning" since="2026-10-15T12:00:00Z" now={NOW} />);
    expect(screen.getByText('Échéance proche')).toBeInTheDocument();
    rerender(<AgingBadge urgency="normal" since="2026-10-13T12:00:00Z" now={NOW} />);
    expect(screen.getByText('depuis 3 j')).toBeInTheDocument();
    rerender(<AgingBadge urgency="normal" since="2026-10-13T12:00:00Z" workingDays={2} now={NOW} />);
    expect(screen.getByText('depuis 2 j ouvrés')).toBeInTheDocument();
    rerender(<AgingBadge urgency="normal" since={null} dueAt="2026-10-19T09:00:00Z" now={NOW} />);
    expect(screen.getByText('dans 3 j')).toBeInTheDocument();
    rerender(<AgingBadge urgency="normal" since={null} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('<AgingBadge> overdue visit', () => {
  it('counts calendar days: yesterday 15:00 seen today 09:00 reads J+1, not J+0', () => {
    const now = new Date(2026, 9, 16, 9, 0, 0);
    const due = new Date(2026, 9, 15, 15, 0, 0).toISOString();
    render(<AgingBadge urgency="overdue" since={null} dueAt={due} now={now} />);
    expect(screen.getByText('En retard · J+1')).toBeInTheDocument();
  });
});

describe('<QueueColumn>', () => {
  const base = {
    tabs: [{ key: 'a' as const, label: 'A', count: 0 }],
    tab: 'a' as const,
    onTabChange: () => undefined,
    order: 'oldest' as const,
    onOrderChange: () => undefined,
    selectedId: null,
    texts: { loading: 'Chargement X', error: 'Erreur X', empty: 'Vide X', listLabel: 'Liste X', noun: ['élément', 'éléments'] as [string, string] },
    onSelect: () => undefined,
    onActivate: () => undefined,
    renderRow: (item: { id: string }) => <span>{item.id}</span>,
  };
  it('three distinct states: loading, error, empty', () => {
    const { rerender } = render(<QueueColumn {...base} groups={[]} status="loading" />);
    expect(screen.getByText('Chargement X')).toBeInTheDocument();
    rerender(<QueueColumn {...base} groups={[]} status="error" />);
    expect(screen.getByText('Erreur X')).toBeInTheDocument();
    expect(screen.queryByText('Vide X')).not.toBeInTheDocument();
    rerender(<QueueColumn {...base} groups={[]} status="ready" />);
    expect(screen.getByText('Vide X')).toBeInTheDocument();
  });
});

describe('useUrlSelection', () => {
  function Probe({ ids, ready = true }: { ids: string[]; ready?: boolean }) {
    const { selected, select } = useUrlSelection(ids.map((id) => ({ id })), ready);
    const location = useLocation();
    return (
      <div>
        <p>selected:{selected?.id ?? 'none'}</p>
        <p>search:{location.search}</p>
        <button onClick={() => select({ id: 'b' })}>pick b</button>
      </div>
    );
  }
  it('falls back to the first visible row when ?id= is missing or not visible', () => {
    const { rerender } = render(
      <MemoryRouter future={FUTURE} initialEntries={['/x?id=gone']}>
        <Routes><Route path="/x" element={<Probe ids={['a', 'b']} />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('selected:a')).toBeInTheDocument();
    fireEvent.click(screen.getByText('pick b'));
    expect(screen.getByText('selected:b')).toBeInTheDocument();
    expect(screen.getByText('search:?id=b')).toBeInTheDocument();
    rerender(
      <MemoryRouter future={FUTURE} initialEntries={['/x?id=b']}>
        <Routes><Route path="/x" element={<Probe ids={[]} />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('selected:none')).toBeInTheDocument();
  });

  it('once ready, a stale ?id= is replaced by the fallback id, or removed when no row remains; never while loading', async () => {
    const { unmount } = render(
      <MemoryRouter future={FUTURE} initialEntries={['/x?id=gone&tab=t']}>
        <Routes><Route path="/x" element={<Probe ids={['a']} />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('search:?id=a&tab=t')).toBeInTheDocument();
    unmount();
    const empty = render(
      <MemoryRouter future={FUTURE} initialEntries={['/x?id=gone&tab=t']}>
        <Routes><Route path="/x" element={<Probe ids={[]} />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('search:?tab=t')).toBeInTheDocument();
    empty.unmount();
    render(
      <MemoryRouter future={FUTURE} initialEntries={['/x?id=deep']}>
        <Routes><Route path="/x" element={<Probe ids={[]} ready={false} />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('search:?id=deep')).toBeInTheDocument(); // a deep link survives the first load
  });
});

describe('<CockpitUploadModal>', () => {
  it('submit disabled without a file; shows the busy label', () => {
    const onSubmit = vi.fn();
    const props = {
      title: 'Joindre la facture transmise', subtitle: 'DEM-1', label: 'Facture', accept: '.pdf',
      submitLabel: 'Enregistrer', busySubmitLabel: 'Enregistrement...', onFileChange: () => undefined,
      onClose: () => undefined, onSubmit,
    };
    const { rerender } = render(<CockpitUploadModal {...props} file={null} busy={false} />);
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
    rerender(<CockpitUploadModal {...props} file={new File(['x'], 'f.pdf')} busy />);
    expect(screen.getByRole('button', { name: /Enregistrement\.\.\./ })).toBeDisabled();
  });
});
