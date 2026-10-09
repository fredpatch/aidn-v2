import { cn } from '../../lib/utils';

/**
 * Shared bucket/filter tab strip used across cockpit list pages.
 *
 * Each page derives its own `items` array (key/label/count) from whatever
 * shape its bucket data happens to be in (an object array, a key list +
 * label map, a custom counts object, etc.) — that derivation is domain
 * logic and stays in the feature file. This component only renders the tabs.
 *
 * `size="compact"` (D1) fits a narrow list column (Demandes): equal-width
 * tabs on one line, smaller text and counters.
 */
export function BucketTabs<T extends string>({
  value,
  items,
  onChange,
  size = 'default',
}: {
  value: T;
  items: Array<{ key: T; label: string; count: number }>;
  onChange: (value: T) => void;
  size?: 'default' | 'compact';
}) {
  const compact = size === 'compact';
  return (
    <div
      className={cn(
        'flex overflow-x-auto border-b border-anac-border',
        compact ? 'gap-0.5 px-2 pt-1' : 'gap-1 px-4 pt-3'
      )}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={cn(
            'inline-flex items-center whitespace-nowrap border-b-2 font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky',
            compact
              ? 'min-h-9 flex-1 justify-center gap-1.5 px-1.5 text-xs'
              : 'min-h-10 gap-2 px-4 text-sm',
            value === item.key
              ? 'border-anac-blue text-anac-blue'
              : 'border-transparent text-anac-muted hover:text-anac-navy'
          )}
        >
          {item.label}
          <span
            className={cn(
              'rounded-full',
              compact ? 'px-1.5 text-[10px] leading-4' : 'px-2 py-0.5 text-[11px]',
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
