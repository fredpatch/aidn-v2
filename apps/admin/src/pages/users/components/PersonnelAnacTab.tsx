import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { SelectableTableRow } from '../../../components/common/SelectableTableRow';
import { TableState } from '../../../components/common/TableState';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Pagination } from '../../../components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { listPersonnelAnac, searchPersonnelAnac } from '../../../lib/api/personnel-anac.api';
import type { PersonnelAnacResult } from '../../../lib/api/personnel-anac.types';
import { apiErrorMessage } from '../../../lib/axios';
import { PERSONNEL_ANAC_PAGE_SIZE } from '../constants';
import { initials } from '../utils';

export function PersonnelAnacTab({
  onCreate,
  onSelect,
  selectedEmployeeCode,
  existingCodes,
}: {
  onCreate: (personnel: PersonnelAnacResult) => void;
  onSelect: (personnel: PersonnelAnacResult) => void;
  selectedEmployeeCode: string | null;
  existingCodes: string[];
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonnelAnacResult[]>([]);
  const [mode, setMode] = useState<'list' | 'search'>('list');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const existing = useMemo(() => new Set(existingCodes), [existingCodes]);
  const totalPages = Math.max(1, Math.ceil(total / PERSONNEL_ANAC_PAGE_SIZE));
  const firstItem = total === 0 ? 0 : (page - 1) * PERSONNEL_ANAC_PAGE_SIZE + 1;
  const lastItem = Math.min(page * PERSONNEL_ANAC_PAGE_SIZE, total);

  async function loadPersonnelPage(nextPage: number) {
    setLoading(true);
    setError(null);
    try {
      const data = await listPersonnelAnac(nextPage, PERSONNEL_ANAC_PAGE_SIZE);
      setResults(data.data);
      setPage(data.page);
      setTotal(data.total);
      setMode('list');
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger l'annuaire Personnel ANAC."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPersonnelPage(1);
  }, []);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (query.trim().length < 2) {
      setError('Saisissez au moins 2 caracteres.');
      return;
    }

    setLoading(true);
    try {
      setResults(await searchPersonnelAnac(query.trim()));
      setMode('search');
      setPage(1);
      setTotal(0);
    } catch (err) {
      setError(apiErrorMessage(err, 'Recherche impossible.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-3 border-b border-anac-border p-4 md:flex-row md:items-center"
      >
        <div className="relative md:min-w-0 md:flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted"
            size={16}
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom, prenom ou matricule Personnel ANAC..."
            className="pl-9"
          />
        </div>
        <Button type="submit" className="gap-1.5 md:w-auto">
          <Search size={14} />
          Rechercher
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => loadPersonnelPage(1)}
          className="md:w-auto"
        >
          Liste
        </Button>
      </form>

      {error && <p className="px-4 pt-3 text-sm text-anac-danger">{error}</p>}

      {loading ? (
        <TableState state="loading" title="Chargement du Personnel ANAC..." />
      ) : (
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>Agent ANAC</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Compte AIDN</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((personnel) => {
              const hasAccount = personnel.hasAccount || existing.has(personnel.employeeCode);
              return (
                <SelectableTableRow
                  key={personnel.employeeCode}
                  selected={selectedEmployeeCode === personnel.employeeCode}
                  onSelect={() => onSelect(personnel)}
                  ariaLabel={`Selectionner l'agent Personnel ANAC ${
                    personnel.fullName || personnel.employeeCode
                  }`}
                >
                  <TableCell>
                    <div className="flex items-center gap-3 text-left">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-anac-blue/10 text-xs font-semibold text-anac-blue">
                        {initials(personnel.fullName)}
                      </span>
                      <span>
                        <span className="block font-semibold text-anac-navy">
                          {personnel.fullName || 'Nom non renseigne'}
                        </span>
                        <span className="text-xs text-anac-muted">Matricule {personnel.employeeCode}</span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-anac-muted">
                    {personnel.organisationLabel ?? 'Non renseigne'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        hasAccount ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {hasAccount ? 'Compte cree' : 'A activer'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant={hasAccount ? 'ghost' : 'default'}
                      size="sm"
                      disabled={hasAccount}
                      onClick={() => onCreate(personnel)}
                    >
                      {hasAccount ? 'Deja actif' : 'Activer'}
                    </Button>
                  </TableCell>
                </SelectableTableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {mode === 'list' && (
        <Pagination
          label={total === 0 ? 'Aucun agent' : `${firstItem}-${lastItem} sur ${total} agents Personnel ANAC`}
          page={page}
          totalPages={totalPages}
          onPageChange={loadPersonnelPage}
        />
      )}
      {mode === 'search' && (
        <div className="border-t border-anac-border px-4 py-3 text-xs text-anac-muted">
          {results.length} resultat{results.length > 1 ? 's' : ''} de recherche
        </div>
      )}
    </>
  );
}
