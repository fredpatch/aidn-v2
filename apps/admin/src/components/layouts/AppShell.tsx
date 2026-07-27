import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Inbox,
  Users,
  FileText,
  Settings2,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Loader2,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { useAuth } from '../../hooks/useAuth';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Demandes', icon: Inbox },
  {
    to: '/mes-inspections',
    label: 'Mes Inspections',
    icon: ClipboardList,
    roles: ['r3_agent', 'SU'],
  },
  {
    to: '/modeles-documents',
    label: 'Modeles de documents',
    icon: FileText,
    roles: ['dn_agent', 'dn_supervisor', 'SU'],
  },
  { to: '/utilisateurs', label: 'Gestion des utilisateurs', icon: Users, roles: ['SU'] },
  { to: '/parametres', label: 'Parametres', icon: Settings2, roles: ['SU'] },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    return item.roles.some((r) => user?.roles.includes(r));
  });

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      navigate('/');
    }
  }

  const initials = (user?.fullName ?? '')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen bg-anac-gray overflow-hidden">
      <motion.aside
        animate={{ width: sidebarOpen ? 226 : 60 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="flex flex-col bg-anac-navy overflow-hidden flex-shrink-0"
      >
        <div className="flex items-center gap-3 px-3 py-4 border-b border-white/10 h-[57px] overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={16} className="text-white" strokeWidth={1.75} />
          </div>
          <div
            className={cn(
              'overflow-hidden whitespace-nowrap transition-opacity duration-200',
              sidebarOpen ? 'opacity-100' : 'opacity-0'
            )}
          >
            <p className="text-white font-bold text-sm leading-tight">AIDN</p>
            <p className="text-anac-sky text-[10px] leading-tight">ANAC Gabon</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                title={!sidebarOpen ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 px-3.5 py-[7px] rounded-md transition-colors overflow-hidden',
                    isActive
                      ? 'bg-anac-blue text-white'
                      : 'text-white/60 hover:bg-white/10 hover:text-white'
                  )
                }
              >
                <Icon size={15} className="flex-shrink-0" strokeWidth={1.75} />
                <span
                  className={cn(
                    'text-[12px] font-medium truncate whitespace-nowrap transition-opacity duration-150',
                    sidebarOpen ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center justify-center h-10 border-t border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label={sidebarOpen ? 'Reduire la barre laterale' : 'Agrandir la barre laterale'}
        >
          {sidebarOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
        </button>
      </motion.aside>

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <header className="bg-white border-b border-anac-border flex items-center justify-between px-6 h-[57px] flex-shrink-0">
          <h1 className="text-anac-navy font-semibold text-sm truncate">
            Application Informatique de la Direction de la Navigabilite
          </h1>

          <div className="flex items-center gap-1 flex-shrink-0 ml-4">
            <div className="flex items-center gap-2.5 px-1.5">
              <div className="text-right">
                <p className="text-[12px] font-semibold text-anac-navy leading-tight">
                  {user?.fullName}
                </p>
                <p className="text-[10px] text-anac-muted leading-tight">
                  {user?.roles.join(', ')}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-anac-navy text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0 select-none">
                {initials || '-'}
              </div>
            </div>

            <div className="w-px h-5 bg-anac-border mx-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={loggingOut}
              className="h-8 px-2.5 gap-1.5 text-anac-muted hover:text-anac-danger hover:bg-red-50"
            >
              {loggingOut ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
              <span className="text-[11px]">Deconnexion</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
