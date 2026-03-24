import { motion } from 'framer-motion';
import {
  Boxes,
  Bot,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  HelpCircle,
  LayoutDashboard,
  MessageSquare,
  Route,
  ScrollText,
  Settings,
  Sparkles,
  Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import {
  AppViewType,
  ClaudeCodeSubPageType,
  CodexSubPageType,
  OpenclawSubPageType,
  TopModuleType
} from '../../App';

interface ServiceStatus {
  running: boolean;
  pid: number | null;
  port: number;
}

interface SidebarProps {
  view: AppViewType;
  activeTopModule: TopModuleType;
  openclawExpanded: boolean;
  activeOpenclawSubPage: OpenclawSubPageType;
  claudecodeExpanded: boolean;
  activeClaudeCodeSubPage: ClaudeCodeSubPageType;
  codexExpanded: boolean;
  activeCodexSubPage: CodexSubPageType;
  onOpenOverview: () => void;
  onToggleOpenclaw: () => void;
  onOpenclawSubPage: (page: OpenclawSubPageType) => void;
  onToggleClaudecode: () => void;
  onOpenClaudecodeSubPage: (page: ClaudeCodeSubPageType) => void;
  onToggleCodex: () => void;
  onOpenCodexSubPage: (page: CodexSubPageType) => void;
  serviceStatus: ServiceStatus | null;
}

const openclawSubItems: { id: OpenclawSubPageType; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: '服务概览', icon: LayoutDashboard },
  { id: 'ai', label: 'AI 配置', icon: Bot },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'channels', label: '消息渠道', icon: MessageSquare },
  { id: 'testing', label: '测试诊断', icon: FlaskConical },
  { id: 'logs', label: '应用日志', icon: ScrollText },
  { id: 'settings', label: '设置', icon: Settings },
];

const claudecodeSubItems: { id: ClaudeCodeSubPageType; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'install', label: '安装/升级', icon: Wrench },
  { id: 'routes', label: '路线管理', icon: Route },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
];

const codexSubItems: { id: CodexSubPageType; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '概览', icon: LayoutDashboard },
  { id: 'install', label: '安装/升级', icon: Wrench },
  { id: 'routes', label: '路线管理', icon: Route },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
];

export function Sidebar({
  view,
  activeTopModule,
  openclawExpanded,
  activeOpenclawSubPage,
  claudecodeExpanded,
  activeClaudeCodeSubPage,
  codexExpanded,
  activeCodexSubPage,
  onOpenOverview,
  onToggleOpenclaw,
  onOpenclawSubPage,
  onToggleClaudecode,
  onOpenClaudecodeSubPage,
  onToggleCodex,
  onOpenCodexSubPage,
  serviceStatus,
}: SidebarProps) {
  const isRunning = serviceStatus?.running ?? false;
  const openclawPageActive = view === 'openclaw_page';
  const claudecodePageActive = view === 'claudecode_page';
  const codexPageActive = view === 'codex_page';
  const overviewActive = view === 'module_center';

  return (
    <aside className="w-72 bg-dark-800 border-r border-dark-600 flex flex-col">
      <div className="h-14 flex items-center px-6 titlebar-drag border-b border-dark-600">
        <div className="flex items-center gap-3 titlebar-no-drag">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-claw-400 to-claw-600 flex items-center justify-center">
            <span className="text-lg">🧩</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">AI Tool</h1>
            <p className="text-xs text-gray-500">Manager</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="space-y-1">
          <li>
            <button
              onClick={onOpenOverview}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative',
                overviewActive ? 'text-white bg-dark-600' : 'text-gray-400 hover:text-white hover:bg-dark-700'
              )}
            >
              {overviewActive && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-claw-500 rounded-r-full"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <Boxes size={18} className={overviewActive ? 'text-claw-400' : ''} />
              <span>总览</span>
            </button>
          </li>
        </ul>

        <div className="mt-6 mb-2 px-3">
          <p className="text-xs uppercase tracking-wider text-gray-500">模块</p>
        </div>

        <ul className="space-y-1">
          <li>
            <button
              onClick={onToggleOpenclaw}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                activeTopModule === 'openclaw'
                  ? 'text-white bg-dark-600'
                  : 'text-gray-400 hover:text-white hover:bg-dark-700'
              )}
            >
              {openclawExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="font-semibold">OpenClaw</span>
            </button>
          </li>

          {openclawExpanded && (
            <li>
              <ul className="mt-1 space-y-1 pl-5">
                {openclawSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = openclawPageActive && activeOpenclawSubPage === item.id;

                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => onOpenclawSubPage(item.id)}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative',
                          isActive ? 'text-white bg-dark-600/90' : 'text-gray-400 hover:text-white hover:bg-dark-700'
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1 bottom-1 w-1 bg-claw-500 rounded-r-full pointer-events-none" />
                        )}
                        <span className="w-4 h-4 flex items-center justify-center shrink-0">
                          <Icon size={16} className={isActive ? 'text-claw-400' : ''} />
                        </span>
                        <span>{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}

          <li>
            <button
              onClick={onToggleClaudecode}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                activeTopModule === 'claudecode' && claudecodePageActive
                  ? 'text-white bg-dark-600'
                  : 'text-gray-400 hover:text-white hover:bg-dark-700'
              )}
            >
              {claudecodeExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="font-semibold">ClaudeCode</span>
            </button>
          </li>

          {claudecodeExpanded && (
            <li>
              <ul className="mt-1 space-y-1 pl-5">
                {claudecodeSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = claudecodePageActive && activeClaudeCodeSubPage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => onOpenClaudecodeSubPage(item.id)}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative',
                          isActive ? 'text-white bg-dark-600/90' : 'text-gray-400 hover:text-white hover:bg-dark-700'
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1 bottom-1 w-1 bg-claw-500 rounded-r-full pointer-events-none" />
                        )}
                        <span className="w-4 h-4 flex items-center justify-center shrink-0">
                          <Icon size={16} className={isActive ? 'text-claw-400' : ''} />
                        </span>
                        <span>{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}

          <li>
            <button
              onClick={onToggleCodex}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
                activeTopModule === 'codex' && codexPageActive
                  ? 'text-white bg-dark-600'
                  : 'text-gray-400 hover:text-white hover:bg-dark-700'
              )}
            >
              {codexExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="font-semibold">Codex</span>
            </button>
          </li>

          {codexExpanded && (
            <li>
              <ul className="mt-1 space-y-1 pl-5">
                {codexSubItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = codexPageActive && activeCodexSubPage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => onOpenCodexSubPage(item.id)}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all relative',
                          isActive ? 'text-white bg-dark-600/90' : 'text-gray-400 hover:text-white hover:bg-dark-700'
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1 bottom-1 w-1 bg-claw-500 rounded-r-full pointer-events-none" />
                        )}
                        <span className="w-4 h-4 flex items-center justify-center shrink-0">
                          <Icon size={16} className={isActive ? 'text-claw-400' : ''} />
                        </span>
                        <span>{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}
        </ul>
      </nav>

      <div className="p-4 border-t border-dark-600">
        <div className="px-4 py-3 bg-dark-700 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className={clsx('status-dot', isRunning ? 'running' : 'stopped')} />
            <span className="text-xs text-gray-400">{isRunning ? '服务运行中' : '服务未启动'}</span>
          </div>
          <p className="text-xs text-gray-500">端口: {serviceStatus?.port ?? 18789}</p>
        </div>
      </div>
    </aside>
  );
}
