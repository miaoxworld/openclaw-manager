import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
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

// ============ 添加/编辑 Provider 对话框 ============

interface ProviderDialogProps {
  officialProviders: OfficialProvider[];
  onClose: () => void;
  onSave: () => void;
  // 编辑模式时传入现有配置
  editingProvider?: ConfiguredProvider | null;
}

function ProviderDialog({ officialProviders, onClose, onSave, editingProvider }: ProviderDialogProps) {
  const { t } = useTranslation();
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
      setFormError(t('aiConfig.formError'));
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
      setFormError(t('aiConfig.saveFailed', { error: String(e) }));
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
        className="bg-surface-sidebar rounded-2xl border border-edge w-full max-w-2xl max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-edge flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content-primary flex items-center gap-2">
            {isEditing ? <Settings2 size={20} className="text-claw-400" /> : <Plus size={20} className="text-claw-400" />}
            {isEditing
              ? t('aiConfig.editProvider', { name: editingProvider?.name })
              : (step === 'select' ? t('aiConfig.addAIProvider') : t('aiConfig.configure', { name: selectedOfficial?.name || t('aiConfig.customProvider') }))}
          </h2>
          <button onClick={onClose} className="text-content-tertiary hover:text-content-primary">
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
                  <h3 className="text-sm font-medium text-content-secondary">官方 Provider</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {officialProviders.map(provider => (
                <button
                  key={provider.id}
                        onClick={() => handleSelectOfficial(provider)}
                        className="flex items-center gap-3 p-4 rounded-xl bg-surface-card border border-edge hover:border-claw-500/50 hover:bg-surface-elevated transition-all text-left group"
                >
                  <span className="text-2xl">{provider.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-content-primary truncate">{provider.name}</p>
                          <p className="text-xs text-content-tertiary truncate">
                            {provider.suggested_models.length} 个模型
                          </p>
                    </div>
                        <ChevronRight size={16} className="text-content-tertiary group-hover:text-claw-400 transition-colors" />
                </button>
                    ))}
          </div>
        </div>

                {/* 自定义 Provider */}
                <div className="pt-4 border-t border-edge">
                  <button
                    onClick={handleSelectCustom}
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-edge hover:border-claw-500/50 text-content-secondary hover:text-content-primary transition-all"
                  >
                    <Settings2 size={18} />
                    <span>{t('aiConfig.customProvider')}</span>
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
                  <label className="block text-sm text-content-secondary mb-2">
                    Provider 名称
                    <span className="text-gray-600 text-xs ml-2">(用于配置标识，如 anthropic-custom)</span>
                  </label>
                  <input
                    type="text"
                    value={providerName}
                    onChange={e => { setFormError(null); setProviderName(e.target.value); }}
                    placeholder={t('aiConfig.providerNamePlaceholder')}
                    className={clsx(
                      'input-base',
                      isCustomUrlWithOfficialName && 'border-yellow-500/50'
                    )}
                    disabled={isEditing}
                  />
                  {isEditing && (
                    <p className="text-xs text-content-tertiary mt-1">
                      Provider 名称不可修改，如需更改请删除后重新创建
                    </p>
                  )}
                  {isCustomUrlWithOfficialName && !isEditing && (
                    <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <p className="text-xs text-yellow-400">
                        {t('aiConfig.customUrlWarning')}
                      </p>
                      <button
                        type="button"
                        onClick={handleApplySuggestedName}
                        className="mt-1 text-xs text-yellow-300 hover:text-yellow-200 underline"
                      >
                        {t('aiConfig.useSuggestedName', { name: suggestedName })}
                      </button>
                    </div>
                  )}
                </div>

                {/* API 地址 */}
                <div>
                  <label className="block text-sm text-content-secondary mb-2">API 地址</label>
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
                  <label className="block text-sm text-content-secondary mb-2">
                    API Key
                    {!selectedOfficial?.requires_api_key && (
                      <span className="text-gray-600 text-xs ml-2">{t('aiConfig.optional')}</span>
                    )}
                  </label>
                  {/* 编辑模式下显示当前 API Key 状态 */}
                  {isEditing && editingProvider?.has_api_key && (
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <span className="text-content-tertiary">当前:</span>
                      <code className="px-2 py-0.5 bg-surface-elevated rounded text-content-secondary">
                        {editingProvider.api_key_masked}
                      </code>
                      <span className="text-green-400 text-xs">{'✓ ' + t('aiConfig.configured')}</span>
                    </div>
                  )}
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder={isEditing && editingProvider?.has_api_key
                        ? t('aiConfig.keepApiKey')
                        : "sk-..."}
                      className="input-base pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content-primary"
                    >
                      {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {isEditing && editingProvider?.has_api_key && (
                    <p className="text-xs text-content-tertiary mt-1">
                      💡 如果不需要更改 API Key，请保持为空
                    </p>
                  )}
                </div>

                {/* API 类型 */}
                <div>
                  <label className="block text-sm text-content-secondary mb-2">API 类型</label>
                  <select
                    value={apiType}
                    onChange={e => setApiType(e.target.value)}
                    className="input-base"
                  >
                    <option value="openai-completions">{t('aiConfig.openaiCompat')}</option>
                    <option value="anthropic-messages">{t('aiConfig.anthropicCompat')}</option>
                  </select>
                </div>

                {/* 模型选择 */}
              <div>
                <label className="block text-sm text-content-secondary mb-2">
                    选择模型
                    <span className="text-gray-600 text-xs ml-2">
                      {t('aiConfig.selectedCount', { count: selectedModels.length })}
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
                              : 'bg-surface-card border-edge hover:border-edge'
                          )}
                        >
                          <div>
                            <p className={clsx(
                              'text-sm font-medium',
                              selectedModels.includes(model.id) ? 'text-content-primary' : 'text-content-secondary'
                            )}>
                              {model.name}
                              {model.recommended && (
                                <span className="ml-2 text-xs text-claw-400">{t('aiConfig.recommended')}</span>
                              )}
                            </p>
                            {model.description && (
                              <p className="text-xs text-content-tertiary mt-0.5">{model.description}</p>
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
                      placeholder={t('aiConfig.customModelPlaceholder')}
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
                            className="inline-flex items-center gap-1 px-2 py-1 bg-surface-elevated rounded-lg text-sm text-content-secondary"
                          >
                            {modelId}
                            <button
                              onClick={() => toggleModel(modelId)}
                              className="text-content-tertiary hover:text-red-400"
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
                    {t('aiConfig.viewDocs')}
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
                      {t('aiConfig.customUrlConflict', { name: providerName })}
                    </p>
                    <p className="text-yellow-300 text-sm">
                      {t('aiConfig.suggestedNameHint', { name: suggestedName })}
                    </p>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleApplySuggestedName}
                        className="btn-secondary text-sm py-2 px-3"
                      >
                        {t('aiConfig.useSuggested')}
                      </button>
                      <button
                        onClick={() => handleSave(true)}
                        className="btn-primary text-sm py-2 px-3"
                      >
                        {t('aiConfig.saveAnyway')}
                      </button>
                      <button
                        onClick={() => setShowCustomUrlWarning(false)}
                        className="text-sm text-content-secondary hover:text-content-primary px-3"
                      >
                        {t('aiConfig.cancel')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
              </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-edge flex justify-between">
          {step === 'configure' && !isEditing && (
            <button
              onClick={() => setStep('select')}
              className="btn-secondary"
            >
              {t('aiConfig.back')}
            </button>
          )}
          <div className="flex-1" />
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">
              {t('aiConfig.cancel')}
            </button>
            {step === 'configure' && !showCustomUrlWarning && (
              <button
                onClick={() => handleSave()}
                disabled={saving || !providerName || !baseUrl || selectedModels.length === 0}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {isEditing ? t('aiConfig.update') : t('aiConfig.save')}
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
  onSetPrimary: (modelId: string) => void;
  onRefresh: () => void;
  onEdit: (provider: ConfiguredProvider) => void;
}

function ProviderCard({ provider, officialProviders, onSetPrimary, onRefresh, onEdit }: ProviderCardProps) {
  const { t } = useTranslation();
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
      setDeleteError(t('aiConfig.deleteFailed', { error: String(e) }));
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
      className="bg-surface-card rounded-xl border border-edge overflow-hidden"
    >
      {/* 头部 */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xl">{officialInfo?.icon || '🔌'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-content-primary">{provider.name}</h3>
            {provider.has_api_key && (
              <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                {t('aiConfig.configured')}
              </span>
            )}
            {isCustomUrl && (
              <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                {t('aiConfig.customAddress')}
              </span>
            )}
          </div>
          <p className="text-xs text-content-tertiary truncate">{provider.base_url}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-content-tertiary">{provider.models.length} 模型</span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }}>
            <ChevronDown size={18} className="text-content-tertiary" />
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
            className="border-t border-edge"
          >
            <div className="p-4 space-y-3">
              {/* API Key 信息 */}
              {provider.api_key_masked && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-content-tertiary">API Key:</span>
                  <code className="px-2 py-0.5 bg-surface-elevated rounded text-content-secondary">
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
                        : 'bg-surface-elevated border-edge'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Cpu size={16} className={model.is_primary ? 'text-claw-400' : 'text-content-tertiary'} />
                      <div>
                        <p className={clsx(
                            'text-sm font-medium',
                          model.is_primary ? 'text-content-primary' : 'text-content-secondary'
                        )}>
                          {model.name}
                          {model.is_primary && (
                            <span className="ml-2 text-xs text-claw-400">
                              <Star size={12} className="inline -mt-0.5" /> {t('aiConfig.primaryModel')}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-content-tertiary">{model.full_id}</p>
                      </div>
                    </div>
                    {!model.is_primary && (
                      <button
                        onClick={() => onSetPrimary(model.full_id)}
                        className="text-xs text-content-tertiary hover:text-claw-400 transition-colors"
                      >
                        {t('aiConfig.setPrimary')}
                      </button>
                    )}
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
                    {t('aiConfig.deleteConfirm', { name: provider.name })}
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
                      {t('aiConfig.confirmDelete')}
                    </button>
                    <button
                      onClick={handleDeleteCancel}
                      disabled={deleting}
                      className="btn-secondary text-sm py-2 px-3"
                    >
                      {t('aiConfig.cancel')}
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
                      onEdit(provider);
                    }}
                    className="flex items-center gap-1 text-sm text-claw-400 hover:text-claw-300 transition-colors"
                  >
                    <Pencil size={14} />
                    {t('aiConfig.editProviderBtn')}
                  </button>
                  <button
                    onClick={handleDeleteClick}
                    disabled={deleting}
                    className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {t('aiConfig.deleteProvider')}
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

// ============ 主组件 ============

export function AIConfig() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [officialProviders, setOfficialProviders] = useState<OfficialProvider[]>([]);
  const [aiConfig, setAiConfig] = useState<AIConfigOverview | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ConfiguredProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AITestResult | null>(null);

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

  const loadData = useCallback(async () => {
    aiLogger.info('AIConfig 组件加载数据...');
    setError(null);

    try {
      const [officials, config] = await Promise.all([
        invoke<OfficialProvider[]>('get_official_providers'),
        invoke<AIConfigOverview>('get_ai_config'),
      ]);
      setOfficialProviders(officials);
      setAiConfig(config);
      aiLogger.info(`加载完成: ${officials.length} 个官方 Provider, ${config.configured_providers.length} 个已配置`);
    } catch (e) {
      aiLogger.error('加载 AI 配置失败', e);
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSetPrimary = async (modelId: string) => {
    try {
      await invoke('set_primary_model', { modelId });
      aiLogger.info(`主模型已设置为: ${modelId}`);
      loadData();
    } catch (e) {
      aiLogger.error('设置主模型失败', e);
      alert('设置失败: ' + e);
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
            <p className="font-medium mb-1">{t('aiConfig.loadFailed')}</p>
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={loadData}
              className="mt-2 text-sm text-red-300 hover:text-content-primary underline"
            >
              {t('aiConfig.retry')}
            </button>
          </div>
        )}

        {/* 概览卡片 */}
        <div className="bg-gradient-to-br from-dark-700 to-dark-800 rounded-2xl p-6 border border-edge">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-content-primary flex items-center gap-2">
                <Sparkles size={22} className="text-claw-400" />
                {t('aiConfig.title')}
              </h2>
              <p className="text-sm text-content-tertiary mt-1">
                管理 OpenClaw 使用的 AI Provider 和模型
              </p>
            </div>
            <button
              onClick={() => setShowAddDialog(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} />
              {t('aiConfig.addProvider')}
            </button>
          </div>

          {/* 主模型显示 */}
          <div className="bg-surface-elevated/50 rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-claw-500/20 flex items-center justify-center">
              <Star size={24} className="text-claw-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-content-secondary">当前主模型</p>
              {aiConfig?.primary_model ? (
                <p className="text-lg font-medium text-content-primary">{aiConfig.primary_model}</p>
              ) : (
                <p className="text-lg text-content-tertiary">未设置</p>
              )}
            </div>
            <div className="text-right mr-4">
              <p className="text-sm text-content-tertiary">
                {aiConfig?.configured_providers.length || 0} 个 Provider
              </p>
              <p className="text-sm text-content-tertiary">
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
              {t('aiConfig.testConnection')}
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
                    {testResult.success ? t('aiConfig.connectionSuccess') : t('aiConfig.connectionFailed')}
                  </p>
                  {testResult.latency_ms && (
                    <p className="text-xs text-content-secondary">响应时间: {testResult.latency_ms}ms</p>
                  )}
                </div>
                <button
                  onClick={() => setTestResult(null)}
                  className="text-content-tertiary hover:text-content-primary text-sm"
                >
                  {t('aiConfig.close')}
                </button>
              </div>

              {testResult.response && (
                <div className="mt-2 p-3 bg-surface-card rounded-lg">
                  <p className="text-xs text-content-secondary mb-1">AI 响应:</p>
                  <p className="text-sm text-content-primary whitespace-pre-wrap">{testResult.response}</p>
                </div>
              )}

              {testResult.error && (
                <div className="mt-2 p-3 bg-red-500/10 rounded-lg">
                  <p className="text-xs text-red-400 mb-1">{t('aiConfig.errorInfo')}</p>
                  <p className="text-sm text-red-300 whitespace-pre-wrap">{testResult.error}</p>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* 已配置的 Provider 列表 */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-content-primary flex items-center gap-2">
            <Server size={18} className="text-content-tertiary" />
            已配置的 Provider
          </h3>

          {aiConfig?.configured_providers.length === 0 ? (
            <div className="bg-surface-card rounded-xl border border-edge p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-elevated flex items-center justify-center">
                <Plus size={24} className="text-content-tertiary" />
              </div>
              <p className="text-content-secondary mb-4">还没有配置任何 AI Provider</p>
              <button
                onClick={() => setShowAddDialog(true)}
                className="btn-primary"
              >
                {t('aiConfig.addFirstProvider')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {aiConfig?.configured_providers.map(provider => (
                <ProviderCard
                  key={provider.name}
                  provider={provider}
                  officialProviders={officialProviders}
                  onSetPrimary={handleSetPrimary}
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
            <h3 className="text-lg font-medium text-content-primary flex items-center gap-2">
              <Cpu size={18} className="text-content-tertiary" />
              可用模型列表
              <span className="text-sm font-normal text-content-tertiary">
                ({aiConfig.available_models.length} 个)
              </span>
            </h3>
            <div className="bg-surface-card rounded-xl border border-edge p-4">
              <div className="flex flex-wrap gap-2">
                {aiConfig.available_models.map(modelId => (
                  <span
                    key={modelId}
                    className={clsx(
                      'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm',
                      modelId === aiConfig.primary_model
                        ? 'bg-claw-500/20 text-claw-300 border border-claw-500/30'
                        : 'bg-surface-elevated text-content-secondary'
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
        <div className="bg-surface-card/50 rounded-xl p-4 border border-edge">
          <h4 className="text-sm font-medium text-content-secondary mb-2">配置说明</h4>
          <ul className="text-sm text-content-tertiary space-y-1">
            <li>• Provider 配置保存在 <code className="text-claw-400">~/.openclaw/openclaw.json</code></li>
            <li>• 支持官方 Provider（Anthropic、OpenAI、Kimi 等）和自定义 OpenAI/Anthropic 兼容 API</li>
            <li>• 主模型用于 Agent 的默认推理，可随时切换</li>
            <li>• 修改配置后需要重启服务生效</li>
          </ul>
        </div>
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
      </AnimatePresence>
    </div>
  );
}
