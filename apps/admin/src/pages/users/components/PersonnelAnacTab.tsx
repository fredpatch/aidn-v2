import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { listPersonnelAnac, searchPersonnelAnac } from '../../../lib/api/personnel-anac.api';
import type { PersonnelAnacResult } from '../../../lib/api/personnel-anac.types';
import { apiErrorMessage } from '../../../lib/axios';
import { PERSONNEL_ANAC_PAGE_SIZE } from '../constants';
import { initials } from '../utils';
import { PaginationFooter } from './PaginationFooter';

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
        <div className="p-8 text-center text-sm text-anac-muted">
          Chargement du Personnel ANAC...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-anac-border bg-anac-gray/50 text-left text-xs uppercase tracking-wide text-anac-muted">
                <th className="px-4 py-3 font-medium">Agent ANAC</th>
                <th className="px-4 py-3 font-medium">Organisation</th>
                <th className="px-4 py-3 font-medium">Compte AIDN</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {results.map((personnel) => {
                const hasAccount = personnel.hasAccount || existing.has(personnel.employeeCode);
                return (
                  <tr
                    key={personnel.employeeCode}
                    className={`border-b border-anac-border last:border-0 ${
                      selectedEmployeeCode === personnel.employeeCode
                        ? 'bg-anac-blue/5'
                        : 'hover:bg-anac-gray/40'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelect(personnel)}
                        className="flex items-center gap-3 text-left"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-anac-blue/10 text-xs font-semibold text-anac-blue">
                          {initials(personnel.fullName)}
                        </span>
                        <span>
                          <span className="block font-semibold text-anac-navy">
                            {personnel.fullName || 'Nom non renseigne'}
                          </span>
                          <span className="text-xs text-anac-muted">
                            Matricule {personnel.employeeCode}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-anac-muted">
                      {personnel.organisationLabel ?? 'Non renseigne'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          hasAccount
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {hasAccount ? 'Compte cree' : 'A activer'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant={hasAccount ? 'ghost' : 'default'}
                        size="sm"
                        disabled={hasAccount}
                        onClick={() => onCreate(personnel)}
                      >
                        {hasAccount ? 'Deja actif' : 'Activer'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mode === 'list' && (
        <PaginationFooter
          label={
            total === 0
              ? 'Aucun agent'
              : `${firstItem}-${lastItem} sur ${total} agents Personnel ANAC`
          }
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
