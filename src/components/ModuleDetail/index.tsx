import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, CheckCircle, Download, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-shell';
import clsx from 'clsx';
import { EnvironmentStatus, ModuleStatusOverview, api, isTauri } from '../../lib/tauri';
import { getModuleDefinition } from '../../modules/registry';
import { ModuleType } from '../../types/modules';
import { Setup } from '../Setup';

interface UpdateInfo {
  update_available: boolean;
  current_version: string | null;
  latest_version: string | null;
  source: string;
  error: string | null;
}

interface UpdateResult {
  success: boolean;
  message: string;
  error?: string;
}

interface ModuleDetailProps {
  moduleId: ModuleType;
  envStatus: EnvironmentStatus | null;
  onBackToModules: () => void;
  onEnvironmentChange: () => Promise<void>;
}

export function ModuleDetail({
  moduleId,
  envStatus,
  onBackToModules,
  onEnvironmentChange,
}: ModuleDetailProps) {
  const definition = getModuleDefinition(moduleId);
  const [overview, setOverview] = useState<ModuleStatusOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);

  const runtimeStatus = useMemo(
    () => overview?.modules.find((item) => item.module_id === moduleId),
    [overview?.modules, moduleId]
  );

  useEffect(() => {
    const loadStatuses = async () => {
      try {
        setLoadingOverview(true);
        const result = await api.getModuleStatuses();
        setOverview(result);
      } finally {
        setLoadingOverview(false);
      }
    };
    loadStatuses();
  }, [moduleId]);

  useEffect(() => {
    const loadUpdateInfo = async () => {
      if (moduleId !== 'openclaw' || !isTauri()) return;
      try {
        setUpdateInfo(await invoke<UpdateInfo>('check_openclaw_update'));
      } catch {
        // 静默处理，不影响主页面
      }
    };
    loadUpdateInfo();
  }, [moduleId]);

  if (!definition) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        未找到模块定义
      </div>
    );
  }

  const handleOpenDoc = async (url: string) => {
    try {
      if (isTauri()) {
        await open(url);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleOpenclawUpdate = async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const result = await invoke<UpdateResult>('update_openclaw');
      setUpdateResult(result);
      await onEnvironmentChange();
      const refreshed = await api.getModuleStatuses();
      setOverview(refreshed);
      if (result.success) {
        const refreshedUpdate = await invoke<UpdateInfo>('check_openclaw_update');
        setUpdateInfo(refreshedUpdate);
      }
    } catch (e) {
      setUpdateResult({
        success: false,
        message: '更新过程中发生错误',
        error: String(e),
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-5xl space-y-6">
        <button
          onClick={onBackToModules}
          className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-white"
        >
          <ArrowLeft size={14} />
          返回模块中心
        </button>

        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl text-white font-semibold">{definition.name}</h3>
              <p className="text-sm text-gray-400 mt-1">{definition.description}</p>
            </div>
            <div className={clsx(
              'px-3 py-1 rounded-full text-xs',
              runtimeStatus?.installed ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
            )}>
              {runtimeStatus?.installed ? '已安装' : '未安装'}
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-300">
            版本：{loadingOverview ? '检测中...' : runtimeStatus?.version || '未检测到'}
          </div>
          <p className="text-xs text-gray-500 mt-1">{runtimeStatus?.message}</p>
        </div>

        {moduleId === 'openclaw' && updateInfo?.update_available && (
          <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-white font-medium">发现 OpenClaw 新版本 {updateInfo.latest_version}</p>
                <p className="text-xs text-gray-400">当前版本：{updateInfo.current_version}</p>
                <p className="text-xs text-gray-400">来源：{updateInfo.source}</p>
                {updateResult && (
                  <p className={clsx('text-sm mt-2', updateResult.success ? 'text-green-300' : 'text-red-300')}>
                    {updateResult.message}
                  </p>
                )}
              </div>
              <button
                onClick={handleOpenclawUpdate}
                disabled={updating}
                className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-50"
              >
                {updating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                立即更新
              </button>
            </div>
          </div>
        )}

        {moduleId === 'openclaw' && (
          <Setup
            embedded
            onComplete={async () => {
              await onEnvironmentChange();
              const refreshed = await api.getModuleStatuses();
              setOverview(refreshed);
            }}
          />
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
            <h4 className="text-white font-medium mb-3">前置条件</h4>
            <ul className="space-y-2 text-sm text-gray-300">
              {definition.prerequisites.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-400" />
                  {item}
                </li>
              ))}
            </ul>
            {moduleId !== 'openclaw' && (
              <p className={clsx(
                'text-xs mt-3',
                envStatus?.node_installed && envStatus.node_version_ok ? 'text-green-300' : 'text-yellow-300'
              )}>
                Node.js 检测：{envStatus?.node_version || '未安装或不可用'}
              </p>
            )}
          </div>

          <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
            <h4 className="text-white font-medium mb-3">关键能力</h4>
            <ul className="space-y-2 text-sm text-gray-300">
              {definition.capabilities.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <AlertCircle size={14} className="text-claw-300 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <h4 className="text-white font-medium mb-3">安装命令</h4>
          <div className="space-y-2">
            {definition.installCommands.map((command) => (
              <pre key={command} className="bg-dark-800 text-gray-200 text-sm px-3 py-2 rounded-lg overflow-x-auto">
                <code>{command}</code>
              </pre>
            ))}
          </div>
          <h4 className="text-white font-medium mt-5 mb-3">验证命令</h4>
          <div className="space-y-2">
            {definition.verifyCommands.map((command) => (
              <pre key={command} className="bg-dark-800 text-gray-200 text-sm px-3 py-2 rounded-lg overflow-x-auto">
                <code>{command}</code>
              </pre>
            ))}
          </div>
        </div>

        {definition.actions.length > 0 && (
          <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
            <h4 className="text-white font-medium mb-3">推荐动作</h4>
            <div className="space-y-3">
              {definition.actions.map((action) => (
                <div key={action.id} className="rounded-xl bg-dark-800 border border-dark-600 p-4">
                  <p className="text-sm text-white">{action.label}</p>
                  <p className="text-xs text-gray-400 mt-1">{action.description}</p>
                  {action.command && (
                    <pre className="bg-dark-900 text-gray-200 text-xs px-3 py-2 rounded-lg overflow-x-auto mt-3">
                      <code>{action.command}</code>
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <h4 className="text-white font-medium mb-3">常见问题</h4>
          <div className="space-y-4">
            {definition.faqs.map((faq) => (
              <div key={faq.question}>
                <p className="text-sm text-white">{faq.question}</p>
                <p className="text-sm text-gray-400 mt-1">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <h4 className="text-white font-medium mb-3">参考文档</h4>
          <div className="flex flex-wrap gap-3">
            {definition.docs.map((doc) => (
              <button
                key={doc.url}
                onClick={() => handleOpenDoc(doc.url)}
                className="px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 flex items-center gap-2"
              >
                {doc.label}
                <ExternalLink size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
