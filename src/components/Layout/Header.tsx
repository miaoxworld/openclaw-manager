import { useState } from 'react';
import { RefreshCw, ExternalLink, Loader2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
import {
  AppViewType,
  ClaudeCodeSubPageType,
  CodexSubPageType,
  OpenclawSubPageType,
  TopModuleType
} from '../../App';

interface HeaderProps {
  view: AppViewType;
  activeTopModule: TopModuleType;
  activeOpenclawSubPage: OpenclawSubPageType;
  activeClaudeCodeSubPage: ClaudeCodeSubPageType;
  activeCodexSubPage: CodexSubPageType;
}

const openclawPageTitles: Record<OpenclawSubPageType, { title: string; description: string }> = {
  dashboard: { title: 'OpenClaw / 服务概览', description: '服务状态、日志与快捷操作' },
  ai: { title: 'OpenClaw / AI 配置', description: '配置 AI 提供商和模型' },
  skills: { title: 'OpenClaw / Skills', description: '安装和维护 tuzi-skills 技能集' },
  channels: { title: 'OpenClaw / 消息渠道', description: '配置 Telegram、Discord、飞书等' },
  testing: { title: 'OpenClaw / 测试诊断', description: '系统诊断与问题排查' },
  logs: { title: 'OpenClaw / 应用日志', description: '查看 Manager 应用的控制台日志' },
  settings: { title: 'OpenClaw / 设置', description: '身份配置与高级选项' },
};

const claudecodePageTitles: Record<ClaudeCodeSubPageType, { title: string; description: string }> = {
  overview: { title: 'ClaudeCode / 概览', description: '查看安装状态、当前路线与关键环境信息' },
  install: { title: 'ClaudeCode / 安装与升级', description: '执行 A/B/C 安装方案，或升级/卸载 ClaudeCode' },
  routes: { title: 'ClaudeCode / 路线管理', description: '切换、添加和更新路线配置' },
  faq: { title: 'ClaudeCode / FAQ', description: '读取 install_claude 参考文档并查看常见问题' },
};

const codexPageTitles: Record<CodexSubPageType, { title: string; description: string }> = {
  overview: { title: 'Codex / 概览', description: '查看安装状态、安装类型、路线与环境变量摘要' },
  install: { title: 'Codex / 安装与升级', description: '执行原版/改版安装、升级、卸载与重装' },
  routes: { title: 'Codex / 路线管理', description: '切换 gac/tuzi 路线并管理 model/reasoning 参数' },
  faq: { title: 'Codex / FAQ', description: '读取 install_codex.sh 原文并查看更新时间' },
};

function getHeaderMeta(
  view: AppViewType,
  activeTopModule: TopModuleType,
  activeOpenclawSubPage: OpenclawSubPageType,
  activeClaudeCodeSubPage: ClaudeCodeSubPageType,
  activeCodexSubPage: CodexSubPageType
) {
  if (view === 'module_center') {
    return { title: '模块总览', description: '查看并进入 OpenClaw、ClaudeCode、Codex 模块' };
  }

  if (view === 'openclaw_page') {
    return openclawPageTitles[activeOpenclawSubPage];
  }

  if (view === 'claudecode_page') {
    return claudecodePageTitles[activeClaudeCodeSubPage];
  }

  if (view === 'codex_page') {
    return codexPageTitles[activeCodexSubPage];
  }

  return { title: activeTopModule, description: '' };
}

export function Header({
  view,
  activeTopModule,
  activeOpenclawSubPage,
  activeClaudeCodeSubPage,
  activeCodexSubPage,
}: HeaderProps) {
  const { title, description } = getHeaderMeta(
    view,
    activeTopModule,
    activeOpenclawSubPage,
    activeClaudeCodeSubPage,
    activeCodexSubPage
  );
  const [opening, setOpening] = useState(false);
  const showDashboardButton = view === 'openclaw_page' && activeTopModule === 'openclaw';

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
    <header className="h-14 bg-dark-800/50 border-b border-dark-600 flex items-center justify-between px-6 titlebar-drag backdrop-blur-sm">
      <div className="titlebar-no-drag">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-xs text-gray-500">{description}</p>
      </div>

      <div className="flex items-center gap-2 titlebar-no-drag">
        <button
          onClick={() => window.location.reload()}
          className="icon-button text-gray-400 hover:text-white"
          title="刷新"
        >
          <RefreshCw size={16} />
        </button>
        {showDashboardButton && (
          <button
            onClick={handleOpenDashboard}
            disabled={opening}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50"
            title="打开 Web Dashboard"
          >
            {opening ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            <span>Dashboard</span>
          </button>
        )}
      </div>
    </header>
  );
}
