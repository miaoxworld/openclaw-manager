import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  Star,
  Settings2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Cpu,
  Server,
  Sparkles,
  Zap,
  CheckCircle,
  XCircle,
  Pencil,
} from 'lucide-react';
import clsx from 'clsx';
import { aiLogger } from '../../lib/logger';
import { api, TuziConfigOverview, TuziGroup } from '../../lib/tauri';
import { getFixedTuziModels, useTuziModelSelection } from '../../hooks/useTuziModelSelection';

const QUICK_ACCESS_PROVIDER_NAMES = new Set(['tuzi-claude-code', 'tuzi-codex', 'gac-claude', 'gac-codex']);
const QUICK_ACCESS_GROUPS: TuziGroup[] = ['claude-code', 'codex', 'gaccode'];

function getGroupLabel(group: TuziGroup): string {
  switch (group) {
    case 'claude-code':
      return 'Claude-Code';
    case 'codex':
      return 'Codex';
    case 'gaccode':
      return 'GACCode';
  }
}

function getGroupIcon(group: TuziGroup): string {
  switch (group) {
    case 'claude-code':
      return '🧠';
    case 'codex':
      return '⚡';
    case 'gaccode':
      return '🧩';
  }
}

function isFullModelRef(model: string): boolean {
  return model.includes('/');
}

// ============ 类型定义 ============

interface SuggestedModel {
  id: string;
  name: string;
  description: string | null;
  context_window: number | null;
  max_tokens: number | null;
  recommended: boolean;
}

interface OfficialProvider {
  id: string;
  name: string;
  icon: string;
  default_base_url: string | null;
  api_type: string;
  suggested_models: SuggestedModel[];
  requires_api_key: boolean;
  docs_url: string | null;
}

interface ConfiguredModel {
  full_id: string;
  id: string;
  name: string;
  api_type: string | null;
  context_window: number | null;
  max_tokens: number | null;
  is_primary: boolean;
}

interface ConfiguredProvider {
  name: string;
  base_url: string;
  api_key_masked: string | null;
  has_api_key: boolean;
  models: ConfiguredModel[];
}

interface AIConfigOverview {
  primary_model: string | null;
  configured_providers: ConfiguredProvider[];
  available_models: string[];
}

interface ModelConfig {
  id: string;
  name: string;
  api: string | null;
  input: string[];
  context_window: number | null;
  max_tokens: number | null;
  reasoning: boolean | null;
  cost: { input: number; output: number; cache_read: number; cache_write: number } | null;
}

interface AITestResult {
  success: boolean;
  provider: string;
  model: string;
  response: string | null;
  error: string | null;
  latency_ms: number | null;
}

interface ConfigInitResult {
  success: boolean;
  message: string;
  error: string | null;
}

// ============ 添加/编辑 Provider 对话框 ============

interface ProviderDialogProps {
  officialProviders: OfficialProvider[];
  onClose: () => void;
  onSave: () => void;
  // 编辑模式时传入现有配置
  editingProvider?: ConfiguredProvider | null;
}

