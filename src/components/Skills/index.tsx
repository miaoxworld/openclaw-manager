import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
    Puzzle,
    Download,
    Trash2,
    Check,
    X,
    Loader2,
    ChevronRight,
    Eye,
    EyeOff,
    ExternalLink,
    Power,
    PowerOff,
    FolderOpen,
    Package,
    Plus,
    Search,
    CheckCircle,
    XCircle,
    Filter,
} from 'lucide-react';
import clsx from 'clsx';

// ============ 类型定义 ============

interface SkillSelectOption {
    value: string;
    label: string;
}

interface SkillConfigField {
    key: string;
    label: string;
    field_type: string;
    placeholder: string | null;
    options: SkillSelectOption[] | null;
    required: boolean;
    default_value: string | null;
    help_text: string | null;
}

interface SkillDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;
    source: string;
    version: string | null;
    author: string | null;
    package_name: string | null;
    clawhub_slug: string | null;
    installed: boolean;
    enabled: boolean;
    config_fields: SkillConfigField[];
    config_values: Record<string, unknown>;
    docs_url: string | null;
    category: string | null;
}

type SourceFilter = 'all' | 'builtin' | 'official' | 'community' | 'custom';

const sourceLabels: Record<string, { label: string; color: string; bg: string }> = {
    builtin: { label: '内置', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    official: { label: '官方', color: 'text-blue-400', bg: 'bg-blue-500/20' },
    community: { label: '社区', color: 'text-purple-400', bg: 'bg-purple-500/20' },
    custom: { label: '自定义', color: 'text-orange-400', bg: 'bg-orange-500/20' },
};

// ============ 自定义安装对话框 ============

interface CustomInstallDialogProps {
    onClose: () => void;
    onInstalled: () => void;
}

function CustomInstallDialog({ onClose, onInstalled }: CustomInstallDialogProps) {
    const [sourceType, setSourceType] = useState<'npm' | 'local'>('npm');
    const [source, setSource] = useState('');
    const [installing, setInstalling] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleInstall = async () => {
        if (!source.trim()) return;
        setInstalling(true);
        setError(null);
        try {
            await invoke<string>('install_custom_skill', {
                source: source.trim(),
                sourceType,
            });
            onInstalled();
            onClose();
        } catch (e) {
            setError(String(e));
        } finally {
            setInstalling(false);
        }
    };

    const handleSelectFolder = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-shell');
            // 使用简单的路径输入，因为 tauri v2 的 dialog 插件需要额外依赖
            // 用户可以手动输入路径
            void open;
        } catch {
            // 忽略
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
                className="bg-surface-sidebar rounded-2xl border border-edge w-full max-w-lg overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b border-edge flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-content-primary flex items-center gap-2">
                        <Plus size={20} className="text-claw-400" />
                        安装自定义技能
                    </h2>
                    <button onClick={onClose} className="text-content-tertiary hover:text-content-primary">✕</button>
                </div>

                <div className="p-6 space-y-5">
                    {/* 安装方式选择 */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setSourceType('npm'); setSource(''); setError(null); }}
                            className={clsx(
                                'flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all',
                                sourceType === 'npm'
                                    ? 'bg-claw-500/20 border-claw-500 text-content-primary'
                                    : 'bg-surface-card border-edge text-content-secondary hover:border-edge'
                            )}
                        >
                            <Package size={18} />
                            npm 包
                        </button>
                        <button
                            onClick={() => { setSourceType('local'); setSource(''); setError(null); }}
                            className={clsx(
                                'flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all',
                                sourceType === 'local'
                                    ? 'bg-claw-500/20 border-claw-500 text-content-primary'
                                    : 'bg-surface-card border-edge text-content-secondary hover:border-edge'
                            )}
                        >
                            <FolderOpen size={18} />
                            本地路径
                        </button>
                    </div>

                    {/* 输入框 */}
                    <div>
                        <label className="block text-sm text-content-secondary mb-2">
                            {sourceType === 'npm' ? 'npm 包名' : '本地路径 (zip 或文件夹)'}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={source}
                                onChange={e => { setSource(e.target.value); setError(null); }}
                                placeholder={sourceType === 'npm' ? '@scope/package-name' : 'C:\\path\\to\\skill 或 /path/to/skill.zip'}
                                className="input-base flex-1"
                                onKeyDown={e => e.key === 'Enter' && handleInstall()}
                            />
                            {sourceType === 'local' && (
                                <button
                                    onClick={handleSelectFolder}
                                    className="btn-secondary px-3"
                                    title="浏览..."
                                >
                                    <FolderOpen size={16} />
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-content-tertiary mt-1.5">
                            {sourceType === 'npm'
                                ? '输入 npm 包名，例如: @openclaw/voice-call, my-custom-skill'
                                : '输入 zip 文件或文件夹的完整路径'}
                        </p>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg"
                        >
                            <p className="text-red-400 text-sm flex items-center gap-2">
                                <XCircle size={16} />
                                {error}
                            </p>
                        </motion.div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-edge flex justify-end gap-3">
                    <button onClick={onClose} className="btn-secondary">取消</button>
                    <button
                        onClick={handleInstall}
                        disabled={installing || !source.trim()}
                        className="btn-primary flex items-center gap-2"
                    >
                        {installing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        {installing ? '安装中...' : '安装'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ============ 主组件 ============

export function Skills() {
    const [skills, setSkills] = useState<SkillDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [configForm, setConfigForm] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [installing, setInstalling] = useState<string | null>(null);
    const [uninstalling, setUninstalling] = useState<string | null>(null);
    const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);
    const [showCustomDialog, setShowCustomDialog] = useState(false);
    const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

    const togglePasswordVisibility = (fieldKey: string) => {
        setVisiblePasswords(prev => {
            const next = new Set(prev);
            if (next.has(fieldKey)) next.delete(fieldKey);
            else next.add(fieldKey);
            return next;
        });
    };

    const fetchSkills = useCallback(async () => {
        try {
            const result = await invoke<SkillDefinition[]>('get_skills_list');
            setSkills(result);
            return result;
        } catch (e) {
            console.error('获取技能列表失败:', e);
            return [];
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                await fetchSkills();
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [fetchSkills]);

    const handleSkillSelect = (skillId: string) => {
        setSelectedSkill(skillId);
        setActionResult(null);
        const skill = skills.find(s => s.id === skillId);
        if (skill) {
            const form: Record<string, string> = {};
            Object.entries(skill.config_values).forEach(([key, value]) => {
                form[key] = String(value ?? '');
            });
            // 填充默认值
            skill.config_fields.forEach(field => {
                if (!(field.key in form) && field.default_value) {
                    form[field.key] = field.default_value;
                }
            });
            setConfigForm(form);
        } else {
            setConfigForm({});
        }
    };

    const handleInstall = async (skill: SkillDefinition) => {
        setInstalling(skill.id);
        setActionResult(null);
        try {
            await invoke<string>('install_skill', {
                skillId: skill.id,
                packageName: skill.package_name,
                clawhubSlug: skill.clawhub_slug,
            });
            setActionResult({ success: true, message: `${skill.name} 安装成功` });
            await fetchSkills();
        } catch (e) {
            setActionResult({ success: false, message: String(e) });
        } finally {
            setInstalling(null);
        }
    };

    const handleUninstall = async (skill: SkillDefinition) => {
        setUninstalling(skill.id);
        setActionResult(null);
        try {
            await invoke<string>('uninstall_skill', {
                skillId: skill.id,
                packageName: skill.package_name,
            });
            setActionResult({ success: true, message: `${skill.name} 已卸载` });
            await fetchSkills();
        } catch (e) {
            setActionResult({ success: false, message: String(e) });
        } finally {
            setUninstalling(null);
        }
    };

    const handleSaveConfig = async () => {
        if (!selectedSkill) return;
        const skill = skills.find(s => s.id === selectedSkill);
        if (!skill) return;

        setSaving(true);
        setActionResult(null);
        try {
            const config: Record<string, unknown> = {};
            Object.entries(configForm).forEach(([key, value]) => {
                if (value) config[key] = value;
            });

            await invoke<string>('save_skill_config', {
                skillId: selectedSkill,
                enabled: skill.enabled,
                config,
            });
            setActionResult({ success: true, message: `${skill.name} 配置已保存` });
            await fetchSkills();
        } catch (e) {
            setActionResult({ success: false, message: String(e) });
        } finally {
            setSaving(false);
        }
    };

    const handleToggleEnabled = async (skill: SkillDefinition) => {
        try {
            const config: Record<string, unknown> = {};
            Object.entries(skill.config_values).forEach(([key, value]) => {
                config[key] = value;
            });
            await invoke<string>('save_skill_config', {
                skillId: skill.id,
                enabled: !skill.enabled,
                config,
            });
            await fetchSkills();
        } catch (e) {
            console.error('切换技能状态失败:', e);
        }
    };

    // 筛选逻辑
    const filteredSkills = skills.filter(skill => {
        if (sourceFilter !== 'all' && skill.source !== sourceFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                skill.name.toLowerCase().includes(q) ||
                skill.description.toLowerCase().includes(q) ||
                skill.id.toLowerCase().includes(q) ||
                (skill.category && skill.category.toLowerCase().includes(q))
            );
        }
        return true;
    });

    const currentSkill = skills.find(s => s.id === selectedSkill);

    const filterTabs: { id: SourceFilter; label: string; count: number }[] = [
        { id: 'all', label: '全部', count: skills.length },
        { id: 'builtin', label: '内置', count: skills.filter(s => s.source === 'builtin').length },
        { id: 'official', label: '官方', count: skills.filter(s => s.source === 'official').length },
        { id: 'community', label: '社区', count: skills.filter(s => s.source === 'community').length },
    ];

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-claw-500" />
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto scroll-container pr-2">
            <div className="max-w-5xl">
                {/* 顶部工具栏 */}
                <div className="flex items-center gap-3 mb-4">
                    {/* 搜索框 */}
                    <div className="relative flex-1 max-w-xs">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="搜索技能..."
                            className="input-base pl-9 py-2 text-sm"
                        />
                    </div>

                    {/* 分类 Tab */}
                    <div className="flex gap-1 bg-surface-card rounded-lg p-1">
                        {filterTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setSourceFilter(tab.id)}
                                className={clsx(
                                    'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                                    sourceFilter === tab.id
                                        ? 'bg-claw-500/30 text-claw-300'
                                        : 'text-content-secondary hover:text-content-primary'
                                )}
                            >
                                {tab.label}
                                <span className="ml-1 text-content-tertiary">{tab.count}</span>
                            </button>
                        ))}
                    </div>

                    {/* 安装自定义技能按钮 */}
                    <button
                        onClick={() => setShowCustomDialog(true)}
                        className="btn-secondary flex items-center gap-2 text-sm py-2"
                    >
                        <Plus size={16} />
                        自定义安装
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 左栏：技能列表 */}
                    <div className="lg:col-span-1 space-y-2">
                        {filteredSkills.length === 0 ? (
                            <div className="text-center py-8 text-content-tertiary">
                                <Filter size={32} className="mx-auto mb-2 opacity-50" />
                                <p className="text-sm">没有找到匹配的技能</p>
                            </div>
                        ) : (
                            filteredSkills.map(skill => {
                                const isSelected = selectedSkill === skill.id;
                                const srcInfo = sourceLabels[skill.source] || sourceLabels.custom;

                                return (
                                    <button
                                        key={skill.id}
                                        onClick={() => handleSkillSelect(skill.id)}
                                        className={clsx(
                                            'w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left',
                                            isSelected
                                                ? 'bg-surface-elevated border-claw-500'
                                                : 'bg-surface-card border-edge hover:border-edge'
                                        )}
                                    >
                                        <div className={clsx(
                                            'w-10 h-10 rounded-lg flex items-center justify-center text-lg',
                                            skill.installed ? 'bg-surface-elevated' : 'bg-surface-elevated'
                                        )}>
                                            {skill.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className={clsx(
                                                    'text-sm font-medium truncate',
                                                    isSelected ? 'text-content-primary' : 'text-content-secondary'
                                                )}>
                                                    {skill.name}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', srcInfo.bg, srcInfo.color)}>
                                                    {srcInfo.label}
                                                </span>
                                                {skill.installed && skill.enabled ? (
                                                    <span className="flex items-center gap-1 text-xs text-green-400">
                                                        <Check size={10} /> 已启用
                                                    </span>
                                                ) : skill.installed ? (
                                                    <span className="flex items-center gap-1 text-xs text-content-tertiary">
                                                        <Check size={10} /> 已安装
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-xs text-gray-600">
                                                        <X size={10} /> 未安装
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronRight
                                            size={16}
                                            className={isSelected ? 'text-claw-400' : 'text-gray-600'}
                                        />
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* 右栏：详情与配置 */}
                    <div className="lg:col-span-2">
                        {currentSkill ? (
                            <motion.div
                                key={selectedSkill}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="bg-surface-card rounded-2xl p-6 border border-edge"
                            >
                                {/* 头部 */}
                                <div className="flex items-start gap-4 mb-5">
                                    <div className="w-14 h-14 rounded-xl bg-surface-elevated flex items-center justify-center text-2xl">
                                        {currentSkill.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-lg font-semibold text-content-primary">{currentSkill.name}</h3>
                                            {(() => {
                                                const srcInfo = sourceLabels[currentSkill.source] || sourceLabels.custom;
                                                return (
                                                    <span className={clsx('text-xs px-2 py-0.5 rounded', srcInfo.bg, srcInfo.color)}>
                                                        {srcInfo.label}
                                                    </span>
                                                );
                                            })()}
                                            {currentSkill.category && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-surface-elevated text-content-secondary">
                                                    {currentSkill.category}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-content-secondary mt-1">{currentSkill.description}</p>
                                        {currentSkill.author && (
                                            <p className="text-xs text-content-tertiary mt-1">作者: {currentSkill.author}</p>
                                        )}
                                        {currentSkill.docs_url && (
                                            <a
                                                href={currentSkill.docs_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-xs text-claw-400 hover:text-claw-300 mt-1"
                                            >
                                                <ExternalLink size={12} />
                                                查看文档
                                            </a>
                                        )}
                                    </div>
                                </div>

                                {/* 操作按钮区 */}
                                <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-edge">
                                    {/* 安装/卸载 */}
                                    {currentSkill.source !== 'builtin' && (
                                        <>
                                            {!currentSkill.installed ? (
                                                <button
                                                    onClick={() => handleInstall(currentSkill)}
                                                    disabled={installing === currentSkill.id}
                                                    className="btn-primary flex items-center gap-2"
                                                >
                                                    {installing === currentSkill.id ? (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    ) : (
                                                        <Download size={16} />
                                                    )}
                                                    {installing === currentSkill.id ? '安装中...' : '安装'}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleUninstall(currentSkill)}
                                                    disabled={uninstalling === currentSkill.id}
                                                    className="btn-secondary flex items-center gap-2 text-red-400 hover:text-red-300 hover:border-red-500/50"
                                                >
                                                    {uninstalling === currentSkill.id ? (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    ) : (
                                                        <Trash2 size={16} />
                                                    )}
                                                    {uninstalling === currentSkill.id ? '卸载中...' : '卸载'}
                                                </button>
                                            )}
                                        </>
                                    )}

                                    {/* 启用/禁用 */}
                                    {(currentSkill.installed || currentSkill.source === 'builtin') && (
                                        <button
                                            onClick={() => handleToggleEnabled(currentSkill)}
                                            className={clsx(
                                                'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                                                currentSkill.enabled
                                                    ? 'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30'
                                                    : 'bg-surface-elevated border-edge text-content-secondary hover:text-content-primary hover:border-edge'
                                            )}
                                        >
                                            {currentSkill.enabled ? <Power size={16} /> : <PowerOff size={16} />}
                                            {currentSkill.enabled ? '已启用' : '已禁用'}
                                        </button>
                                    )}

                                    {/* 包名信息 */}
                                    {currentSkill.package_name && (
                                        <span className="text-xs text-content-tertiary ml-auto">
                                            📦 {currentSkill.package_name}
                                        </span>
                                    )}
                                    {currentSkill.clawhub_slug && (
                                        <span className="text-xs text-content-tertiary ml-auto">
                                            🔗 clawhub/{currentSkill.clawhub_slug}
                                        </span>
                                    )}
                                </div>

                                {/* 配置表单 */}
                                {currentSkill.config_fields.length > 0 && (
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-medium text-content-secondary flex items-center gap-2">
                                            <Puzzle size={16} className="text-claw-400" />
                                            技能配置
                                        </h4>

                                        {currentSkill.config_fields.map(field => (
                                            <div key={field.key}>
                                                <label className="block text-sm text-content-secondary mb-2">
                                                    {field.label}
                                                    {field.required && <span className="text-red-400 ml-1">*</span>}
                                                    {configForm[field.key] && (
                                                        <span className="ml-2 text-green-500 text-xs">✓</span>
                                                    )}
                                                </label>

                                                {field.field_type === 'select' ? (
                                                    <select
                                                        value={configForm[field.key] || ''}
                                                        onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                                                        className="input-base"
                                                    >
                                                        <option value="">请选择...</option>
                                                        {field.options?.map(opt => (
                                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                ) : field.field_type === 'password' ? (
                                                    <div className="relative">
                                                        <input
                                                            type={visiblePasswords.has(field.key) ? 'text' : 'password'}
                                                            value={configForm[field.key] || ''}
                                                            onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                                                            placeholder={field.placeholder || ''}
                                                            className="input-base pr-10"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => togglePasswordVisibility(field.key)}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content-primary transition-colors"
                                                        >
                                                            {visiblePasswords.has(field.key) ? <EyeOff size={18} /> : <Eye size={18} />}
                                                        </button>
                                                    </div>
                                                ) : field.field_type === 'toggle' ? (
                                                    <button
                                                        onClick={() => setConfigForm({
                                                            ...configForm,
                                                            [field.key]: configForm[field.key] === 'true' ? 'false' : 'true',
                                                        })}
                                                        className={clsx(
                                                            'w-12 h-6 rounded-full relative transition-colors',
                                                            configForm[field.key] === 'true' ? 'bg-claw-500' : 'bg-surface-elevated'
                                                        )}
                                                    >
                                                        <span className={clsx(
                                                            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                                                            configForm[field.key] === 'true' ? 'left-7' : 'left-1'
                                                        )} />
                                                    </button>
                                                ) : (
                                                    <input
                                                        type={field.field_type === 'number' ? 'number' : 'text'}
                                                        value={configForm[field.key] || ''}
                                                        onChange={e => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                                                        placeholder={field.placeholder || ''}
                                                        className="input-base"
                                                    />
                                                )}

                                                {field.help_text && (
                                                    <p className="text-xs text-content-tertiary mt-1">{field.help_text}</p>
                                                )}
                                            </div>
                                        ))}

                                        {/* 保存按钮 */}
                                        <div className="pt-4 border-t border-edge">
                                            <button
                                                onClick={handleSaveConfig}
                                                disabled={saving}
                                                className="btn-primary flex items-center gap-2"
                                            >
                                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                                保存配置
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* 无配置项提示 */}
                                {currentSkill.config_fields.length === 0 && (
                                    <div className="text-center py-6">
                                        <p className="text-sm text-content-tertiary">该技能无需额外配置</p>
                                    </div>
                                )}

                                {/* 操作结果提示 */}
                                <AnimatePresence>
                                    {actionResult && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className={clsx(
                                                'mt-4 p-3 rounded-lg border flex items-center gap-2',
                                                actionResult.success
                                                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                                            )}
                                        >
                                            {actionResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                                            <span className="text-sm">{actionResult.message}</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ) : (
                            <div className="bg-surface-card rounded-2xl p-6 border border-edge flex flex-col items-center justify-center h-64">
                                <Puzzle size={48} className="text-gray-600 mb-4" />
                                <p className="text-content-tertiary text-sm">选择一个技能查看详情与配置</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 自定义安装对话框 */}
            <AnimatePresence>
                {showCustomDialog && (
                    <CustomInstallDialog
                        onClose={() => setShowCustomDialog(false)}
                        onInstalled={fetchSkills}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
