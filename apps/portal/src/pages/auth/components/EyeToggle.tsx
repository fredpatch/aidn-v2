import { Eye, EyeOff } from "lucide-react";

export function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute inset-y-0 right-0 flex items-center px-3 text-anac-muted hover:text-anac-text transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky rounded-r"
      aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
    >
      {show ? <EyeOff size={14} /> : <Eye size={14} />}
    </button>
  );
}
