import { ALL_ROLES, ROLE_LABELS } from '../constants';

export function RoleSelector({
  roles,
  onToggle,
  suLocked = false,
}: {
  roles: string[];
  onToggle: (role: string) => void;
  suLocked?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_ROLES.map((role) => {
        const disabled = role === 'SU' && suLocked;
        const selected = roles.includes(role);
        return (
          <button
            type="button"
            key={role}
            disabled={disabled}
            onClick={() => onToggle(role)}
            title={disabled ? 'Réservé au Super Admin' : undefined}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? 'border-anac-blue bg-anac-blue text-white font-semibold'
                : 'border-anac-border font-normal bg-white text-anac-muted hover:bg-anac-gray'
            }`}
          >
            {ROLE_LABELS[role]}
          </button>
        );
      })}
    </div>
  );
}
