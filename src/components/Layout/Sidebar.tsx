import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Bot,
  Users,
  MessageSquare,
  Puzzle,
  FlaskConical,
  ScrollText,
  Settings,
  ShieldAlert,
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

const menuItems: { id: PageType; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: '概览', icon: LayoutDashboard },
  { id: 'ai', label: 'AI 配置', icon: Bot },
  { id: 'agents', label: 'Agent 管理', icon: Users },
  { id: 'channels', label: '消息渠道', icon: MessageSquare },
  { id: 'skills', label: '技能库', icon: Puzzle },
  { id: 'testing', label: '测试诊断', icon: FlaskConical },
  { id: 'logs', label: '应用日志', icon: ScrollText },
  { id: 'security', label: '安全防护', icon: ShieldAlert },
  { id: 'settings', label: '设置', icon: Settings },
];

export function Sidebar({ currentPage, onNavigate, serviceStatus }: SidebarProps) {
  const { t } = useTranslation();
  const isRunning = serviceStatus?.running ?? false;

  return (
    <aside
      className="w-64 flex flex-col"
      style={{ backgroundColor: 'var(--bg-sidebar)', borderRight: '1px solid var(--border-primary)' }}
    >
      {/* Logo 区域（macOS 标题栏拖拽） */}
      <div
        className="h-14 flex items-center px-6 titlebar-drag"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        <div className="flex items-center gap-3 titlebar-no-drag">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-claw-400 to-claw-600 flex items-center justify-center">
            <span className="text-lg">🦞</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>虾池子</h1>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = currentPage === item.id;
            const Icon = item.icon;

            return (
              <li key={id}>
                <button
                  onClick={() => onNavigate(id)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative'
                  )}
                  style={{
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
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

      {/* 底部信息 */}
      <div className="p-4" style={{ borderTop: '1px solid var(--border-primary)' }}>
        <div className="px-4 py-3 rounded-lg" style={{ backgroundColor: 'var(--bg-card)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className={clsx('status-dot', isRunning ? 'running' : 'stopped')} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {isRunning ? '服务运行中' : '服务未启动'}
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>端口: {serviceStatus?.port ?? 18789}</p>
        </div>
      </div>
    </aside>
  );
}
