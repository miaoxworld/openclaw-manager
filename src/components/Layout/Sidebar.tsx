import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  FlaskConical,
  ScrollText,
  Settings,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageType } from '../../App';
import clsx from 'clsx';

interface ServiceStatus {
  running: boolean;
  pid: number | null;
  port: number;
}

interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
  serviceStatus: ServiceStatus | null;
}

const menuIcons: Record<PageType, React.ElementType> = {
  dashboard: LayoutDashboard,
  ai: Bot,
  channels: MessageSquare,
  testing: FlaskConical,
  logs: ScrollText,
  settings: Settings,
};

const menuKeys: PageType[] = ['dashboard', 'ai', 'channels', 'testing', 'logs', 'settings'];

export function Sidebar({ currentPage, onNavigate, serviceStatus }: SidebarProps) {
  const { t } = useTranslation();
  const isRunning = serviceStatus?.running ?? false;

  return (
    <aside className="w-64 bg-dark-800 border-r border-dark-600 flex flex-col">
      <div className="h-14 flex items-center px-6 titlebar-drag border-b border-dark-600">
        <div className="flex items-center gap-3 titlebar-no-drag">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-claw-400 to-claw-600 flex items-center justify-center">
            <span className="text-lg">🦞</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">OpenClaw</h1>
            <p className="text-xs text-gray-500">Manager</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3">
        <ul className="space-y-1">
          {menuKeys.map((id) => {
            const isActive = currentPage === id;
            const Icon = menuIcons[id];
            const label = t(`sidebar.${id}`);

            return (
              <li key={id}>
                <button
                  onClick={() => onNavigate(id)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative',
                    isActive
                      ? 'text-white bg-dark-600'
                      : 'text-gray-400 hover:text-white hover:bg-dark-700'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-claw-500 rounded-r-full"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <Icon size={18} className={isActive ? 'text-claw-400' : ''} />
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-dark-600">
        <div className="px-4 py-3 bg-dark-700 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className={clsx('status-dot', isRunning ? 'running' : 'stopped')} />
            <span className="text-xs text-gray-400">
              {isRunning ? t('sidebar.serviceRunning') : t('sidebar.serviceStopped')}
            </span>
          </div>
          <p className="text-xs text-gray-500">{t('sidebar.port', { port: serviceStatus?.port ?? 18789 })}</p>
        </div>
      </div>
    </aside>
  );
}
