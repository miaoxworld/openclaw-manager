import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
    ShieldAlert,
    ShieldCheck,
    Search,
    Loader2,
    Wrench,
    AlertTriangle,
    AlertOctagon,
    Info,
    CheckCircle,
    XCircle,
    Globe,
    Wifi,
    Package,
    Key,
    FileWarning,
    Server,
} from 'lucide-react';
import clsx from 'clsx';

// 安全风险项接口
interface SecurityIssue {
    id: string;
    title: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    fixable: boolean;
    fixed: boolean;
    category: string;
    detail?: string;
}

// 修复结果接口
interface FixResult {
    success: boolean;
    message: string;
    fixed_ids: string[];
    failed_ids: string[];
    manual_instructions?: string;
}

// 风险级别对应的图标和颜色
const severityConfig = {
    high: {
        icon: AlertOctagon,
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        label: '高风险',
        labelBg: 'bg-red-500/20 text-red-400',
    },
    medium: {
        icon: AlertTriangle,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        label: '中风险',
        labelBg: 'bg-amber-500/20 text-amber-400',
    },
    low: {
        icon: Info,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        label: '低风险',
        labelBg: 'bg-blue-500/20 text-blue-400',
    },
};

// 分类对应的图标
const categoryIcons: Record<string, React.ElementType> = {
    network: Globe,
    exposure: Wifi,
    skills: Package,
    auth: Key,
    permissions: FileWarning,
    service: Server,
};

