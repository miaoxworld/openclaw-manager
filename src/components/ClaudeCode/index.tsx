import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Route,
  Upload,
} from 'lucide-react';
import clsx from 'clsx';
import {
  api,
  ClaudeActionResult,
  ClaudeCodeStatus,
  ClaudeInstallScheme,
  ClaudeReferenceDocs,
} from '../../lib/tauri';
import { ClaudeCodeSubPageType } from '../../App';
import { InstallActionCard } from '../InstallUI/InstallActionCard';
import { InstallToolbar } from '../InstallUI/InstallToolbar';
import { StatusHeaderCard } from '../InstallUI/StatusHeaderCard';

interface ClaudeCodeProps {
  section: ClaudeCodeSubPageType;
  onNavigateSection: (section: ClaudeCodeSubPageType) => void;
}

const schemeDescriptions: Record<ClaudeInstallScheme, string> = {
  A: '改版 Claude（无需手动输入 Key，首次登录走网页授权）',
  B: '原版 ClaudeCode + gaccode Key',
  C: '原版 ClaudeCode + tu-zi Key（请使用 ClaudeCode 分组 API Key）',
};

export function ClaudeCode({ section, onNavigateSection }: ClaudeCodeProps) {
  const [status, setStatus] = useState<ClaudeCodeStatus | null>(null);
  const [referenceDocs, setReferenceDocs] = useState<ClaudeReferenceDocs | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ClaudeActionResult | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const [gacApiKeyInput, setGacApiKeyInput] = useState('');
  const [tuziApiKeyInput, setTuziApiKeyInput] = useState('');
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteBaseUrl, setNewRouteBaseUrl] = useState('');
  const [newRouteApiKey, setNewRouteApiKey] = useState('');
  const [routeKeyUpdates, setRouteKeyUpdates] = useState<Record<string, string>>({});

  const loadStatus = async () => {
    try {
      const nextStatus = await api.getClaudeCodeStatus();
      setStatus(nextStatus);
    } catch (e) {
      setPageError(`加载 ClaudeCode 状态失败: ${String(e)}`);
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
        setReferenceDocs(await api.getClaudeInstallReference());
      } catch (e) {
        setPageError(`加载参考文档失败: ${String(e)}`);
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
        label: '当前路线',
        value: status.current_route || '--',
        className: 'text-gray-200 bg-dark-600',
      },
      {
        label: '路线文件',
        value: status.route_file_exists ? '存在' : '不存在',
        className: status.route_file_exists ? 'text-green-300 bg-green-500/15' : 'text-yellow-300 bg-yellow-500/15',
      },
    ];
  }, [status]);

  const runAction = async (id: string, action: () => Promise<ClaudeActionResult>) => {
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

  const handleInstall = (scheme: ClaudeInstallScheme) => {
    if (scheme === 'B' && !gacApiKeyInput.trim()) {
      setPageError('安装原版 ClaudeCode + gaccode Key 需要先填写 API Key');
      return;
    }
    if (scheme === 'C' && !tuziApiKeyInput.trim()) {
      setPageError('安装原版 ClaudeCode + Tuzi Key 需要先填写 API Key');
      return;
    }
    void runAction(`install-${scheme}`, () =>
      api.installClaudeCode(
        scheme,
        scheme === 'A'
          ? undefined
          : scheme === 'B'
            ? gacApiKeyInput.trim() || undefined
            : tuziApiKeyInput.trim() || undefined
      )
    );
  };

  const handleAddRoute = () => {
    const routeName = newRouteName.trim();
    const baseUrl = newRouteBaseUrl.trim();
    const apiKey = newRouteApiKey.trim();
    if (!routeName || !baseUrl || !apiKey) {
      setPageError('新增路线前请填写路线名、Base URL 和 API Key');
      return;
    }
    void runAction('route-add', () => api.addClaudeRoute(routeName, baseUrl, apiKey)).then(() => {
      setNewRouteName('');
      setNewRouteBaseUrl('');
      setNewRouteApiKey('');
    });
  };

  if (loadingStatus) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-claw-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-400">正在加载 ClaudeCode 模块...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-6xl space-y-6">
        <StatusHeaderCard
          title="ClaudeCode 管理器"
          description="支持安装、升级、路线切换与 FAQ 文档查看（对齐 install_claude 流程）。"
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
                <p className="mt-2 text-xs">提示：请重开终端后执行 `claude`。</p>
              )}
            </div>

            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">终端输出</h4>
              <pre className="bg-dark-900 rounded-lg p-4 text-xs text-gray-300 whitespace-pre-wrap max-h-[360px] overflow-y-auto">
                {[actionResult.stdout, actionResult.stderr]
                  .filter((value) => value && value.trim().length > 0)
                  .join('\n\n')
                  || '（无输出）'}
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
                <p>当前路线: {status?.current_route || '--'}</p>
                <p>ANTHROPIC_BASE_URL: {status?.env_summary.anthropic_base_url || '--'}</p>
                <p>
                  ANTHROPIC_API_KEY: {status?.env_summary.anthropic_api_key_masked || '未读取到'}
                </p>
              </div>
            </div>
            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">快捷操作</h4>
              <div className="space-y-3">
                <button
                  onClick={() => void runAction('upgrade-current', () => api.upgradeClaudeCode())}
                  disabled={!!runningAction}
                  className="w-full px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {runningAction === 'upgrade-current' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  升级当前 Claude 版本
                </button>
                <button
                  onClick={() => onNavigateSection('routes')}
                  disabled={!!runningAction}
                  className="w-full px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  <Route size={14} />
                  路线切换
                </button>
              </div>
            </div>
          </div>
        )}

        {section === 'install' && (
          <div className="space-y-4">
            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">安装方案</h4>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <InstallActionCard
                  title="gaccode 改版"
                  description={schemeDescriptions.A}
                  helperText="无需输入 API Key，安装后按提示完成授权。"
                  onAction={() => handleInstall('A')}
                  disabled={!!runningAction}
                  loading={runningAction === 'install-A'}
                />

                <InstallActionCard
                  title="原版 ClaudeCode + gaccode Key"
                  description={schemeDescriptions.B}
                  helperText="需要先输入 gaccode API Key。"
                  onAction={() => handleInstall('B')}
                  disabled={!!runningAction}
                  loading={runningAction === 'install-B'}
                >
                  <input
                    type="password"
                    value={gacApiKeyInput}
                    onChange={(e) => setGacApiKeyInput(e.target.value)}
                    placeholder="请输入 gaccode API Key（必填）"
                    className="input-base"
                  />
                </InstallActionCard>

                <InstallActionCard
                  title="原版 ClaudeCode + Tuzi Key"
                  description={schemeDescriptions.C}
                  helperText="提示：请使用 Tuzi 的 ClaudeCode 分组 API Key"
                  onAction={() => handleInstall('C')}
                  disabled={!!runningAction}
                  loading={runningAction === 'install-C'}
                >
                  <input
                    type="password"
                    value={tuziApiKeyInput}
                    onChange={(e) => setTuziApiKeyInput(e.target.value)}
                    placeholder="请输入 Tuzi ClaudeCode 分组 API Key（必填）"
                    className="input-base"
                  />
                </InstallActionCard>
              </div>
            </div>

            <InstallToolbar title="升级 / 卸载">
              <button
                onClick={() => void runAction('upgrade-original', () => api.upgradeClaudeCode('original'))}
                disabled={!!runningAction}
                className="px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 disabled:opacity-50"
              >
                升级原版
              </button>
              <button
                onClick={() => void runAction('upgrade-modified', () => api.upgradeClaudeCode('modified'))}
                disabled={!!runningAction}
                className="px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 disabled:opacity-50"
              >
                升级改版
              </button>
              <button
                onClick={() => void runAction('uninstall-keep', () => api.uninstallClaudeCode(false))}
                disabled={!!runningAction}
                className="px-4 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-900/40 text-red-300 text-sm disabled:opacity-50"
              >
                卸载（保留配置）
              </button>
              <button
                onClick={() => void runAction('uninstall-clear', () => api.uninstallClaudeCode(true))}
                disabled={!!runningAction}
                className="px-4 py-2 rounded-lg bg-red-900/70 hover:bg-red-800 text-white text-sm disabled:opacity-50"
              >
                卸载（清理配置）
              </button>
            </InstallToolbar>
          </div>
        )}

        {section === 'routes' && (
          <div className="space-y-4">
            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">路线列表</h4>
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
                          <p className="text-xs text-gray-400 mt-1">
                            API Key: {route.api_key_masked || (route.has_key ? '已配置' : '未配置')}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void runAction(`switch-${route.name}`, () => api.switchClaudeRoute(route.name))}
                            disabled={!!runningAction}
                            className="px-3 py-1.5 rounded-lg bg-dark-500 hover:bg-dark-400 text-xs text-gray-200 disabled:opacity-50"
                          >
                            切换到此路线
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <input
                          type="password"
                          value={routeKeyUpdates[route.name] || ''}
                          onChange={(e) =>
                            setRouteKeyUpdates((prev) => ({ ...prev, [route.name]: e.target.value }))
                          }
                          placeholder="输入新 API Key"
                          className="input-base text-sm"
                        />
                        <button
                          onClick={() =>
                            void runAction(`update-key-${route.name}`, () =>
                              api.updateClaudeRouteKey(route.name, (routeKeyUpdates[route.name] || '').trim())
                            )
                          }
                          disabled={!!runningAction}
                          className="px-3 py-1.5 rounded-lg bg-claw-600 hover:bg-claw-500 text-xs text-white disabled:opacity-50"
                        >
                          更新 Key
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">暂无路线配置。</p>
              )}
            </div>

            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">新增路线</h4>
              <div className="grid grid-cols-1 gap-3">
                <input
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  className="input-base"
                  placeholder="路线名称（例如 my-route）"
                />
                <input
                  value={newRouteBaseUrl}
                  onChange={(e) => setNewRouteBaseUrl(e.target.value)}
                  className="input-base"
                  placeholder="ANTHROPIC_BASE_URL"
                />
                <input
                  type="password"
                  value={newRouteApiKey}
                  onChange={(e) => setNewRouteApiKey(e.target.value)}
                  className="input-base"
                  placeholder="ANTHROPIC_API_KEY"
                />
                <button
                  onClick={handleAddRoute}
                  disabled={!!runningAction}
                  className="btn-primary text-sm px-4 py-2 w-fit disabled:opacity-50"
                >
                  添加并切换路线
                </button>
              </div>
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
                  <p>文档来源：Claude 官方流程文档</p>
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