function ProviderDialog({ officialProviders, onClose, onSave, editingProvider }: ProviderDialogProps) {
  const isEditing = !!editingProvider;
  const [step, setStep] = useState<'select' | 'configure'>(isEditing ? 'configure' : 'select');
  const [selectedOfficial, setSelectedOfficial] = useState<OfficialProvider | null>(() => {
    if (editingProvider) {
      return officialProviders.find(p => 
        editingProvider.name.includes(p.id) || p.id === editingProvider.name
      ) || null;
    }
    return null;
  });
  
  // 配置表单
  const [providerName, setProviderName] = useState(editingProvider?.name || '');
  const [baseUrl, setBaseUrl] = useState(editingProvider?.base_url || '');
  const [apiKey, setApiKey] = useState('');
  const [apiType, setApiType] = useState(() => {
    if (editingProvider) {
      const firstModel = editingProvider.models[0];
      return firstModel?.api_type || 'openai-completions';
    }
    return 'openai-completions';
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>(() => {
    if (editingProvider) {
      return editingProvider.models.map(m => m.id);
    }
    return [];
  });
  const [customModelId, setCustomModelId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showCustomUrlWarning, setShowCustomUrlWarning] = useState(false);

  // 检查是否是官方 Provider 名字但使用了自定义地址
  const isCustomUrlWithOfficialName = (() => {
    const official = officialProviders.find(p => p.id === providerName);
    if (official && official.default_base_url && baseUrl !== official.default_base_url) {
      return true;
    }
    return false;
  })();
  
  const handleSelectOfficial = (provider: OfficialProvider) => {
    setSelectedOfficial(provider);
    setProviderName(provider.id);
    setBaseUrl(provider.default_base_url || '');
    setApiType(provider.api_type);
    // 预选推荐模型
    const recommended = provider.suggested_models.filter(m => m.recommended).map(m => m.id);
    setSelectedModels(recommended.length > 0 ? recommended : [provider.suggested_models[0]?.id].filter(Boolean));
    setFormError(null);
    setShowCustomUrlWarning(false);
    setStep('configure');
  };

  const handleSelectCustom = () => {
    setSelectedOfficial(null);
    setProviderName('');
    setBaseUrl('');
    setApiType('openai-completions');
    setSelectedModels([]);
    setFormError(null);
    setShowCustomUrlWarning(false);
    setStep('configure');
  };

  const toggleModel = (modelId: string) => {
    setFormError(null);
    setSelectedModels(prev => 
      prev.includes(modelId) 
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  const addCustomModel = () => {
    if (customModelId && !selectedModels.includes(customModelId)) {
      setFormError(null);
      setSelectedModels(prev => [...prev, customModelId]);
      setCustomModelId('');
    }
  };

  // 自动建议使用自定义名称
  const suggestedName = (() => {
    if (isCustomUrlWithOfficialName && selectedOfficial) {
      return `${selectedOfficial.id}-custom`;
    }
    return null;
  })();

  const handleApplySuggestedName = () => {
    if (suggestedName) {
      setProviderName(suggestedName);
    }
  };

  const handleSave = async (forceOverride: boolean = false) => {
    setFormError(null);
    
    if (!providerName || !baseUrl || selectedModels.length === 0) {
      setFormError('请填写完整的 Provider 信息和至少选择一个模型');
      return;
    }

    // 如果使用官方名字但自定义了地址，给出警告
    if (isCustomUrlWithOfficialName && !forceOverride) {
      setShowCustomUrlWarning(true);
      return;
    }
    
    setSaving(true);
    setShowCustomUrlWarning(false);
    try {
      // 构建模型配置
      const models: ModelConfig[] = selectedModels.map(modelId => {
        const suggested = selectedOfficial?.suggested_models.find(m => m.id === modelId);
        // 编辑模式下，保留原有模型的配置
        const existingModel = editingProvider?.models.find(m => m.id === modelId);
        return {
          id: modelId,
          name: suggested?.name || existingModel?.name || modelId,
          api: apiType,
          input: ['text', 'image'],
          context_window: suggested?.context_window || existingModel?.context_window || 200000,
          max_tokens: suggested?.max_tokens || existingModel?.max_tokens || 8192,
          reasoning: false,
          cost: null,
        };
      });

      await invoke('save_provider', {
        providerName,
        baseUrl,
        apiKey: apiKey || null,
        apiType,
        models,
      });

      aiLogger.info(`✓ Provider ${providerName} 已${isEditing ? '更新' : '保存'}`);
      onSave();
      onClose();
    } catch (e) {
      aiLogger.error('保存 Provider 失败', e);
      setFormError('保存失败: ' + String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-dark-800 rounded-2xl border border-dark-600 w-full max-w-2xl max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-dark-600 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            {isEditing ? <Settings2 size={20} className="text-claw-400" /> : <Plus size={20} className="text-claw-400" />}
            {isEditing 
              ? `编辑 Provider: ${editingProvider?.name}` 
              : (step === 'select' ? '添加 AI Provider' : `配置 ${selectedOfficial?.name || '自定义 Provider'}`)}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-140px)]">
          <AnimatePresence mode="wait">
            {step === 'select' ? (
              <motion.div
                key="select"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {/* 官方 Provider */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-400">官方 Provider</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {officialProviders.map(provider => (
                <button
                  key={provider.id}
                        onClick={() => handleSelectOfficial(provider)}
                        className="flex items-center gap-3 p-4 rounded-xl bg-dark-700 border border-dark-500 hover:border-claw-500/50 hover:bg-dark-600 transition-all text-left group"
                >
                  <span className="text-2xl">{provider.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white truncate">{provider.name}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {provider.suggested_models.length} 个模型
                          </p>
                    </div>
                        <ChevronRight size={16} className="text-gray-500 group-hover:text-claw-400 transition-colors" />
                </button>
                    ))}
          </div>
        </div>

                {/* 自定义 Provider */}
                <div className="pt-4 border-t border-dark-600">
                  <button
                    onClick={handleSelectCustom}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-dark-500 hover:border-claw-500/50 text-gray-400 hover:text-white transition-all"
                  >
                    <Settings2 size={18} />
                    <span>自定义 Provider (兼容 OpenAI/Anthropic API)</span>
                  </button>
                </div>
              </motion.div>
            ) : (
          <motion.div
                key="configure"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-5"
              >
                {/* Provider 名称 */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    Provider 名称
                    <span className="text-gray-600 text-xs ml-2">(用于配置标识，如 anthropic-custom)</span>
                  </label>
                  <input
                    type="text"
                    value={providerName}
                    onChange={e => { setFormError(null); setProviderName(e.target.value); }}
                    placeholder="如: anthropic-custom, my-openai"
                    className={clsx(
                      'input-base',
                      isCustomUrlWithOfficialName && 'border-yellow-500/50'
                    )}
                    disabled={isEditing}
                  />
                  {isEditing && (
                    <p className="text-xs text-gray-500 mt-1">
                      Provider 名称不可修改，如需更改请删除后重新创建
                    </p>
                  )}
                  {isCustomUrlWithOfficialName && !isEditing && (
                    <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <p className="text-xs text-yellow-400">
                        ⚠️ 您使用的是官方 Provider 名称，但修改了 API 地址。建议使用不同的名称以避免配置冲突。
                      </p>
                      <button
                        type="button"
                        onClick={handleApplySuggestedName}
                        className="mt-1 text-xs text-yellow-300 hover:text-yellow-200 underline"
                      >
                        使用建议名称: {suggestedName}
                      </button>
                    </div>
                  )}
                </div>

                {/* API 地址 */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">API 地址</label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={e => { setFormError(null); setBaseUrl(e.target.value); }}
                    placeholder="https://api.example.com/v1"
                    className="input-base"
                  />
                </div>

              {/* API Key */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    API Key
                    {!selectedOfficial?.requires_api_key && (
                      <span className="text-gray-600 text-xs ml-2">(可选)</span>
                    )}
                  </label>
                  {/* 编辑模式下显示当前 API Key 状态 */}
                  {isEditing && editingProvider?.has_api_key && (
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <span className="text-gray-500">当前:</span>
                      <code className="px-2 py-0.5 bg-dark-600 rounded text-gray-400">
                        {editingProvider.api_key_masked}
                      </code>
                      <span className="text-green-400 text-xs">✓ 已配置</span>
                    </div>
                  )}
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder={isEditing && editingProvider?.has_api_key 
                        ? "留空保持原有 API Key 不变，或输入新的 Key" 
                        : "sk-..."}
                      className="input-base pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                    >
                      {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {isEditing && editingProvider?.has_api_key && (
                    <p className="text-xs text-gray-500 mt-1">
                      💡 如果不需要更改 API Key，请保持为空
                    </p>
                  )}
                </div>

                {/* API 类型 */}
                <div>
                  <label className="block text-sm text-gray-400 mb-2">API 类型</label>
                  <select
                    value={apiType}
                    onChange={e => setApiType(e.target.value)}
                    className="input-base"
                  >
                    <option value="openai-completions">OpenAI 兼容 (openai-completions)</option>
                    <option value="anthropic-messages">Anthropic 兼容 (anthropic-messages)</option>
                  </select>
                </div>

                {/* 模型选择 */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                    选择模型
                    <span className="text-gray-600 text-xs ml-2">
                      (已选 {selectedModels.length} 个)
                    </span>
                  </label>
                  
                  {/* 预设模型 */}
                  {selectedOfficial && (
                    <div className="space-y-2 mb-3">
                      {selectedOfficial.suggested_models.map(model => (
                        <button
                          key={model.id}
                          onClick={() => toggleModel(model.id)}
                          className={clsx(
                            'w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left',
                            selectedModels.includes(model.id)
                              ? 'bg-claw-500/20 border-claw-500'
                              : 'bg-dark-700 border-dark-500 hover:border-dark-400'
                          )}
                        >
                          <div>
                            <p className={clsx(
                              'text-sm font-medium',
                              selectedModels.includes(model.id) ? 'text-white' : 'text-gray-300'
                            )}>
                              {model.name}
                              {model.recommended && (
                                <span className="ml-2 text-xs text-claw-400">推荐</span>
                              )}
                            </p>
                            {model.description && (
                              <p className="text-xs text-gray-500 mt-0.5">{model.description}</p>
                            )}
                          </div>
                          {selectedModels.includes(model.id) && (
                            <Check size={16} className="text-claw-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 自定义模型输入 */}
                  <div className="flex gap-2">
                  <input
                    type="text"
                      value={customModelId}
                      onChange={e => setCustomModelId(e.target.value)}
                      placeholder="输入自定义模型 ID"
                      className="input-base flex-1"
                      onKeyDown={e => e.key === 'Enter' && addCustomModel()}
                    />
                    <button
                      onClick={addCustomModel}
                      disabled={!customModelId}
                      className="btn-secondary px-4"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  {/* 已添加的自定义模型 */}
                  {selectedModels.filter(id => !selectedOfficial?.suggested_models.find(m => m.id === id)).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedModels
                        .filter(id => !selectedOfficial?.suggested_models.find(m => m.id === id))
                        .map(modelId => (
                          <span
                            key={modelId}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-dark-600 rounded-lg text-sm text-gray-300"
                          >
                            {modelId}
                            <button
                              onClick={() => toggleModel(modelId)}
                              className="text-gray-500 hover:text-red-400"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                {/* 文档链接 */}
                {selectedOfficial?.docs_url && (
                  <a
                    href={selectedOfficial.docs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-claw-400 hover:text-claw-300"
                  >
                    <ExternalLink size={14} />
                    查看官方文档
                  </a>
                )}

                {/* 表单错误提示 */}
                {formError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                  >
                    <p className="text-red-400 text-sm flex items-center gap-2">
                      <XCircle size={16} />
                      {formError}
                    </p>
                  </motion.div>
                )}

                {/* 自定义 URL 警告对话框 */}
                {showCustomUrlWarning && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg space-y-3"
                  >
                    <p className="text-yellow-400 text-sm">
                      ⚠️ 您使用的是官方 Provider 名称 "{providerName}"，但修改了 API 地址。
                      这可能导致配置被 OpenClaw 内置设置覆盖。
                    </p>
                    <p className="text-yellow-300 text-sm">
                      建议使用不同的名称，如 "{suggestedName}"
                    </p>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleApplySuggestedName}
                        className="btn-secondary text-sm py-2 px-3"
                      >
                        使用建议名称
                      </button>
                      <button
                        onClick={() => handleSave(true)}
                        className="btn-primary text-sm py-2 px-3"
                      >
                        仍然保存
                      </button>
                      <button
                        onClick={() => setShowCustomUrlWarning(false)}
                        className="text-sm text-gray-400 hover:text-white px-3"
                      >
                        取消
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
              </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-dark-600 flex justify-between">
          {step === 'configure' && !isEditing && (
            <button
              onClick={() => setStep('select')}
              className="btn-secondary"
            >
              返回
            </button>
          )}
          <div className="flex-1" />
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">
              取消
            </button>
            {step === 'configure' && !showCustomUrlWarning && (
              <button
                onClick={() => handleSave()}
                disabled={saving || !providerName || !baseUrl || selectedModels.length === 0}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {isEditing ? '更新' : '保存'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============ Provider 卡片 ============

interface ProviderCardProps {
  provider: ConfiguredProvider;
  officialProviders: OfficialProvider[];
  onOpenActions: (target: ModelActionTarget) => void;
  onRefresh: () => void;
  onEdit: (provider: ConfiguredProvider) => void;
}

function ProviderCard({ provider, officialProviders, onOpenActions, onRefresh, onEdit }: ProviderCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 查找官方 Provider 信息
  const officialInfo = officialProviders.find(p => 
    provider.name.includes(p.id) || p.id === provider.name
  );

  // 检查是否使用了自定义地址
  const isCustomUrl = officialInfo && officialInfo.default_base_url && provider.base_url !== officialInfo.default_base_url;

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
    setDeleteError(null);
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await invoke('delete_provider', { providerName: provider.name });
      setShowDeleteConfirm(false);
      onRefresh();
    } catch (e) {
      setDeleteError('删除失败: ' + String(e));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setDeleteError(null);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-dark-700 rounded-xl border border-dark-500 overflow-hidden"
    >
      {/* 头部 */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-dark-600/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xl">{officialInfo?.icon || '🔌'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white">{provider.name}</h3>
            {provider.has_api_key && (
              <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                已配置
              </span>
            )}
            {isCustomUrl && (
              <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                自定义地址
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{provider.base_url}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{provider.models.length} 模型</span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }}>
            <ChevronDown size={18} className="text-gray-500" />
          </motion.div>
        </div>
      </div>

      {/* 展开内容 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-dark-600"
          >
            <div className="p-4 space-y-3">
              {/* API Key 信息 */}
              {provider.api_key_masked && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">API Key:</span>
                  <code className="px-2 py-0.5 bg-dark-600 rounded text-gray-400">
                    {provider.api_key_masked}
                  </code>
                </div>
              )}

              {/* 模型列表 */}
              <div className="space-y-2">
                {provider.models.map(model => (
                  <div
                    key={model.full_id}
                    className={clsx(
                      'flex items-center justify-between p-3 rounded-lg border transition-all',
                      model.is_primary
                        ? 'bg-claw-500/10 border-claw-500/50'
                        : 'bg-dark-600 border-dark-500'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Cpu size={16} className={model.is_primary ? 'text-claw-400' : 'text-gray-500'} />
                      <div>
                        <p className={clsx(
                            'text-sm font-medium',
                          model.is_primary ? 'text-white' : 'text-gray-300'
                        )}>
                          {model.name}
                          {model.is_primary && (
                            <span className="ml-2 text-xs text-claw-400">
                              <Star size={12} className="inline -mt-0.5" /> 主模型
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{model.full_id}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 删除确认对话框 */}
              {showDeleteConfirm && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg space-y-3"
                >
                  <p className="text-red-400 text-sm">
                    ⚠️ 确定要删除 Provider "{provider.name}" 吗？这将同时删除其下所有模型配置。
                  </p>
                  {deleteError && (
                    <p className="text-red-300 text-sm bg-red-500/20 p-2 rounded">
                      {deleteError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteConfirm}
                      disabled={deleting}
                      className="btn-primary text-sm py-2 px-3 bg-red-500 hover:bg-red-600 flex items-center gap-1"
                    >
                      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      确认删除
                    </button>
                    <button
                      onClick={handleDeleteCancel}
                      disabled={deleting}
                      className="btn-secondary text-sm py-2 px-3"
                    >
                      取消
                    </button>
                  </div>
                </motion.div>
              )}

              {/* 操作按钮 */}
              {!showDeleteConfirm && (
                <div className="flex justify-end gap-4 pt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenActions({
                        kind: 'provider',
                        providerId: provider.name,
                        displayName: provider.name,
                        models: provider.models.map(model => ({
                          id: model.id,
                          fullId: model.full_id,
                          providerId: provider.name,
                          isPrimary: model.is_primary,
                        })),
                      });
                    }}
                    className="flex items-center gap-1 text-sm text-gray-300 hover:text-white transition-colors"
                  >
                    <Settings2 size={14} />
                    模型操作
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(provider);
                    }}
                    className="flex items-center gap-1 text-sm text-claw-400 hover:text-claw-300 transition-colors"
                  >
                    <Pencil size={14} />
                    编辑 Provider
                  </button>
                  <button
                    onClick={handleDeleteClick}
                    disabled={deleting}
                    className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    删除 Provider
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

type ModelActionTarget = {
  kind: 'provider' | 'tuzi-group';
  providerId: string;
  displayName: string;
  models: Array<{ id: string; fullId: string; providerId: string; isPrimary: boolean }>;
  group?: TuziGroup;
};

interface TuziGroupCardProps {
  group: TuziGroup;
  groupConfig: TuziConfigOverview['groups'][number] | undefined;
  isInUse: boolean;
  onConfigure: () => void;
  onOpenActions: (target: ModelActionTarget) => void;
}

function TuziGroupCard({ group, groupConfig, isInUse, onConfigure, onOpenActions }: TuziGroupCardProps) {
  const [expanded, setExpanded] = useState(true);
  const configured = !!groupConfig?.configured;
  const displayName = getGroupLabel(group);
  const models = groupConfig?.models || [];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-dark-700 rounded-xl border border-dark-500 overflow-hidden"
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-dark-600/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xl">{getGroupIcon(group)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-white">{displayName}</h3>
            {configured && (
              <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                已配置
              </span>
            )}
            {isInUse && (
              <span className="px-1.5 py-0.5 bg-claw-500/20 text-claw-300 text-xs rounded">
                当前使用中
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">
            {configured ? `主模型: ${groupConfig?.primary_model}` : '尚未配置'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{configured ? `${models.length} 模型` : '未配置'}</span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }}>
            <ChevronDown size={18} className="text-gray-500" />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-dark-600"
          >
            <div className="p-4 space-y-3">
              {configured ? (
                <>
                  {groupConfig?.api_key_masked && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">API Key:</span>
                      <code className="px-2 py-0.5 bg-dark-600 rounded text-gray-400">
                        {groupConfig.api_key_masked}
                      </code>
                    </div>
                  )}

                  <div className="space-y-2">
                    {models.map((model) => {
                      const isPrimary = groupConfig?.primary_model === model;
                      const fullId = isFullModelRef(model) ? model : `${groupConfig?.provider_id}/${model}`;
                      const displayModel = isFullModelRef(model) ? model.split('/').slice(1).join('/') : model;
                      return (
                        <div
                          key={model}
                          className={clsx(
                            'flex items-center justify-between p-3 rounded-lg border transition-all',
                            isPrimary
                              ? 'bg-claw-500/10 border-claw-500/50'
                              : 'bg-dark-600 border-dark-500'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Cpu size={16} className={isPrimary ? 'text-claw-400' : 'text-gray-500'} />
                            <div>
                              <p className={clsx('text-sm font-medium', isPrimary ? 'text-white' : 'text-gray-300')}>
                                {displayModel}
                                {isPrimary && (
                                  <span className="ml-2 text-xs text-claw-400">
                                    <Star size={12} className="inline -mt-0.5" /> 主模型
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500">{fullId}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    {models.length > 0 && groupConfig && (
                      <button
                        onClick={() => onOpenActions({
                          kind: 'tuzi-group',
                          group,
                          providerId: groupConfig.provider_id,
                          displayName,
                          models: models.map((model) => ({
                            id: isFullModelRef(model) ? model.split('/').slice(1).join('/') : model,
                            fullId: isFullModelRef(model) ? model : `${groupConfig.provider_id}/${model}`,
                            providerId: isFullModelRef(model)
                              ? model.split('/')[0]
                              : groupConfig.provider_id,
                            isPrimary: groupConfig.primary_model === model,
                          })),
                        })}
                        className="btn-secondary text-sm py-2 px-3"
                      >
                        模型操作
                      </button>
                    )}
                    <button onClick={onConfigure} className="btn-secondary text-sm py-2 px-3">
                      编辑分组
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400">
                    该分组尚未配置。保存后会同步写入 env 与 openclaw.json，并保留在快速接入配置中。
                  </p>
                  <div className="flex gap-2">
                    <button onClick={onConfigure} className="btn-primary text-sm py-2 px-3">
                      配置分组
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface ModelActionDialogProps {
  target: ModelActionTarget;
  onClose: () => void;
  onSetPrimary: (modelId: string) => Promise<void>;
  onTestModel: (providerId: string, modelId: string) => Promise<AITestResult>;
}

function ModelActionDialog({ target, onClose, onSetPrimary, onTestModel }: ModelActionDialogProps) {
  const initialPrimary = target.models.find((model) => model.isPrimary)?.fullId || target.models[0]?.fullId || '';
  const initialTest = target.models[0]?.id || '';
  const [selectedPrimaryModelId, setSelectedPrimaryModelId] = useState(initialPrimary);
  const [selectedTestModelId, setSelectedTestModelId] = useState(initialTest);
  const [settingPrimary, setSettingPrimary] = useState(false);
  const [dialogTesting, setDialogTesting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogTestResult, setDialogTestResult] = useState<AITestResult | null>(null);

  const handleSetPrimary = async () => {
    if (!selectedPrimaryModelId) return;
    setSettingPrimary(true);
    setDialogError(null);
    try {
      await onSetPrimary(selectedPrimaryModelId);
      onClose();
    } catch (e) {
      setDialogError(String(e));
    } finally {
      setSettingPrimary(false);
    }
  };

  const handleTestModel = async () => {
    if (!selectedTestModelId) return;
    setDialogTesting(true);
    setDialogError(null);
    setDialogTestResult(null);
    try {
      const selectedModel = target.models.find((model) => model.id === selectedTestModelId) || target.models[0];
      const result = await onTestModel(selectedModel.providerId, selectedTestModelId);
      setDialogTestResult(result);
    } catch (e) {
      setDialogError(String(e));
    } finally {
      setDialogTesting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <div className="w-full max-w-3xl rounded-2xl border border-dark-500 bg-dark-700 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">模型操作</h3>
            <p className="text-sm text-gray-400">
              {target.kind === 'tuzi-group' ? `Tuzi 分组: ${target.displayName}` : `Provider: ${target.displayName}`}
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-white">关闭</button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-white">
                设为主模型
              </h4>
              <p className="text-xs text-gray-500 mt-1">
                选择一个模型作为当前默认推理模型。
              </p>
            </div>
            <div className="space-y-2">
              {target.models.map((model) => (
                <label
                  key={`primary-${model.fullId}`}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer',
                    selectedPrimaryModelId === model.fullId ? 'border-claw-500 bg-claw-500/10' : 'border-dark-500 bg-dark-600'
                  )}
                >
                  <input
                    type="radio"
                    name="primary-model"
                    checked={selectedPrimaryModelId === model.fullId}
                    onChange={() => setSelectedPrimaryModelId(model.fullId)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-white">{model.id}</p>
                    <p className="text-xs text-gray-500">{model.fullId}</p>
                  </div>
                  {model.isPrimary && (
                    <span className="text-xs text-claw-300">当前主模型</span>
                  )}
                </label>
              ))}
            </div>
            <button
              onClick={handleSetPrimary}
              disabled={settingPrimary || !selectedPrimaryModelId}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {settingPrimary ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} />}
              设为主模型
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-white">测试模型连通性</h4>
              <p className="text-xs text-gray-500 mt-1">选择一个模型，单独验证当前 provider/model 的可用性。</p>
            </div>
            <div className="space-y-2">
              {target.models.map((model) => (
                <label
                  key={`test-${model.fullId}`}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer',
                    selectedTestModelId === model.id ? 'border-claw-500 bg-claw-500/10' : 'border-dark-500 bg-dark-600'
                  )}
                >
                  <input
                    type="radio"
                    name="test-model"
                    checked={selectedTestModelId === model.id}
                    onChange={() => setSelectedTestModelId(model.id)}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-white">{model.id}</p>
                    <p className="text-xs text-gray-500">{model.fullId}</p>
                  </div>
                </label>
              ))}
            </div>
            <button
              onClick={handleTestModel}
              disabled={dialogTesting || !selectedTestModelId}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              {dialogTesting ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              测试连通性
            </button>
          </div>
        </div>

        {dialogError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words pr-1">
              {dialogError}
            </div>
          </div>
        )}

        {dialogTestResult && (
          <div
            className={clsx(
              'rounded-xl p-4 border',
              dialogTestResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
            )}
          >
            <div className="flex items-center gap-3 mb-2">
              {dialogTestResult.success ? (
                <CheckCircle size={20} className="text-green-400" />
              ) : (
                <XCircle size={20} className="text-red-400" />
              )}
              <div className="flex-1">
                <p className={clsx('font-medium', dialogTestResult.success ? 'text-green-400' : 'text-red-400')}>
                  {dialogTestResult.success ? '连接成功' : '连接失败'}
                </p>
                <p className="text-xs text-gray-400">
                  {dialogTestResult.provider}/{dialogTestResult.model}
                </p>
                {dialogTestResult.latency_ms && (
                  <p className="text-xs text-gray-400">响应时间: {dialogTestResult.latency_ms}ms</p>
                )}
              </div>
            </div>
            {dialogTestResult.response && (
              <div className="mt-2 p-3 bg-dark-800 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">AI 响应:</p>
                <p className="text-sm text-white whitespace-pre-wrap">{dialogTestResult.response}</p>
              </div>
            )}
            {dialogTestResult.error && (
              <div className="mt-2 p-3 bg-red-500/10 rounded-lg">
                <p className="text-xs text-red-400 mb-1">错误信息:</p>
                <div className="max-h-48 overflow-y-auto rounded-md bg-dark-800/60 p-3 pr-2">
                  <p className="text-sm text-red-300 whitespace-pre-wrap break-words">{dialogTestResult.error}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface TuziDialogProps {
  tuziConfig: TuziConfigOverview | null;
  initialGroup: TuziGroup;
  onClose: () => void;
  onSave: () => void;
}

function TuziDialog({ tuziConfig, initialGroup, onClose, onSave }: TuziDialogProps) {
  const [group, setGroup] = useState<TuziGroup>(initialGroup);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fixedModels = getFixedTuziModels(group);
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
    fixedGroup: hookFixedGroup,
    modelsSource,
    cacheTimestamp,
    warning,
    toggleModel,
    addCustomModel,
    fetchModels,
  } = useTuziModelSelection(group, tuziConfig);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('请输入 API Key');
      return;
    }
    if (selectedModels.length === 0) {
      setError('请至少选择一个模型');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.saveTuziConfig(group, apiKey.trim(), selectedModels);
      onSave();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <div className="w-full max-w-3xl rounded-2xl border border-dark-500 bg-dark-700 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Tuzi API 快速接入</h3>
            <p className="text-sm text-gray-400">配置 Claude-Code、Codex 或 GACCode 分组，同时保留其他 Provider 能力。</p>
          </div>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-white">关闭</button>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          {QUICK_ACCESS_GROUPS.map((item) => {
            const current = tuziConfig?.groups.find((groupItem) => groupItem.group === item);
            return (
              <button
                key={item}
                onClick={() => setGroup(item)}
                className={clsx('rounded-xl border p-4 text-left', group === item ? 'border-claw-500 bg-claw-500/10' : 'border-dark-500 bg-dark-600')}
              >
                <p className="text-white font-medium">{getGroupLabel(item)}</p>
                <p className="text-xs text-gray-400 mt-1">{current?.configured ? `已配置: ${current.primary_model}` : '未配置'}</p>
              </button>
            );
          })}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">API Key</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hookFixedGroup ? '输入 GACCode API Key' : '输入该分组对应的 Tuzi API Key'}
            className="input-base"
          />
          {!hookFixedGroup && (
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
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">
            模型列表
            <span className="ml-2 text-xs text-gray-500">
              {hookFixedGroup ? '固定模型会自动写入' : '第一个模型将作为该分组主模型'}
            </span>
          </label>
          {warning && !hookFixedGroup && (
            <div className="mb-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
              实时拉取失败，已回退到本地缓存。{warning}
            </div>
          )}
          {fetchError && !hookFixedGroup && (
            <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {fetchError}
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
            {displayModels.map((model) => (
              <label
                key={model.id}
                className={clsx('flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer', model.selected ? 'border-claw-500 bg-claw-500/10' : 'border-dark-500 bg-dark-600')}
              >
                <input
                  type="checkbox"
                  checked={model.selected}
                  onChange={() => !hookFixedGroup && toggleModel(model.id)}
                  disabled={hookFixedGroup}
                  className="w-4 h-4"
                />
                <div className="min-w-0">
                  <span className="text-sm text-white break-all">
                    {hookFixedGroup ? (model.id.startsWith('gpt-') ? `gac-codex/${model.id}` : `gac-claude/${model.id}`) : model.id}
                  </span>
                  {model.unavailable && (
                    <p className="text-[11px] text-yellow-300 mt-1">当前配置中，接口未返回</p>
                  )}
                </div>
              </label>
            ))}
          </div>
          {displayModels.length === 0 && (
            <div className="rounded-xl border border-dashed border-dark-500 bg-dark-600/50 px-4 py-6 text-sm text-gray-400">
              {hookFixedGroup
                ? 'GACCode 会直接写入固定模型，不需要额外拉取。'
                : '先输入 API Key 并获取模型列表。若接口和缓存都不可用，下面会开放手动输入。'}
            </div>
          )}
        </div>

        {manualEntryEnabled && !hookFixedGroup && (
          <div className="space-y-2">
            <p className="text-sm text-yellow-100">当前无法获取模型列表，可手动补充模型名称作为兜底。</p>
            <div className="flex gap-2">
              <input
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="手动输入模型名称"
                className="input-base"
              />
              <button onClick={addCustomModel} className="btn-secondary whitespace-nowrap">添加模型</button>
            </div>
          </div>
        )}

        {selectedModels.length > 0 && (
          <div className="rounded-xl bg-dark-600 p-3 text-sm text-gray-300">
            默认模型：<span className="text-white font-medium">{hookFixedGroup ? 'gac-claude/claude-opus-4-6' : selectedModels[0]}</span>
          </div>
        )}

        {hookFixedGroup && fixedModels.length > 0 && (
          <div className="rounded-xl border border-dark-500 bg-dark-600/60 p-4 text-sm text-gray-300">
            GACCode 将自动创建两个 Provider：<span className="text-white">gac-claude</span> 与 <span className="text-white">gac-codex</span>。
          </div>
        )}

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">取消</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            保存 Tuzi 配置
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ============ 主组件 ============

export function AIConfig() {
  const [loading, setLoading] = useState(true);
  const [officialProviders, setOfficialProviders] = useState<OfficialProvider[]>([]);
  const [aiConfig, setAiConfig] = useState<AIConfigOverview | null>(null);
  const [tuziConfig, setTuziConfig] = useState<TuziConfigOverview | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showTuziDialog, setShowTuziDialog] = useState(false);
  const [tuziDialogGroup, setTuziDialogGroup] = useState<TuziGroup>('claude-code');
  const [editingProvider, setEditingProvider] = useState<ConfiguredProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AITestResult | null>(null);
  const [modelActionTarget, setModelActionTarget] = useState<ModelActionTarget | null>(null);
  const [initializingConfig, setInitializingConfig] = useState(false);

  const handleEditProvider = (provider: ConfiguredProvider) => {
    setEditingProvider(provider);
    setShowAddDialog(true);
  };

  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setEditingProvider(null);
  };

  const runAITest = async () => {
    aiLogger.action('测试 AI 连接');
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<AITestResult>('test_ai_connection');
      setTestResult(result);
      if (result.success) {
        aiLogger.info(`✅ AI 连接测试成功，延迟: ${result.latency_ms}ms`);
      } else {
        aiLogger.warn(`❌ AI 连接测试失败: ${result.error}`);
      }
    } catch (e) {
      aiLogger.error('AI 测试失败', e);
      setTestResult({
        success: false,
        provider: 'unknown',
        model: 'unknown',
        response: null,
        error: String(e),
        latency_ms: null,
      });
    } finally {
      setTesting(false);
    }
  };

  const runModelTest = async (providerId: string, modelId: string): Promise<AITestResult> => {
    try {
      return await api.testModelConnection(providerId, modelId);
    } catch (e) {
      return {
        success: false,
        provider: providerId,
        model: modelId,
        response: null,
        error: String(e),
        latency_ms: null,
      };
    }
  };

  const loadData = useCallback(async () => {
    aiLogger.info('AIConfig 组件加载数据...');
    setLoading(true);
    setError(null);
    
    try {
      const [officials, config, tuzi] = await Promise.all([
        invoke<OfficialProvider[]>('get_official_providers'),
        invoke<AIConfigOverview>('get_ai_config'),
        api.getTuziConfig(),
      ]);
      setOfficialProviders(officials);
      setAiConfig(config);
      setTuziConfig(tuzi);
      aiLogger.info(`加载完成: ${officials.length} 个官方 Provider, ${config.configured_providers.length} 个已配置`);
    } catch (e) {
      aiLogger.error('加载 AI 配置失败', e);
      setAiConfig(null);
      setTuziConfig(null);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const normalProviders = aiConfig?.configured_providers.filter(provider => !QUICK_ACCESS_PROVIDER_NAMES.has(provider.name)) || [];
  const invalidConfigError = !!error && error.includes('解析配置文件失败');

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSetPrimary = async (modelId: string) => {
    try {
      await api.setPrimaryModel(modelId);
      aiLogger.info(`主模型已设置为: ${modelId}`);
      await loadData();
    } catch (e) {
      aiLogger.error('设置主模型失败', e);
      throw e;
    }
  };

  const handleInitConfig = async () => {
    setInitializingConfig(true);
    setError(null);
    try {
      const result = await invoke<ConfigInitResult>('init_openclaw_config');
      if (!result.success) {
        setError(result.error || result.message);
        return;
      }
      await loadData();
    } catch (e) {
      aiLogger.error('初始化配置失败', e);
      setError(String(e));
      setLoading(false);
    } finally {
      setInitializingConfig(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-claw-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-4xl space-y-6">
        {/* 错误提示 */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-300">
            <p className="font-medium mb-1">加载配置失败</p>
            <p className="text-sm text-red-400">{error}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {invalidConfigError && (
                <button
                  onClick={handleInitConfig}
                  disabled={initializingConfig}
                  className="btn-secondary flex items-center gap-2"
                >
                  {initializingConfig ? <Loader2 size={16} className="animate-spin" /> : <Settings2 size={16} />}
                  初始化配置
                </button>
              )}
              <button
                onClick={loadData}
                disabled={initializingConfig}
                className="text-sm text-red-300 hover:text-white underline disabled:opacity-50"
              >
                重试
              </button>
            </div>
          </div>
        )}

        {invalidConfigError && !aiConfig ? (
          <div className="bg-dark-700/50 rounded-xl p-4 border border-dark-500">
            <h4 className="text-sm font-medium text-gray-400 mb-2">恢复建议</h4>
            <ul className="text-sm text-gray-500 space-y-1">
              <li>• 当前 `openclaw.json` 不是空文件，而是内容损坏，系统不会自动覆盖它。</li>
              <li>• 你可以先点击“初始化配置”恢复到可编辑状态，再重新接入 Provider。</li>
              <li>• 如果你想保留现场，也可以先手动备份 `~/.openclaw/openclaw.json`。</li>
            </ul>
          </div>
        ) : (
          <>

        {/* 概览卡片 */}
        <div className="bg-gradient-to-br from-dark-700 to-dark-800 rounded-2xl p-6 border border-dark-500">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Sparkles size={22} className="text-claw-400" />
                AI 模型配置
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                管理 OpenClaw 使用的 AI Provider 和模型
              </p>
            </div>
            <button
              onClick={() => setShowAddDialog(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              添加 Provider
            </button>
          </div>

          {/* 主模型显示 */}
          <div className="bg-dark-600/50 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-claw-500/20 flex items-center justify-center">
              <Star size={24} className="text-claw-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-400">当前主模型</p>
              {aiConfig?.primary_model ? (
                <p className="text-lg font-medium text-white">{aiConfig.primary_model}</p>
              ) : (
                <p className="text-lg text-gray-500">未设置</p>
              )}
            </div>
            <div className="text-right mr-4">
              <p className="text-sm text-gray-500">
                {aiConfig?.configured_providers.length || 0} 个 Provider
              </p>
              <p className="text-sm text-gray-500">
                {aiConfig?.available_models.length || 0} 个可用模型
              </p>
            </div>
            <button
              onClick={runAITest}
              disabled={testing || !aiConfig?.primary_model}
              className="btn-secondary flex items-center gap-2"
            >
              {testing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                <Zap size={16} />
              )}
              测试连接
            </button>
          </div>

          {/* AI 测试结果 */}
          {testResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx(
                'mt-4 p-4 rounded-xl',
                testResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
              )}
            >
              <div className="flex items-center gap-3 mb-2">
                {testResult.success ? (
                  <CheckCircle size={20} className="text-green-400" />
                ) : (
                  <XCircle size={20} className="text-red-400" />
                )}
                <div className="flex-1">
                  <p className={clsx('font-medium', testResult.success ? 'text-green-400' : 'text-red-400')}>
                    {testResult.success ? '连接成功' : '连接失败'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {testResult.provider}/{testResult.model}
                  </p>
                  {testResult.latency_ms && (
                    <p className="text-xs text-gray-400">响应时间: {testResult.latency_ms}ms</p>
                  )}
                </div>
                <button
                  onClick={() => setTestResult(null)}
                  className="text-gray-500 hover:text-white text-sm"
                >
                  关闭
                </button>
              </div>
              
              {testResult.response && (
                <div className="mt-2 p-3 bg-dark-700 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">AI 响应:</p>
                  <p className="text-sm text-white whitespace-pre-wrap">{testResult.response}</p>
                </div>
              )}
              
              {testResult.error && (
                <div className="mt-2 p-3 bg-red-500/10 rounded-lg">
                  <p className="text-xs text-red-400 mb-1">错误信息:</p>
                  <p className="text-sm text-red-300 whitespace-pre-wrap">{testResult.error}</p>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* 已配置的 Provider 列表 */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <Sparkles size={18} className="text-claw-400" />
            快速接入
          </h3>

          <div className="space-y-3">
            {QUICK_ACCESS_GROUPS.map((group) => {
              const groupConfig = tuziConfig?.groups.find((item) => item.group === group);
              const providerIds = groupConfig?.provider_ids || (groupConfig?.provider_id ? [groupConfig.provider_id] : []);
              const isInUse = providerIds.some((providerId) => aiConfig?.primary_model?.startsWith(`${providerId}/`)) || false;

              return (
                <TuziGroupCard
                  key={group}
                  group={group}
                  groupConfig={groupConfig}
                  isInUse={isInUse}
                  onConfigure={() => {
                    setTuziDialogGroup(group);
                    setShowTuziDialog(true);
                  }}
                  onOpenActions={setModelActionTarget}
                />
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <Server size={18} className="text-gray-500" />
            已配置的 Provider
          </h3>

          {normalProviders.length === 0 ? (
            <div className="bg-dark-700 rounded-xl border border-dark-500 p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-dark-600 flex items-center justify-center">
                <Plus size={24} className="text-gray-500" />
              </div>
              <p className="text-gray-400 mb-4">还没有配置其他 AI Provider</p>
              <button
                onClick={() => setShowAddDialog(true)}
                className="btn-primary"
              >
                添加第一个 Provider
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {normalProviders.map(provider => (
                <ProviderCard
                  key={provider.name}
                  provider={provider}
                  officialProviders={officialProviders}
                  onOpenActions={setModelActionTarget}
                  onRefresh={loadData}
                  onEdit={handleEditProvider}
                />
              ))}
            </div>
          )}
        </div>

        {/* 可用模型列表 */}
        {aiConfig && aiConfig.available_models.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white flex items-center gap-2">
              <Cpu size={18} className="text-gray-500" />
              可用模型列表
              <span className="text-sm font-normal text-gray-500">
                ({aiConfig.available_models.length} 个)
              </span>
            </h3>
            <div className="bg-dark-700 rounded-xl border border-dark-500 p-4">
              <div className="flex flex-wrap gap-2">
                {aiConfig.available_models.map(modelId => (
                  <span
                    key={modelId}
                    className={clsx(
                      'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm',
                      modelId === aiConfig.primary_model
                        ? 'bg-claw-500/20 text-claw-300 border border-claw-500/30'
                        : 'bg-dark-600 text-gray-300'
                    )}
                  >
                    {modelId === aiConfig.primary_model && <Star size={12} />}
                    {modelId}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 配置说明 */}
        <div className="bg-dark-700/50 rounded-xl p-4 border border-dark-500">
          <h4 className="text-sm font-medium text-gray-400 mb-2">配置说明</h4>
          <ul className="text-sm text-gray-500 space-y-1">
            <li>• Provider 配置保存在 <code className="text-claw-400">~/.openclaw/openclaw.json</code></li>
            <li>• 支持官方 Provider（Anthropic、OpenAI、Kimi 等）和自定义 OpenAI/Anthropic 兼容 API</li>
            <li>• 主模型用于 Agent 的默认推理，可随时切换</li>
            <li>• 修改配置后需要重启服务生效</li>
          </ul>
        </div>
          </>
        )}
      </div>

      {/* 添加/编辑 Provider 对话框 */}
      <AnimatePresence>
        {showAddDialog && (
          <ProviderDialog
            officialProviders={officialProviders}
            onClose={handleCloseDialog}
            onSave={loadData}
            editingProvider={editingProvider}
          />
        )}
        {showTuziDialog && (
          <TuziDialog
            tuziConfig={tuziConfig}
            initialGroup={tuziDialogGroup}
            onClose={() => setShowTuziDialog(false)}
            onSave={loadData}
          />
        )}
        {modelActionTarget && (
          <ModelActionDialog
            target={modelActionTarget}
            onClose={() => setModelActionTarget(null)}
            onSetPrimary={handleSetPrimary}
            onTestModel={runModelTest}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
