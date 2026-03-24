import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import {
  api,
  EnvironmentStatus,
  TuziSkillInstallResult,
  TuziSkillsCheckResult,
  TuziSkillsManifest,
  TuziSkillsPluginGroup,
  TuziSkillsStatus,
} from '../../lib/tauri';

interface SkillsProps {
  envStatus: EnvironmentStatus | null;
  onNavigateToSettings: () => void;
  onNavigateToSetup: () => void;
}

type GroupActionMap = Record<string, 'install' | 'remove' | null>;

const SKILL_NOTES: Record<string, string> = {
  'tuzi-xhs-images': '小红书信息图系列生成器，将内容拆成 1-10 张卡通风格信息图。',
  'tuzi-infographic': '专业信息图生成器，自动推荐布局与视觉风格组合。',
  'tuzi-cover-image': '为文章生成封面图，支持类型、配色、渲染、文字和氛围组合。',
  'tuzi-slide-deck': '从内容生成专业幻灯片图片，先出大纲再逐页生成。',
  'tuzi-comic': '知识漫画创作器，支持画风与基调组合并逐页生成分镜图片。',
  'tuzi-article-illustrator': '智能文章插图技能，分析文章结构并生成配图。',
  'tuzi-post-to-x': '发布内容和长文到 X(Twitter)，支持真实 Chrome + CDP。',
  'tuzi-post-to-wechat': '发布内容到微信公众号，支持贴图模式和文章模式。',
  'tuzi-short-video': '为小红书、抖音、X、视频号等平台生成短视频内容。',
  'tuzi-copy-polish': '优化社交媒体文案，按平台调整文风、长度、标签和排版。',
  'tuzi-image-gen': '多服务商 AI 图像生成，默认接入兔子 API，也支持 OpenAI/Google 等。',
  'tuzi-video-gen': 'AI 视频生成后端，支持 Veo、Sora、Kling、Seedance 等模型。',
  'tuzi-danger-gemini-web': '与 Gemini Web 交互，生成文本和图片。',
  'tuzi-url-to-markdown': '通过 Chrome CDP 抓取任意 URL 并转换为干净的 Markdown。',
  'tuzi-danger-x-to-markdown': '将 X(Twitter) 推文串和文章转换为 Markdown。',
  'tuzi-compress-image': '压缩图片以减小体积，同时尽量保持质量。',
  'tuzi-format-markdown': '格式化纯文本或 Markdown，补齐 frontmatter、标题和排版结构。',
  'tuzi-markdown-to-html': '将 Markdown 转成带样式的 HTML，适合公众号等发布场景。',
  'tuzi-update-claude-md': '根据代码审查或开发反馈提炼规则并更新 CLAUDE.md。',
  'release-skills': '通用发布工作流，自动检测版本文件和变更日志。',
};

function getSkillNote(skill: string): string {
  return SKILL_NOTES[skill] || '来自 tuzi-skills 官方 README 的技能项。';
}

function formatDateTime(input: string | null): string {
  if (!input) return '未刷新';
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) return input;
  return value.toLocaleString();
}

function getGroupStatus(status: TuziSkillsStatus | null, groupName: string) {
  return status?.group_status.find((item) => item.group_name === groupName) || null;
}

function resultDetails(result: TuziSkillInstallResult | null): string {
  if (!result) return '';
  return [result.stdout.trim(), result.stderr.trim(), result.error?.trim()]
    .filter(Boolean)
    .join('\n\n');
}

function applyInstalledSkills(
  current: TuziSkillsStatus | null,
  manifest: TuziSkillsManifest | null,
  skills: string[],
  action: 'install' | 'remove'
): TuziSkillsStatus | null {
  if (!current || !manifest) return current;

  const skillSet = new Set(current.installed_skills);
  for (const skill of skills) {
    if (action === 'install') {
      skillSet.add(skill);
    } else {
      skillSet.delete(skill);
    }
  }

  const installedSkills = Array.from(skillSet).sort();
  const groupStatus = manifest.plugins.map((group) => {
    const installedCount = group.skills.filter((skill) => skillSet.has(skill)).length;
    return {
      group_name: group.name,
      installed_count: installedCount,
      total_count: group.skills.length,
      fully_installed: installedCount === group.skills.length && group.skills.length > 0,
    };
  });

  return {
    ...current,
    installed_skills: installedSkills,
    group_status: groupStatus,
    last_checked_at: new Date().toISOString(),
  };
}

