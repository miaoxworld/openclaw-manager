import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Route,
  Upload,
} from 'lucide-react';
import clsx from 'clsx';
import {
  api,
  CodexActionResult,
  CodexInstallVariant,
  CodexReferenceDocs,
  CodexRoute,
  CodexStatus,
} from '../../lib/tauri';
import { CodexSubPageType } from '../../App';
import { InstallActionCard } from '../InstallUI/InstallActionCard';
import { InstallToolbar } from '../InstallUI/InstallToolbar';
import { StatusHeaderCard } from '../InstallUI/StatusHeaderCard';

interface CodexProps {
  section: CodexSubPageType;
  onNavigateSection: (section: CodexSubPageType) => void;
}

const installDescriptions: Record<CodexInstallVariant, string> = {
  openai: '原版 Codex CLI（可配置 gac/tuzi 路线）',
  gac: 'gac 改版 Codex CLI（无需写入 route 配置）',
};

export function Codex({ section, onNavigateSection }: CodexProps) {
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [referenceDocs, setReferenceDocs] = useState<CodexReferenceDocs | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<CodexActionResult | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const [installRoute, setInstallRoute] = useState<'gac' | 'tuzi'>('gac');
  const [installApiKey, setInstallApiKey] = useState('');
  const [installModel, setInstallModel] = useState('gpt-5.4');
  const [installReasoning, setInstallReasoning] = useState('medium');

  const [routeSwitchInputs, setRouteSwitchInputs] = useState<Record<string, string>>({});
  const [routeModelInputs, setRouteModelInputs] = useState<Record<string, string>>({});
  const [routeReasoningInputs, setRouteReasoningInputs] = useState<Record<string, string>>({});

  const loadStatus = async () => {
    try {
      const next = await api.getCodexStatus();
      setStatus(next);
      const nextModelInputs: Record<string, string> = {};
      const nextReasoningInputs: Record<string, string> = {};
      next.routes.forEach((route) => {
        nextModelInputs[route.name] = route.model_settings.model;
        nextReasoningInputs[route.name] = route.model_settings.model_reasoning_effort;
      });
      setRouteModelInputs(nextModelInputs);
      setRouteReasoningInputs(nextReasoningInputs);
    } catch (e) {
      setPageError(`加载 Codex 状态失败: ${String(e)}`);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoadingStatus(true);
      await loadStatus();
      setLoadingStatus(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (section !== 'faq') return;
    const loadReference = async () => {
      setLoadingDocs(true);
      try {
        setReferenceDocs(await api.getCodexInstallReference());
      } catch (e) {
        setPageError(`加载 install_codex.sh 失败: ${String(e)}`);
      } finally {
        setLoadingDocs(false);
      }
    };
    loadReference();
  }, [section]);

  const statusChips = useMemo(() => {
    if (!status) return [];
    return [
      {
        label: 'CLI 状态',
        value: status.installed ? '已安装' : '未安装',
        className: status.installed ? 'text-green-300 bg-green-500/15' : 'text-red-300 bg-red-500/15',
      },
      {
        label: '版本',
        value: status.version || '--',
        className: 'text-gray-200 bg-dark-600',
      },
      {
        label: '安装类型',
        value: status.install_type || '--',
        className: 'text-gray-200 bg-dark-600',
      },
      {
        label: '当前路线',
        value: status.current_route || '--',
        className: 'text-gray-200 bg-dark-600',
      },
    ];
  }, [status]);

  const runAction = async (id: string, action: () => Promise<CodexActionResult>) => {
    setRunningAction(id);
    setPageError(null);
    setActionResult(null);
    try {
      const result = await action();
      setActionResult(result);
      await loadStatus();
    } catch (e) {
      setPageError(String(e));
    } finally {
      setRunningAction(null);
    }
  };

  const openaiRouteEditable = status?.install_type === 'openai';

  const handleInstallOpenai = () => {
    if (!installApiKey.trim()) {
      setPageError('安装原版 Codex 并配置路线时，需要输入 CODEX_API_KEY');
      return;
    }
    void runAction('install-openai', () =>
      api.installCodex('openai', installRoute, installApiKey.trim(), installModel.trim(), installReasoning.trim())
    );
  };

  const handleSwitchRoute = (route: CodexRoute) => {
    const key = (routeSwitchInputs[route.name] || '').trim();
    if (!key) {
      setPageError('路线切换需要重新输入 API Key');
      return;
    }
    void runAction(`switch-${route.name}`, () =>
      api.switchCodexRoute(
        route.name,
        key,
        (routeModelInputs[route.name] || route.model_settings.model).trim(),
        (routeReasoningInputs[route.name] || route.model_settings.model_reasoning_effort).trim()
      )
    );
  };

  const handleSetRouteModel = (route: CodexRoute) => {
    const model = (routeModelInputs[route.name] || '').trim();
    const reasoning = (routeReasoningInputs[route.name] || '').trim();
    if (!model) {
      setPageError('model 不能为空');
      return;
    }
    void runAction(`set-model-${route.name}`, () =>
      api.setCodexRouteModel(route.name, model, reasoning)
    );
  };

  if (loadingStatus) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-claw-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-400">正在加载 Codex 模块...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-6xl space-y-6">
        <StatusHeaderCard
          title="Codex 管理器"
          description="对齐 install_codex.sh：安装、升级、路线切换、重装与 FAQ。"
          chips={statusChips}
          onRefresh={() => void loadStatus()}
          refreshing={!!runningAction}
        />

        {pageError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {pageError}
          </div>
        )}

        {actionResult && (
          <>
            <div
              className={clsx(
                'rounded-xl px-4 py-3 text-sm border',
                actionResult.success
                  ? 'border-green-500/30 bg-green-500/10 text-green-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-300'
              )}
            >
              <p className="font-medium">{actionResult.message}</p>
              {actionResult.error && <p className="mt-1 text-xs opacity-90">{actionResult.error}</p>}
              {actionResult.restart_required && (
                <p className="mt-2 text-xs">提示：请重开终端后再执行 `codex`。</p>
              )}
            </div>

            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">终端输出</h4>
              <pre className="bg-dark-900 rounded-lg p-4 text-xs text-gray-300 whitespace-pre-wrap max-h-[360px] overflow-y-auto">
                {[actionResult.stdout, actionResult.stderr]
                  .filter((value) => value && value.trim().length > 0)
                  .join('\n\n') || '（无输出）'}
              </pre>
            </div>
          </>
        )}

        {section === 'overview' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">环境概览</h4>
              <div className="space-y-2 text-sm text-gray-300">
                <p>CLI: {status?.installed ? '已安装' : '未安装'}</p>
                <p>版本: {status?.version || '--'}</p>
                <p>安装类型: {status?.install_type || '--'}</p>
                <p>当前路线: {status?.current_route || '--'}</p>
                <p>状态文件: {status?.state_file_exists ? '存在' : '不存在'}</p>
                <p>配置文件: {status?.config_file_exists ? '存在' : '不存在'}</p>
                <p>CODEX_API_KEY: {status?.env_summary.codex_api_key_masked || '未读取到'}</p>
              </div>
            </div>
            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">快捷操作</h4>
              <div className="space-y-3">
                <button
                  onClick={() => void runAction('upgrade-auto', () => api.upgradeCodex())}
                  disabled={!!runningAction}
                  className="w-full px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {runningAction === 'upgrade-auto' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  升级当前 Codex
                </button>
                <button
                  onClick={() => onNavigateSection('routes')}
                  disabled={!!runningAction}
                  className="w-full px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  <Route size={14} />
                  路线与模型设置
                </button>
              </div>
            </div>
          </div>
        )}

        {section === 'install' && (
          <div className="space-y-4">
            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">安装方案</h4>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <InstallActionCard
                  title="原版 Codex"
                  description={installDescriptions.openai}
                  onAction={handleInstallOpenai}
                  disabled={!!runningAction}
                  loading={runningAction === 'install-openai'}
                >
                  <div className="segmented-control">
                    <button
                      type="button"
                      onClick={() => setInstallRoute('gac')}
                      className={clsx('segmented-item', installRoute === 'gac' && 'active')}
                    >
                      gac 路线
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstallRoute('tuzi')}
                      className={clsx('segmented-item', installRoute === 'tuzi' && 'active')}
                    >
                      tuzi 路线
                    </button>
                  </div>
                  <input
                    type="password"
                    value={installApiKey}
                    onChange={(e) => setInstallApiKey(e.target.value)}
                    placeholder="请输入 CODEX_API_KEY（必填）"
                    className="input-base"
                  />
                  <input
                    value={installModel}
                    onChange={(e) => setInstallModel(e.target.value)}
                    placeholder="model（默认 gpt-5.4）"
                    className="input-base"
                  />
                  <input
                    value={installReasoning}
                    onChange={(e) => setInstallReasoning(e.target.value)}
                    placeholder="reasoning（默认 medium）"
                    className="input-base"
                  />
                </InstallActionCard>

                <InstallActionCard
                  title="gac 改版 Codex"
                  description={installDescriptions.gac}
                  onAction={() => void runAction('install-gac', () => api.installCodex('gac'))}
                  disabled={!!runningAction}
                  loading={runningAction === 'install-gac'}
                />
              </div>
            </div>

            <InstallToolbar title="升级 / 卸载 / 重装">
              <button
                onClick={() => void runAction('upgrade-openai', () => api.upgradeCodex('openai'))}
                disabled={!!runningAction}
                className="px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 disabled:opacity-50"
              >
                升级原版
              </button>
              <button
                onClick={() => void runAction('upgrade-gac', () => api.upgradeCodex('gac'))}
                disabled={!!runningAction}
                className="px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 disabled:opacity-50"
              >
                升级改版
              </button>
              <button
                onClick={() => void runAction('uninstall-keep', () => api.uninstallCodex(false))}
                disabled={!!runningAction}
                className="px-4 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-900/40 text-red-300 text-sm disabled:opacity-50"
              >
                卸载（保留配置）
              </button>
              <button
                onClick={() => void runAction('uninstall-clear', () => api.uninstallCodex(true))}
                disabled={!!runningAction}
                className="px-4 py-2 rounded-lg bg-red-900/70 hover:bg-red-800 text-white text-sm disabled:opacity-50"
              >
                卸载（清理配置）
              </button>
              <button
                onClick={() =>
                  void runAction('reinstall-openai', () =>
                    api.reinstallCodex(
                      'openai',
                      installRoute,
                      installApiKey.trim(),
                      installModel.trim(),
                      installReasoning.trim(),
                      false
                    )
                  )
                }
                disabled={!!runningAction}
                className="px-4 py-2 rounded-lg bg-dark-500 hover:bg-dark-400 text-sm text-gray-200 disabled:opacity-50"
              >
                重装原版
              </button>
            </InstallToolbar>
          </div>
        )}

        {section === 'routes' && (
          <div className="space-y-4">
            {!openaiRouteEditable && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300">
                当前安装类型不是 openai。路线切换与模型设置仅对原版 Codex 可用。
              </div>
            )}

            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">路线与模型</h4>
              {status?.routes.length ? (
                <div className="space-y-3">
                  {status.routes.map((route) => (
                    <div key={route.name} className="rounded-xl bg-dark-600 border border-dark-500 p-4">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div>
                          <p className="text-white font-medium inline-flex items-center gap-2">
                            <Route size={14} className="text-claw-300" />
                            {route.name}
                            {route.is_current && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">
                                当前
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">Base URL: {route.base_url || '--'}</p>
                          <p className="text-xs text-gray-400 mt-1">API Key: {route.api_key_masked || '未展示'}</p>
                        </div>
                        <button
                          onClick={() => handleSwitchRoute(route)}
                          disabled={!!runningAction || !openaiRouteEditable}
                          className="px-3 py-1.5 rounded-lg bg-dark-500 hover:bg-dark-400 text-xs text-gray-200 disabled:opacity-50"
                        >
                          切换到此路线（需重输 Key）
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-1 xl:grid-cols-3 gap-2">
                        <input
                          type="password"
                          value={routeSwitchInputs[route.name] || ''}
                          onChange={(e) =>
                            setRouteSwitchInputs((prev) => ({ ...prev, [route.name]: e.target.value }))
                          }
                          placeholder="切换时输入新的 CODEX_API_KEY"
                          className="input-base text-sm"
                        />
                        <input
                          value={routeModelInputs[route.name] || route.model_settings.model}
                          onChange={(e) =>
                            setRouteModelInputs((prev) => ({ ...prev, [route.name]: e.target.value }))
                          }
                          placeholder="model"
                          className="input-base text-sm"
                        />
                        <div className="flex gap-2">
                          <input
                            value={routeReasoningInputs[route.name] || route.model_settings.model_reasoning_effort}
                            onChange={(e) =>
                              setRouteReasoningInputs((prev) => ({ ...prev, [route.name]: e.target.value }))
                            }
                            placeholder="reasoning"
                            className="input-base text-sm"
                          />
                          <button
                            onClick={() => handleSetRouteModel(route)}
                            disabled={!!runningAction || !openaiRouteEditable}
                            className="px-3 py-1.5 rounded-lg bg-claw-600 hover:bg-claw-500 text-xs text-white disabled:opacity-50"
                          >
                            保存模型
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">暂无路线配置。</p>
              )}
            </div>
          </div>
        )}

        {section === 'faq' && (
          <div className="space-y-4">
            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">FAQ 状态信息</h4>
              {loadingDocs ? (
                <p className="text-sm text-gray-400 inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  正在加载文档状态...
                </p>
              ) : (
                <div className="space-y-2 text-sm text-gray-300">
                  <p>文档来源：Codex/Claude 官方流程文档</p>
                  <p>最近更新时间：{referenceDocs?.updated_at || '--'}</p>
                  <p>
                    本地参考读取：
                    {referenceDocs?.error ? '异常' : '正常'}
                  </p>
                  {referenceDocs?.error && (
                    <p className="text-yellow-300 text-xs">{referenceDocs.error}</p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-2">官方文档</h4>
              <p className="text-sm text-gray-400 mb-4">
                点击下方按钮跳转到你提供的官方说明文档。
              </p>
              <a
                href="https://wiki.tu-zi.com/s/8c61a536-7a59-4410-a5e2-8dab3d041958/doc/claude-ZP53hwclYa"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center px-4 py-2 rounded-lg bg-claw-500 hover:bg-claw-600 text-sm text-white transition-colors"
              >
                打开官方文档
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
