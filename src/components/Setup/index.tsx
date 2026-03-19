import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  CheckCircle2,
  Loader2,
  Download,
  Cpu,
  Package,
  Sparkles,
  KeyRound,
  ArrowRight,
  CheckCircle,
  Circle,
} from 'lucide-react';
import { api, EnvironmentStatus, TuziConfigOverview, TuziGroup } from '../../lib/tauri';
import { setupLogger } from '../../lib/logger';
import clsx from 'clsx';
import { useTuziModelSelection } from '../../hooks/useTuziModelSelection';

interface InstallResult {
  success: boolean;
  message: string;
  error: string | null;
}

interface AIConfigSummary {
  primary_model: string | null;
}

interface SetupProps {
  onComplete: () => void;
  embedded?: boolean;
}

export function Setup({ onComplete, embedded = false }: SetupProps) {
  const [envStatus, setEnvStatus] = useState<EnvironmentStatus | null>(null);
  const [tuziConfig, setTuziConfig] = useState<TuziConfigOverview | null>(null);
  const [aiSummary, setAiSummary] = useState<AIConfigSummary | null>(null);
  const [checking, setChecking] = useState(true);
  const [installing, setInstalling] = useState<'nodejs' | 'openclaw' | null>(null);
  const [savingTuzi, setSavingTuzi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<'tuzi' | 'other'>('tuzi');
  const [selectedGroup, setSelectedGroup] = useState<TuziGroup>('claude-code');
  const {
    apiKey,
    setApiKey,
    selectedModels,
    customModel,
    setCustomModel,
    displayModels,
    fetchingModels,
    fetchError,
    manualEntryEnabled,
    modelsSource,
    cacheTimestamp,
    warning,
    toggleModel,
    addCustomModel,
    fetchModels,
  } = useTuziModelSelection(selectedGroup, tuziConfig);

  const refreshState = async () => {
    setChecking(true);
    setError(null);
    setNotice(null);
    try {
      const [env, tuzi] = await Promise.all([
        invoke<EnvironmentStatus>('check_environment'),
        api.getTuziConfig(),
      ]);
      const aiConfig = await api.getAIConfig();
      setEnvStatus(env);
      setTuziConfig(tuzi);
      setAiSummary({ primary_model: aiConfig.primary_model });
      const preferredGroup =
        (tuzi.groups.find((item) => !item.configured)?.group || 'claude-code');
      setSelectedGroup(preferredGroup);
    } catch (e) {
      setError(`检查环境失败: ${String(e)}`);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    setupLogger.info('Setup 组件初始化');
    refreshState();
  }, []);

  const handleInstallNodejs = async () => {
    setInstalling('nodejs');
    setError(null);
    try {
      const result = await invoke<InstallResult>('install_nodejs');
      if (result.success) {
        await refreshState();
      } else {
        await invoke<string>('open_install_terminal', { installType: 'nodejs' });
        setError(result.error || '已打开终端，请完成 Node.js 安装后重新检查');
      }
    } catch (e) {
      setError(`Node.js 安装失败: ${String(e)}`);
    } finally {
      setInstalling(null);
    }
  };

  const handleInstallOpenclaw = async () => {
    setInstalling('openclaw');
    setError(null);
    try {
      const result = await invoke<InstallResult>('install_openclaw');
      if (!result.success) {
        await invoke<string>('open_install_terminal', { installType: 'openclaw' });
        setError(result.error || '已打开终端，请完成 OpenClaw 安装后重新检查');
      } else {
        await invoke<InstallResult>('init_openclaw_config');
        await refreshState();
      }
    } catch (e) {
      setError(`OpenClaw 安装失败: ${String(e)}`);
    } finally {
      setInstalling(null);
    }
  };

  const handleSaveTuzi = async () => {
    if (!apiKey.trim()) {
      setError('请输入 Tuzi API Key');
      return;
    }
    if (selectedModels.length === 0) {
      setError('请至少选择一个模型');
      return;
    }

    setSavingTuzi(true);
    setError(null);
    setNotice(null);
    try {
      await invoke<InstallResult>('init_openclaw_config');
      const currentPrimaryModel = aiSummary?.primary_model || null;
      const targetProviderId = selectedGroup === 'claude-code' ? 'tuzi-claude-code' : 'tuzi-codex';
      const targetModelId = `${targetProviderId}/${selectedModels[0]}`;
      const sameGroupPrimary = !!currentPrimaryModel && currentPrimaryModel.startsWith(`${targetProviderId}/`);
      let shouldSwitchPrimary = !currentPrimaryModel || sameGroupPrimary;

      if (!shouldSwitchPrimary && currentPrimaryModel) {
        shouldSwitchPrimary = window.confirm(
          `当前默认模型是 ${currentPrimaryModel}，是否切换为 ${targetModelId}？`
        );
      }

      await api.saveTuziConfig(selectedGroup, apiKey.trim(), selectedModels);
      if (shouldSwitchPrimary) {
        await api.setPrimaryModel(targetModelId);
      }
      const nextGroup: TuziGroup = selectedGroup === 'claude-code' ? 'codex' : 'claude-code';
      const updatedTuzi = await api.getTuziConfig();
      const updatedEnv = await invoke<EnvironmentStatus>('check_environment');
      const updatedAiConfig = await api.getAIConfig();

      setEnvStatus(updatedEnv);
      setTuziConfig(updatedTuzi);
      setAiSummary({ primary_model: updatedAiConfig.primary_model });

      const nextGroupConfig = updatedTuzi.groups.find((item) => item.group === nextGroup);
      if (!nextGroupConfig?.configured) {
        setSelectedGroup(nextGroup);
        setNotice(
          `已保存 ${selectedGroup === 'claude-code' ? 'Claude-Code' : 'Codex'}。你现在可以继续配置 ${nextGroup === 'claude-code' ? 'Claude-Code' : 'Codex'}，也可以直接完成后稍后再补。`
        );
        return;
      }

      setNotice('Tuzi 双 Provider 已配置完成。');
      await onComplete();
    } catch (e) {
      setError(`保存 Tuzi 配置失败: ${String(e)}`);
    } finally {
      setSavingTuzi(false);
    }
  };

  const envReady = !!envStatus?.ready;
  const aiConfigured = !!envStatus?.ai_configured;

  if (checking) {
    return (
      <div className="text-center py-6">
        <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto mb-3" />
        <p className="text-dark-300">正在检测系统环境...</p>
      </div>
    );
  }

  return (
    <div className={clsx(embedded ? 'bg-dark-700 rounded-2xl p-6 border border-dark-500' : '')}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">快速开始</h3>
            <p className="text-sm text-gray-400 mt-1">
              先完成基础环境，再快速接入 Tuzi API；你之后仍然可以在 AI 配置页接入其他模型提供商。
            </p>
          </div>
          {envReady && aiConfigured && (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-sm">
              <CheckCircle2 size={16} />
              已完成
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-dark-600">
            {envReady ? <CheckCircle className="text-green-400" size={18} /> : <Circle className="text-gray-500" size={18} />}
            <div className="flex-1">
              <p className="text-sm text-white font-medium">第 1 步：准备运行环境</p>
              <p className="text-xs text-gray-400">安装 Node.js 22+ 与 OpenClaw，并初始化本地配置目录。</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-dark-600">
            {aiConfigured ? <CheckCircle className="text-green-400" size={18} /> : <Circle className="text-gray-500" size={18} />}
            <div className="flex-1">
              <p className="text-sm text-white font-medium">第 2 步：接入 AI 模型</p>
              <p className="text-xs text-gray-400">默认推荐 Tuzi API 快速接入，也可以稍后去 AI 配置页添加其他 Provider。</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={clsx('p-2 rounded-lg', envStatus?.node_installed && envStatus.node_version_ok ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <p className="text-white font-medium">Node.js</p>
                <p className="text-sm text-dark-400">{envStatus?.node_version ? `${envStatus.node_version}${envStatus.node_version_ok ? ' ✓' : ' (需要 v22+)'}` : '未安装'}</p>
              </div>
            </div>
            {envStatus?.node_installed && envStatus.node_version_ok ? (
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            ) : (
              <button onClick={handleInstallNodejs} disabled={installing !== null} className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
                {installing === 'nodejs' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                安装
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={clsx('p-2 rounded-lg', envStatus?.openclaw_installed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>
                <Package className="w-5 h-5" />
              </div>
              <div>
                <p className="text-white font-medium">OpenClaw</p>
                <p className="text-sm text-dark-400">{envStatus?.openclaw_version || '未安装'}</p>
              </div>
            </div>
            {envStatus?.openclaw_installed ? (
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            ) : (
              <button
                onClick={handleInstallOpenclaw}
                disabled={installing !== null || !envStatus?.node_version_ok}
                className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
              >
                {installing === 'openclaw' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                安装
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {envReady && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 border-t border-dark-500 pt-6"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-claw-500/20 flex items-center justify-center">
                  <Sparkles size={20} className="text-claw-400" />
                </div>
                <div>
                  <p className="text-white font-medium">AI 接入方式</p>
                  <p className="text-sm text-gray-400">默认推荐 Tuzi API，桌面端仍保留其他 Provider 配置能力。</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <button
                  onClick={() => setMode('tuzi')}
                  className={clsx('rounded-xl border p-4 text-left transition-colors', mode === 'tuzi' ? 'border-claw-500 bg-claw-500/10' : 'border-dark-500 bg-dark-600 hover:bg-dark-500')}
                >
                  <p className="text-white font-medium">Tuzi API 快速接入</p>
                  <p className="text-sm text-gray-400 mt-1">按 Tuzi 的 Claude-Code / Codex 双分组模型配置，适合最快接入。</p>
                </button>
                <button
                  onClick={() => setMode('other')}
                  className={clsx('rounded-xl border p-4 text-left transition-colors', mode === 'other' ? 'border-claw-500 bg-claw-500/10' : 'border-dark-500 bg-dark-600 hover:bg-dark-500')}
                >
                  <p className="text-white font-medium">稍后配置其他 Provider</p>
                  <p className="text-sm text-gray-400 mt-1">跳过快速接入，稍后在 AI 配置页添加 OpenAI、Anthropic 或自定义接口。</p>
                </button>
              </div>

              {mode === 'tuzi' ? (
                <div className="bg-dark-700 rounded-2xl p-5 border border-dark-500 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">Tuzi API</p>
                      <p className="text-sm text-gray-400">
                        {aiSummary?.primary_model?.startsWith('tuzi-')
                          ? `当前正在使用 ${aiSummary.primary_model}`
                          : 'Tuzi 已配置时，当前未使用 Tuzi'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      已配置分组：{tuziConfig?.groups.filter((item) => item.configured).length || 0} / 2
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(['claude-code', 'codex'] as TuziGroup[]).map((group) => {
                      const config = tuziConfig?.groups.find((item) => item.group === group);
                      return (
                        <button
                          key={group}
                          onClick={() => {
                            setSelectedGroup(group);
                            setNotice(null);
                          }}
                          className={clsx('rounded-xl border p-4 text-left transition-colors', selectedGroup === group ? 'border-claw-500 bg-claw-500/10' : 'border-dark-500 bg-dark-600 hover:bg-dark-500')}
                        >
                          <p className="text-white font-medium">{group === 'claude-code' ? 'Claude-Code' : 'Codex'}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {config?.configured ? `已配置: ${config.primary_model}` : '未配置'}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">API Key</label>
                    <div className="relative">
                      <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="输入对应分组的 Tuzi API Key"
                        className="input-base pl-10"
                      />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={fetchModels}
                        disabled={fetchingModels}
                        className="btn-secondary flex items-center gap-2"
                      >
                        {fetchingModels ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        获取可用模型
                      </button>
                      {modelsSource && (
                        <p className="text-xs text-gray-500">
                          当前来源：{modelsSource === 'api' ? '接口实时拉取' : `本地缓存${cacheTimestamp ? `（${cacheTimestamp}）` : ''}`}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      模型列表
                      <span className="ml-2 text-xs text-gray-500">第一个模型将作为该分组主模型</span>
                    </label>
                    {warning && (
                      <div className="mb-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
                        实时拉取失败，已回退到本地缓存。{warning}
                      </div>
                    )}
                    {fetchError && (
                      <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                        {fetchError}
                      </div>
                    )}
                    <div className="grid md:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {displayModels.map((model) => (
                        <label
                          key={model.id}
                          className={clsx(
                            'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer',
                            model.selected ? 'border-claw-500 bg-claw-500/10' : 'border-dark-500 bg-dark-600'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={model.selected}
                            onChange={() => toggleModel(model.id)}
                            className="w-4 h-4"
                          />
                          <div className="min-w-0">
                            <span className="text-sm text-white break-all">{model.id}</span>
                            {model.unavailable && (
                              <p className="text-[11px] text-yellow-300 mt-1">当前配置中，接口未返回</p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                    {displayModels.length === 0 && (
                      <div className="rounded-xl border border-dashed border-dark-500 bg-dark-600/50 px-4 py-6 text-sm text-gray-400">
                        先输入 API Key 并获取模型列表。若接口和缓存都不可用，下面会开放手动输入。
                      </div>
                    )}
                  </div>

                  {manualEntryEnabled && (
                    <div className="space-y-2">
                      <p className="text-sm text-yellow-100">当前无法获取模型列表，可手动补充模型名称作为兜底。</p>
                      <div className="flex gap-2">
                        <input
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                          placeholder="手动输入模型名称"
                          className="input-base"
                        />
                        <button onClick={addCustomModel} className="btn-secondary whitespace-nowrap">
                          添加模型
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedModels.length > 0 && (
                    <div className="rounded-xl bg-dark-600 p-3 text-sm text-gray-300">
                      本次保存后该分组主模型：<span className="text-white font-medium">{selectedModels[0]}</span>
                    </div>
                  )}

                  {aiSummary?.primary_model && selectedModels.length > 0 && !aiSummary.primary_model.startsWith(`${selectedGroup === 'claude-code' ? 'tuzi-claude-code' : 'tuzi-codex'}/`) && (
                    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
                      当前默认模型是 <span className="font-medium">{aiSummary.primary_model}</span>。保存该分组后会询问你是否切换到 <span className="font-medium">{selectedGroup === 'claude-code' ? 'tuzi-claude-code' : 'tuzi-codex'}/{selectedModels[0]}</span>。
                    </div>
                  )}

                  {notice && (
                    <div className="rounded-xl border border-claw-500/30 bg-claw-500/10 p-4 text-sm text-claw-100">
                      {notice}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">
                      保存后会同步写入 `~/.openclaw/env` 和 `~/.openclaw/openclaw.json`，两个 Tuzi Provider 可同时保留。
                    </p>
                    <div className="flex items-center gap-2">
                      {tuziConfig?.groups.some((item) => item.configured) && (
                        <button onClick={onComplete} className="btn-secondary">
                          完成，稍后继续
                        </button>
                      )}
                      <button onClick={handleSaveTuzi} disabled={savingTuzi} className="btn-primary flex items-center gap-2">
                        {savingTuzi ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                        {tuziConfig?.groups.filter((item) => item.configured).length === 0 ? '保存并继续' : '保存该分组'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dark-500 bg-dark-700 p-5">
                  <p className="text-white font-medium mb-2">稍后在 AI 配置页继续</p>
                  <p className="text-sm text-gray-400 mb-4">
                    这会跳过当前的 Tuzi 快速接入。基础环境已准备好后，你可以在桌面端继续添加 OpenAI、Anthropic、DeepSeek 或自定义兼容接口。
                  </p>
                  <button onClick={onComplete} className="btn-secondary">
                    暂时跳过
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
