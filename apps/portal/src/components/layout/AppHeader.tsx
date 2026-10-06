import { Link, NavLink } from 'react-router-dom';
import { LogOut, Plane } from 'lucide-react';
import { Button } from '../ui/button';

const NAV_ITEMS = [
  { to: '/', label: 'Tableau de bord', end: true },
  { to: '/dossiers', label: 'Mes dossiers', end: false },
  { to: '/compte', label: 'Mon compte', end: false },
];

/** Persistent header: brand (back to dashboard), main navigation, session. */
export function AppHeader({ fullName, onLogout }: { fullName: string; onLogout: () => void }) {
  const nav = (
    <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `whitespace-nowrap rounded px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky ${
              isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <header className="bg-anac-navy text-white">
      <div className="flex h-[57px] items-center gap-6 px-6">
        <Link
          to="/"
          aria-label="AIDN - retour au tableau de bord"
          className="flex items-center gap-2.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-anac-sky"
        >
          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
            <Plane size={15} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">AIDN</p>
            <p className="text-anac-sky text-[10px] leading-tight">Portail Postulant</p>
          </div>
        </Link>
        <div className="hidden md:block">{nav}</div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm sm:inline">{fullName}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="h-8 px-2.5 gap-1.5 text-white/70 hover:text-white hover:bg-white/10"
          >
            <LogOut size={13} aria-hidden="true" />
            <span className="text-[11px]">Déconnexion</span>
          </Button>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-1.5 md:hidden">{nav}</div>
    </header>
  );
}
