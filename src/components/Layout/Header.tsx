import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageType } from '../../App';
import { RefreshCw, ExternalLink, Loader2, Sun, Moon } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
import { useTheme } from '../../lib/ThemeContext';

interface HeaderProps {
  currentPage: PageType;
}

const pageTitles: Record<PageType, { title: string; description: string }> = {
  dashboard: { title: '概览', description: '服务状态、日志与快捷操作' },
  ai: { title: 'AI 模型配置', description: '配置 AI 提供商和模型' },
  agents: { title: 'Agent 管理', description: '管理虚拟员工、角色分工与渠道绑定' },
  channels: { title: '消息渠道', description: '配置 Telegram、Discord、飞书等' },
  skills: { title: '技能库', description: '管理内置、官方、社区与自定义技能' },
  testing: { title: '测试诊断', description: '系统诊断与问题排查' },
  logs: { title: '应用日志', description: '查看 Manager 应用的控制台日志' },
  security: { title: '安全防护', description: '安全风险检测与一键修复' },
  settings: { title: '设置', description: '身份配置与高级选项' },
};

export function Header({ currentPage }: HeaderProps) {
  const { t } = useTranslation();
  const title = t(`header.${currentPage}.title`);
  const description = t(`header.${currentPage}.description`);
  const [opening, setOpening] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleOpenDashboard = async () => {
    setOpening(true);
    try {
      const url = await invoke<string>('get_dashboard_url');
      await open(url);
    } catch (e) {
      console.error('打开 Dashboard 失败:', e);
      window.open('http://localhost:18789', '_blank');
    } finally {
      setOpening(false);
    }
  };

  return (
    <header
      className="h-14 flex items-center justify-between px-6 titlebar-drag backdrop-blur-sm"
      style={{
        backgroundColor: 'var(--bg-overlay)',
        borderBottom: '1px solid var(--border-primary)',
      }}
    >
      {/* 左侧：页面标题 */}
      <div className="titlebar-no-drag">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
      </div>

      <div className="flex items-center gap-2 titlebar-no-drag">
        {/* 主题切换 */}
        <button
          onClick={toggleTheme}
          className="icon-button"
          style={{ color: 'var(--text-secondary)' }}
          title={theme === 'light' ? '切换到暗色模式' : '切换到亮色模式'}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <button
          onClick={() => window.location.reload()}
          className="icon-button"
          style={{ color: 'var(--text-secondary)' }}
          title="刷新"
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={handleOpenDashboard}
          disabled={opening}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
          }}
          title="打开 Web Dashboard"
        >
          {opening ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
          <span>Dashboard</span>
        </button>
      </div>
    </header>
  );
}
