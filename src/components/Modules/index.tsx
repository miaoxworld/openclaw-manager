import { useEffect, useMemo, useState } from 'react';
import { Boxes, CheckCircle2, ChevronRight, Loader2, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { api, ClaudeCodeStatus, CodexStatus, EnvironmentStatus, ModuleStatusOverview } from '../../lib/tauri';
import { MODULE_REGISTRY } from '../../modules/registry';
import { ModuleType } from '../../types/modules';

interface ModulesProps {
  envStatus: EnvironmentStatus | null;
  onOpenModule: (moduleId: ModuleType) => void;
}

export function Modules({ envStatus, onOpenModule }: ModulesProps) {
  const [overview, setOverview] = useState<ModuleStatusOverview | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<ClaudeCodeStatus | null>(null);
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [result, claude, codex] = await Promise.all([
          api.getModuleStatuses(),
          api.getClaudeCodeStatus().catch(() => null),
          api.getCodexStatus().catch(() => null),
        ]);
        setOverview(result);
        setClaudeStatus(claude);
        setCodexStatus(codex);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const statusMap = useMemo(() => {
    const entries = overview?.modules || [];
    return new Map(entries.map((item) => [item.module_id, item]));
  }, [overview?.modules]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-claw-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-400">正在加载模块状态...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-6xl space-y-6">
        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-claw-500/20 flex items-center justify-center">
              <Boxes size={20} className="text-claw-300" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white">模块中心</h3>
              <p className="text-sm text-gray-400 mt-1">
                管理 OpenClaw、Codex、Claude Code 三个模块，按需安装与配置。
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <span className={clsx(
                  'px-3 py-1 rounded-full',
                  envStatus?.node_installed && envStatus.node_version_ok
                    ? 'bg-green-500/15 text-green-300'
                    : 'bg-red-500/15 text-red-300'
                )}>
                  Node.js: {envStatus?.node_version || '未安装'}
                </span>
                <span className={clsx(
                  'px-3 py-1 rounded-full',
                  envStatus?.ready ? 'bg-green-500/15 text-green-300' : 'bg-yellow-500/15 text-yellow-300'
                )}>
                  平台基础环境: {envStatus?.ready ? '就绪' : '未就绪'}
                </span>
              </div>
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-300 mt-4">
              模块状态加载失败：{error}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {MODULE_REGISTRY.map((module) => {
            const runtime = statusMap.get(module.id);
            const installed = !!runtime?.installed;
            const moduleVersion = module.id === 'claudecode'
              ? claudeStatus?.version || runtime?.version || '未检测到版本'
              : module.id === 'codex'
                ? codexStatus?.version || runtime?.version || '未检测到版本'
                : runtime?.version || '未检测到版本';
            const moduleMessage = module.id === 'claudecode'
              ? (claudeStatus?.current_route
                ? `当前路线: ${claudeStatus.current_route}`
                : runtime?.message || '点击查看模块详情')
              : module.id === 'codex'
                ? (codexStatus?.install_type
                  ? `安装类型: ${codexStatus.install_type}${codexStatus.current_route ? ` / 路线: ${codexStatus.current_route}` : ''}`
                  : runtime?.message || '点击查看模块详情')
                : runtime?.message || '点击查看模块详情';
            return (
              <button
                key={module.id}
                onClick={() => onOpenModule(module.id)}
                className="text-left bg-dark-700 rounded-2xl p-5 border border-dark-500 hover:border-claw-400/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-white font-semibold">{module.name}</h4>
                    <p className="text-sm text-gray-400 mt-1">{module.description}</p>
                  </div>
                  {installed ? (
                    <CheckCircle2 size={18} className="text-green-400 shrink-0" />
                  ) : (
                    <XCircle size={18} className="text-red-400 shrink-0" />
                  )}
                </div>
                <div className="mt-4 space-y-1">
                  <p className={clsx('text-sm font-medium', installed ? 'text-green-300' : 'text-red-300')}>
                    {installed ? '已安装' : '未安装'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {moduleVersion}
                  </p>
                  <p className="text-xs text-gray-500">
                    {moduleMessage}
                  </p>
                </div>
                <div className="mt-5 text-claw-300 text-sm inline-flex items-center gap-1">
                  查看详情
                  <ChevronRight size={14} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
