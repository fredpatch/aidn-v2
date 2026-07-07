import { cn } from "../../../lib/utils";

export function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-2 text-[11px] font-medium transition-colors cursor-pointer",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-anac-sky",
        active
          ? "bg-anac-navy text-white"
          : "bg-white text-anac-muted hover:bg-anac-gray hover:text-anac-text"
      )}
    >
      {label}
    </button>
  );
}
