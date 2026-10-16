import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { CockpitMetrics, type CockpitMetric } from './CockpitMetrics';

/** SESSION1-COCKPIT-1 - frame shared by the role cockpits: title, metric
 *  strip, search (« / » focuses it), error banners, optional block above the
 *  two panes, the list column and the reading pane, then dialogs. */
export function CockpitPage({
  title,
  metrics,
  search,
  errors = [],
  above,
  list,
  pane,
  children,
}: {
  title: string;
  metrics: CockpitMetric[];
  search: { value: string; onChange: (value: string) => void; placeholder: string; label: string };
  errors?: Array<string | null>;
  above?: ReactNode;
  list: ReactNode;
  pane: ReactNode;
  children?: ReactNode;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
    event.preventDefault();
    searchRef.current?.focus();
  }
  return (
    <div className="-m-6 min-h-full bg-[#f8fafc] text-anac-text" onKeyDown={onKeyDown}>
      <main className="mx-auto max-w-[1600px] space-y-4 px-5 py-4">
        <header className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="mr-auto">
            <p className="text-xs font-medium text-anac-muted">Direction de la Navigabilité</p>
            <h1 className="mt-1 text-xl font-semibold leading-tight text-anac-navy">{title}</h1>
          </div>
          <CockpitMetrics items={metrics} />
          <label className="relative block w-full sm:w-[340px]">
            <span className="sr-only">{search.label}</span>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-anac-muted" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              className="h-9 w-full rounded-lg border border-anac-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-anac-blue focus:ring-2 focus:ring-anac-blue/15"
              placeholder={search.placeholder}
            />
          </label>
        </header>
        {errors.map((message, index) =>
          message ? (
            <div key={index} role="alert" className="rounded-lg border border-anac-danger/20 bg-red-50 px-4 py-3 text-sm text-anac-danger">
              {message}
            </div>
          ) : null
        )}
        {above}
        <section className="grid items-start gap-4 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
          {list}
          {pane}
        </section>
        {children}
      </main>
    </div>
  );
}