export function Skills({
  envStatus,
  onNavigateToSettings,
  onNavigateToSetup,
}: SkillsProps) {
  const [manifest, setManifest] = useState<TuziSkillsManifest | null>(null);
  const [status, setStatus] = useState<TuziSkillsStatus | null>(null);
  const [requirements, setRequirements] = useState<TuziSkillsCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installingAll, setInstallingAll] = useState(false);
  const [groupActions, setGroupActions] = useState<GroupActionMap>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [operationResult, setOperationResult] = useState<TuziSkillInstallResult | null>(null);

  const blockedByNode = !!envStatus && (!envStatus.node_installed || !envStatus.node_version_ok);
  const blockedByCli = !!status && !status.cli_available;
  const blocked = blockedByNode || blockedByCli;
  const actionBusy = installingAll || Object.values(groupActions).some(Boolean);

  const summaryCards = useMemo(
    () => [
      {
        label: 'skills CLI',
        value: status?.cli_available ? '可用' : '不可用',
        valueClassName: status?.cli_available ? 'text-green-400' : 'text-red-400',
      },
      {
        label: '远端清单版本',
        value: manifest?.version || '未知',
        valueClassName: manifest?.stale ? 'text-yellow-300' : 'text-white',
      },
      {
        label: '已安装技能数',
        value: String(status?.installed_skills.length || 0),
        valueClassName: 'text-white',
      },
      {
        label: '最近刷新时间',
        value: formatDateTime(status?.last_checked_at || null),
        valueClassName: 'text-white',
      },
    ],
    [manifest?.stale, manifest?.version, status?.cli_available, status?.installed_skills.length, status?.last_checked_at]
  );

  const loadData = async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setPageError(null);

    try {
      const data = await api.refreshTuziSkills();
      setManifest(data.manifest);
      setStatus(data.status);
      setRequirements(data.requirements);
    } catch (e) {
      setPageError(String(e));
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInstallAll = async () => {
    if (blocked || actionBusy) return;

    setInstallingAll(true);
    setOperationResult(null);
    setPageError(null);
    try {
      const result = await api.installAllTuziSkills();
      setOperationResult(result);
      if (result.success && manifest) {
        const allSkills = manifest.plugins.flatMap((group) => group.skills);
        setStatus((current) => applyInstalledSkills(current, manifest, allSkills, 'install'));
      }
      void loadData(true);
    } catch (e) {
      setPageError(String(e));
    } finally {
      setInstallingAll(false);
    }
  };

  const handleGroupAction = async (
    group: TuziSkillsPluginGroup,
    action: 'install' | 'remove'
  ) => {
    if (action === 'install' && blocked) return;
    if (actionBusy) return;

    setGroupActions((prev) => ({ ...prev, [group.name]: action }));
    setOperationResult(null);
    setPageError(null);

    try {
      const result =
        action === 'install'
          ? await api.installTuziSkillsGroup(group.name)
          : await api.removeTuziSkillsGroup(group.name);
      setOperationResult(result);
      if (result.success) {
        setStatus((current) => applyInstalledSkills(current, manifest, group.skills, action));
      }
      void loadData(true);
    } catch (e) {
      setPageError(String(e));
    } finally {
      setGroupActions((prev) => ({ ...prev, [group.name]: null }));
    }
  };

  const handleCheckRequirements = async () => {
    setChecking(true);
    setPageError(null);
    try {
      setRequirements(await api.checkTuziSkillsRequirements());
    } catch (e) {
      setPageError(String(e));
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-claw-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-400">正在加载 Skills 状态...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scroll-container pr-2">
      <div className="max-w-6xl space-y-6">
        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-claw-500/20 flex items-center justify-center">
                  <Sparkles size={20} className="text-claw-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">tuzi-skills 官方技能集</h3>
                  <p className="text-sm text-gray-400">
                    安装到全局 OpenClaw 技能目录，不会改动当前项目仓库代码。
                  </p>
                </div>
              </div>
              {manifest?.stale && (
                <p className="text-sm text-yellow-300">
                  远端清单暂时不可用，当前使用内置兜底定义，信息可能不是最新。
                </p>
              )}
              {manifest?.error && <p className="text-xs text-gray-500 mt-1">{manifest.error}</p>}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => loadData(true)}
                disabled={refreshing || actionBusy}
                className="px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-200 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                刷新状态
              </button>
              <button
                onClick={handleInstallAll}
                disabled={blocked || actionBusy}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {installingAll ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                安装全部
              </button>
            </div>
          </div>
        </div>

        {blocked && (
          <div className="bg-red-950/30 border border-red-900/40 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert className="text-red-400 mt-1" size={20} />
              <div className="flex-1">
                <p className="text-red-300 font-medium">当前环境还不能执行 skills 安装</p>
                <p className="text-sm text-red-200/80 mt-1">
                  {blockedByNode
                    ? '需要先安装 Node.js 22+，Skills 页面才能调用 npx skills。'
                    : status?.error || 'skills CLI 当前不可用。'}
                </p>
                <div className="flex items-center gap-3 mt-4">
                  {blockedByNode && (
                    <button
                      onClick={onNavigateToSetup}
                      className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors"
                    >
                      去模块中心
                    </button>
                  )}
                  <button
                    onClick={onNavigateToSettings}
                    className="px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-white text-sm transition-colors"
                  >
                    去设置页
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {pageError && (
          <div className="bg-red-950/30 border border-red-900/40 rounded-2xl p-4 text-sm text-red-200">
            {pageError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {summaryCards.map((card) => (
            <div key={card.label} className="bg-dark-700 rounded-2xl p-5 border border-dark-500">
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className={clsx('text-lg font-semibold mt-2 break-words', card.valueClassName)}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
          <h4 className="text-white font-medium mb-1">官方分组</h4>
          <p className="text-sm text-gray-400 mb-4">按 `tuzi-skills` 官方插件分组安装或移除。</p>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {(manifest?.plugins || []).map((group) => {
              const currentStatus = getGroupStatus(status, group.name);
              const action = groupActions[group.name];
              const installing = action === 'install';
              const removing = action === 'remove';

              return (
                <div key={group.name} className="rounded-2xl border border-dark-500 bg-dark-600 p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h5 className="text-white font-medium">{group.name}</h5>
                      <p className="text-sm text-gray-400 mt-1">{group.description}</p>
                    </div>
                    {currentStatus?.fully_installed ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400">
                        <CheckCircle2 size={14} />
                        已完整安装
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-dark-500 text-gray-300">
                        {currentStatus?.installed_count ?? 0}/{currentStatus?.total_count ?? group.skills.length}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 space-y-2 flex-1">
                    {group.skills.map((skill) => {
                      const installed = status?.installed_skills.includes(skill);
                      return (
                        <div key={skill} className="rounded-lg bg-dark-700 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-gray-200 text-sm font-medium">{skill}</span>
                            <span className={clsx('text-xs shrink-0', installed ? 'text-green-400' : 'text-gray-500')}>
                              {installed ? '已安装' : '未安装'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 leading-5">
                            {getSkillNote(skill)}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-3 mt-5">
                    <button
                      onClick={() => handleGroupAction(group, 'install')}
                      disabled={blocked || actionBusy}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-claw-600 hover:bg-claw-500 text-white text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {installing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                      {currentStatus?.installed_count ? '重新同步' : '安装分组'}
                    </button>
                    <button
                      onClick={() => handleGroupAction(group, 'remove')}
                      disabled={actionBusy}
                      className="px-4 py-2.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-900/40 text-red-300 text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {removing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      移除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
            <h4 className="text-white font-medium mb-3">已安装的 tuzi-skills</h4>
            <p className="text-sm text-gray-400 mb-4">只显示属于 `tuzi-skills` 技能集的全局技能。</p>

            {status?.installed_skills.length ? (
              <div className="space-y-2">
                {status.installed_skills.map((skill) => (
                  <div key={skill} className="rounded-lg bg-dark-600 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-200 font-medium">{skill}</span>
                      <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 leading-5">
                      {getSkillNote(skill)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-dark-600 px-4 py-6 text-sm text-gray-400">
                当前还没有检测到已安装的 tuzi-skills。
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-white font-medium">前置依赖检查</h4>
                  <p className="text-sm text-gray-400">执行 `npx skills check`，查看是否有缺失依赖或异常项。</p>
                </div>
                <button
                  onClick={handleCheckRequirements}
                  disabled={checking}
                  className="px-4 py-2 rounded-lg bg-dark-600 hover:bg-dark-500 text-sm text-gray-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {checking ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
                  检查缺失依赖
                </button>
              </div>

              <div className="rounded-xl bg-dark-600 p-4 space-y-2">
                <p className="text-sm text-gray-300">
                  检查结果：
                  <span className={clsx('ml-2 font-medium', requirements?.all_up_to_date ? 'text-green-400' : 'text-yellow-300')}>
                    {requirements?.all_up_to_date ? '全部最新' : '需要关注'}
                  </span>
                </p>
                <p className="text-sm text-gray-400">已检查技能：{requirements?.checked_count ?? 0}</p>
                <p className="text-sm text-gray-400">检查失败：{requirements?.failed_count ?? 0}</p>
                {requirements?.error && (
                  <div className="flex items-start gap-2 text-sm text-red-300 pt-2">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>{requirements.error}</span>
                  </div>
                )}
              </div>

              <pre className="mt-4 rounded-xl bg-dark-800 p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
                {requirements?.raw_output?.trim() || '暂无检查输出'}
              </pre>
            </div>

            <div className="bg-dark-700 rounded-2xl p-6 border border-dark-500">
              <h4 className="text-white font-medium mb-3">最近一次操作</h4>
              {operationResult ? (
                <>
                  <div
                    className={clsx(
                      'rounded-xl p-4 text-sm',
                      operationResult.success
                        ? 'bg-green-900/20 border border-green-800 text-green-200'
                        : 'bg-red-950/30 border border-red-900/40 text-red-200'
                    )}
                  >
                    <p className="font-medium">{operationResult.message}</p>
                    {operationResult.error && (
                      <p className="mt-2 text-xs opacity-80">{operationResult.error}</p>
                    )}
                  </div>
                  <pre className="mt-4 rounded-xl bg-dark-800 p-4 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
                    {resultDetails(operationResult) || '没有额外输出'}
                  </pre>
                </>
              ) : (
                <div className="rounded-xl bg-dark-600 px-4 py-6 text-sm text-gray-400">
                  还没有执行安装或移除操作。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
