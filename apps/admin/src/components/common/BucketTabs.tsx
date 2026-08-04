import { cn } from '../../lib/utils';

/**
 * Shared bucket/filter tab strip used across cockpit list pages.
 *
 * Each page derives its own `items` array (key/label/count) from whatever
 * shape its bucket data happens to be in (an object array, a key list +
 * label map, a custom counts object, etc.) — that derivation is domain
 * logic and stays in the feature file. This component only renders the tabs.
 */
export function BucketTabs<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: Array<{ key: T; label: string; count: number }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-anac-border px-4 pt-3">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky',
            value === item.key
              ? 'border-anac-blue text-anac-blue'
              : 'border-transparent text-anac-muted hover:text-anac-navy'
          )}
        >
          {item.label}
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px]',
              value === item.key ? 'bg-anac-blue text-white' : 'bg-anac-gray text-anac-muted'
            )}
          >
            {item.count}
          </span>
        </button>
      ))}
    </div>
  );
}