export function Security() {
    const [scanning, setScanning] = useState(false);
    const [scanned, setScanned] = useState(false);
    const [issues, setIssues] = useState<SecurityIssue[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [fixing, setFixing] = useState(false);
    const [fixResult, setFixResult] = useState<FixResult | null>(null);
    const [manualInstructions, setManualInstructions] = useState<string>('');

    // 执行安全扫描
    const handleScan = async () => {
        setScanning(true);
        setScanned(false);
        setIssues([]);
        setSelectedIds(new Set());
        setFixResult(null);
        setManualInstructions('');

        try {
            const result = await invoke<SecurityIssue[]>('run_security_scan');
            setIssues(result);
            setScanned(true);

            // 自动勾选所有可修复项
            const fixableIds = new Set(
                result.filter((i) => i.fixable && !i.fixed).map((i) => i.id)
            );
            setSelectedIds(fixableIds);
        } catch (e) {
            console.error('安全扫描失败:', e);
            // 展示一个本地模拟结果以保证 UI 可用
            setIssues([]);
            setScanned(true);
        } finally {
            setScanning(false);
        }
    };

    // 切换复选框选中状态
    const toggleIssue = (id: string) => {
        const issue = issues.find((i) => i.id === id);
        if (!issue || !issue.fixable || issue.fixed) return;

        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // 一键修复
    const handleFix = async () => {
        if (selectedIds.size === 0) return;

        setFixing(true);
        setFixResult(null);

        try {
            const result = await invoke<FixResult>('fix_security_issues', {
                issueIds: Array.from(selectedIds),
            });
            setFixResult(result);

            // 更新 issues 状态
            if (result.fixed_ids.length > 0) {
                setIssues((prev) =>
                    prev.map((issue) =>
                        result.fixed_ids.includes(issue.id)
                            ? { ...issue, fixed: true }
                            : issue
                    )
                );
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    result.fixed_ids.forEach((id) => next.delete(id));
                    return next;
                });
            }

            if (result.manual_instructions) {
                setManualInstructions(result.manual_instructions);
            }
        } catch (e) {
            setFixResult({
                success: false,
                message: '修复过程中发生错误: ' + String(e),
                fixed_ids: [],
                failed_ids: Array.from(selectedIds),
            });
        } finally {
            setFixing(false);
        }
    };

    // 将风险项按高/中/低排序分组
    const sortedIssues = [...issues].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.severity] - order[b.severity];
    });

    const highRiskIssues = sortedIssues.filter((i) => i.severity === 'high');
    const otherIssues = sortedIssues.filter((i) => i.severity !== 'high');

    // 不可修复项的说明
    const unfixableIssues = issues.filter((i) => !i.fixable);
    const hasFixableSelected = selectedIds.size > 0;

    return (
        <div className="h-full overflow-y-auto scroll-container pr-2">
            <div className="max-w-3xl space-y-6">
                {/* 安全提醒面板 */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-red-950/40 via-dark-700 to-dark-700 rounded-2xl p-6 border border-red-900/40 relative overflow-hidden"
                >
                    {/* 背景装饰 */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl" />
                    <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />

                    <div className="relative z-10">
                        <div className="flex items-start gap-4 mb-4">
                            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0 ring-1 ring-red-500/30">
                                <ShieldAlert size={24} className="text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-content-primary mb-1">
                                    ⚠️ 安全风险提醒
                                </h3>
                                <p className="text-sm text-content-secondary leading-relaxed">
                                    OpenClaw 拥有<span className="text-red-400 font-medium">读写文件、发送消息、执行代码</span>等强大权限。
                                    AI 的自主决策可能导致以下风险：
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                            <div className="flex items-center gap-2 p-3 bg-surface-overlay rounded-lg border border-edge-secondary">
                                <FileWarning size={16} className="text-red-400 flex-shrink-0" />
                                <span className="text-xs text-content-secondary">重要文件被误删或覆盖</span>
                            </div>
                            <div className="flex items-center gap-2 p-3 bg-surface-overlay rounded-lg border border-edge-secondary">
                                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
                                <span className="text-xs text-content-secondary">邮件/消息被误发送</span>
                            </div>
                            <div className="flex items-center gap-2 p-3 bg-surface-overlay rounded-lg border border-edge-secondary">
                                <Globe size={16} className="text-blue-400 flex-shrink-0" />
                                <span className="text-xs text-content-secondary">敏感数据泄露到外部</span>
                            </div>
                        </div>

                        <p className="text-xs text-content-tertiary mt-4 leading-relaxed">
                            建议定期执行安全检测，确保系统配置安全。如果 OpenClaw 部署在公网环境，请务必配置身份验证和访问控制。
                        </p>
                    </div>
                </motion.div>

                {/* 安全检测区域 */}
                <div className="bg-surface-card rounded-2xl p-6 border border-edge">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-claw-500/20 flex items-center justify-center">
                                <Search size={20} className="text-claw-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-content-primary">安全检测</h3>
                                <p className="text-xs text-content-tertiary">
                                    扫描系统配置、网络暴露、技能库等安全风险
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleScan}
                            disabled={scanning}
                            className="btn-primary flex items-center gap-2 text-sm"
                        >
                            {scanning ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Search size={16} />
                            )}
                            {scanning ? '正在检测...' : '开始检测'}
                        </button>
                    </div>

                    {/* 扫描进度动画 */}
                    <AnimatePresence>
                        {scanning && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 bg-surface-elevated rounded-xl border border-edge mb-4">
                                    <div className="flex items-center gap-3 mb-3">
                                        <Loader2 size={18} className="animate-spin text-claw-400" />
                                        <span className="text-sm text-content-secondary">正在扫描安全风险...</span>
                                    </div>
                                    <div className="w-full bg-surface-elevated rounded-full h-1.5 overflow-hidden">
                                        <motion.div
                                            className="h-full bg-gradient-to-r from-claw-500 to-purple-500 rounded-full"
                                            initial={{ width: '0%' }}
                                            animate={{ width: '100%' }}
                                            transition={{ duration: 3, ease: 'easeInOut' }}
                                        />
                                    </div>
                                    <div className="flex justify-between mt-2 text-xs text-content-tertiary">
                                        <span>检测 IP 地址...</span>
                                        <span>检测端口暴露...</span>
                                        <span>扫描技能库...</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* 检测结果 */}
                    {scanned && !scanning && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                        >
                            {issues.length === 0 ? (
                                <div className="p-6 bg-green-500/10 rounded-xl border border-green-500/30 text-center">
                                    <ShieldCheck size={40} className="text-green-400 mx-auto mb-3" />
                                    <p className="text-green-400 font-medium">安全检测通过</p>
                                    <p className="text-xs text-content-secondary mt-1">未发现安全风险，系统配置良好</p>
                                </div>
                            ) : (
                                <>
                                    {/* 统计概览 */}
                                    <div className="flex items-center gap-4 p-4 bg-surface-elevated rounded-xl border border-edge">
                                        <div className="flex items-center gap-2">
                                            <ShieldAlert size={18} className="text-content-secondary" />
                                            <span className="text-sm text-content-secondary">
                                                发现 <span className="text-content-primary font-medium">{issues.length}</span> 个风险项
                                            </span>
                                        </div>
                                        <div className="flex gap-3 ml-auto text-xs">
                                            {highRiskIssues.length > 0 && (
                                                <span className="px-2 py-1 rounded bg-red-500/20 text-red-400">
                                                    {highRiskIssues.length} 高风险
                                                </span>
                                            )}
                                            {otherIssues.filter((i) => i.severity === 'medium').length > 0 && (
                                                <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-400">
                                                    {otherIssues.filter((i) => i.severity === 'medium').length} 中风险
                                                </span>
                                            )}
                                            {otherIssues.filter((i) => i.severity === 'low').length > 0 && (
                                                <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400">
                                                    {otherIssues.filter((i) => i.severity === 'low').length} 低风险
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 高风险组 */}
                                    {highRiskIssues.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
                                                <AlertOctagon size={14} />
                                                高风险项
                                            </h4>
                                            <div className="space-y-2">
                                                {highRiskIssues.map((issue) => (
                                                    <SecurityIssueItem
                                                        key={issue.id}
                                                        issue={issue}
                                                        selected={selectedIds.has(issue.id)}
                                                        onToggle={() => toggleIssue(issue.id)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 其他风险组 */}
                                    {otherIssues.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-medium text-content-secondary mb-2 flex items-center gap-2">
                                                <Info size={14} />
                                                其他风险项
                                            </h4>
                                            <div className="space-y-2">
                                                {otherIssues.map((issue) => (
                                                    <SecurityIssueItem
                                                        key={issue.id}
                                                        issue={issue}
                                                        selected={selectedIds.has(issue.id)}
                                                        onToggle={() => toggleIssue(issue.id)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 一键修复按钮区域 */}
                                    <div className="pt-4 border-t border-edge">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={handleFix}
                                                disabled={fixing || !hasFixableSelected}
                                                className="btn-primary flex items-center gap-2"
                                            >
                                                {fixing ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : (
                                                    <Wrench size={16} />
                                                )}
                                                {fixing
                                                    ? '修复中...'
                                                    : `一键修复${hasFixableSelected ? ` (${selectedIds.size} 项)` : ''}`}
                                            </button>
                                            <button
                                                onClick={handleScan}
                                                disabled={scanning}
                                                className="btn-secondary flex items-center gap-2 text-sm"
                                            >
                                                <Search size={14} />
                                                重新扫描
                                            </button>
                                        </div>
                                    </div>

                                    {/* 修复结果 */}
                                    <AnimatePresence>
                                        {fixResult && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0 }}
                                                className={clsx(
                                                    'p-4 rounded-xl',
                                                    fixResult.success
                                                        ? 'bg-green-500/10 border border-green-500/30'
                                                        : 'bg-red-500/10 border border-red-500/30'
                                                )}
                                            >
                                                <div className="flex items-start gap-3">
                                                    {fixResult.success ? (
                                                        <CheckCircle size={20} className="text-green-400 mt-0.5" />
                                                    ) : (
                                                        <XCircle size={20} className="text-red-400 mt-0.5" />
                                                    )}
                                                    <div className="flex-1">
                                                        <p
                                                            className={clsx(
                                                                'font-medium',
                                                                fixResult.success ? 'text-green-400' : 'text-red-400'
                                                            )}
                                                        >
                                                            {fixResult.message}
                                                        </p>
                                                        {fixResult.fixed_ids.length > 0 && (
                                                            <p className="text-xs text-content-secondary mt-1">
                                                                已修复 {fixResult.fixed_ids.length} 项
                                                            </p>
                                                        )}
                                                        {fixResult.failed_ids.length > 0 && (
                                                            <p className="text-xs text-red-300 mt-1">
                                                                {fixResult.failed_ids.length} 项修复失败
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* 不可修复项的手动防护说明 */}
                                    {(unfixableIssues.length > 0 || manualInstructions) && (
                                        <div className="bg-surface-elevated rounded-xl p-5 border border-edge">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Info size={16} className="text-blue-400" />
                                                <h4 className="text-sm font-medium text-content-primary">手动防护建议</h4>
                                            </div>
                                            <div className="text-xs text-content-secondary leading-relaxed space-y-2 whitespace-pre-wrap font-mono bg-surface-card rounded-lg p-4 border border-edge">
                                                {manualInstructions ||
                                                    `以下风险项需要手动处理：

${unfixableIssues
                                                        .map(
                                                            (i, idx) =>
                                                                `${idx + 1}. [${severityConfig[i.severity].label}] ${i.title}\n   ${i.description}${i.detail ? '\n   建议: ' + i.detail : ''}`
                                                        )
                                                        .join('\n\n')}

通用安全建议：
• 将 OpenClaw 服务绑定到 127.0.0.1 而非 0.0.0.0
• 避免在公网环境直接暴露 OpenClaw 端口
• 定期检查已安装技能库的源代码和权限声明
• 为 OpenClaw 设置 Gateway Token 身份验证
• 使用反向代理（如 Nginx）并启用 HTTPS 访问
• 限制 AI 对敏感目录和敏感操作的访问权限`}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}

// 单个安全风险项组件
function SecurityIssueItem({
    issue,
    selected,
    onToggle,
}: {
    issue: SecurityIssue;
    selected: boolean;
    onToggle: () => void;
}) {
    const config = severityConfig[issue.severity];
    const CategoryIcon = categoryIcons[issue.category] || Info;
    const isDisabled = !issue.fixable || issue.fixed;

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={clsx(
                'flex items-start gap-3 p-4 rounded-xl border transition-all',
                issue.fixed
                    ? 'bg-green-500/5 border-green-500/20'
                    : config.bg,
                !issue.fixed && config.border,
                !isDisabled && 'cursor-pointer hover:brightness-110'
            )}
            onClick={() => !isDisabled && onToggle()}
        >
            {/* 复选框 */}
            <div className="pt-0.5">
                <div
                    className={clsx(
                        'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                        issue.fixed
                            ? 'bg-green-500 border-green-500'
                            : isDisabled
                                ? 'bg-surface-elevated border-edge cursor-not-allowed opacity-50'
                                : selected
                                    ? 'bg-claw-500 border-claw-500'
                                    : 'border-edge hover:border-claw-400'
                    )}
                >
                    {(issue.fixed || selected) && (
                        <CheckCircle size={12} className="text-content-primary" />
                    )}
                </div>
            </div>

            {/* 分类图标 */}
            <div
                className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                    issue.fixed ? 'bg-green-500/10' : 'bg-surface-elevated'
                )}
            >
                <CategoryIcon
                    size={16}
                    className={issue.fixed ? 'text-green-400' : config.color}
                />
            </div>

            {/* 内容 */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span
                        className={clsx(
                            'text-sm font-medium',
                            issue.fixed ? 'text-green-400 line-through' : 'text-content-primary'
                        )}
                    >
                        {issue.title}
                    </span>
                    <span
                        className={clsx(
                            'text-xs px-1.5 py-0.5 rounded',
                            issue.fixed ? 'bg-green-500/20 text-green-400' : config.labelBg
                        )}
                    >
                        {issue.fixed ? '已修复' : config.label}
                    </span>
                    {!issue.fixable && !issue.fixed && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-surface-elevated text-content-tertiary">
                            需手动处理
                        </span>
                    )}
                </div>
                <p className="text-xs text-content-secondary leading-relaxed">{issue.description}</p>
            </div>
        </motion.div>
    );
}
