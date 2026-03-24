import { FaqCategory, FaqEntry } from './types';

export interface FaqCategoryDefinition {
  id: FaqCategory;
  label: string;
}

export const FAQ_CATEGORIES: FaqCategoryDefinition[] = [
  { id: 'prerequisites', label: '开始前' },
  { id: 'install-options', label: '安装与方案选择' },
  { id: 'post-install', label: '安装后配置' },
  { id: 'lifecycle', label: '升级/卸载/重装' },
  { id: 'troubleshooting', label: '常见故障排查' },
];

export const DEFAULT_EXPANDED_SECTIONS: FaqCategory[] = ['prerequisites', 'troubleshooting'];

export const claudeFaqEntries: FaqEntry[] = [
  {
    id: 'claude-precheck-node',
    category: 'prerequisites',
    question: '安装 ClaudeCode 前需要准备什么？',
    answer:
      '建议先确认 Node.js 与 npm 可用，并确保终端网络可以访问安装源。若是首次安装，建议优先从安装页直接执行方案卡，避免手动脚本遗漏环境变量。',
    keywords: ['node', 'npm', '准备', '环境检查', 'install'],
    commands: [
      { label: '检查 Node.js', command: 'node -v' },
      { label: '检查 npm', command: 'npm -v' },
    ],
  },
  {
    id: 'claude-install-abc',
    category: 'install-options',
    question: 'A/B/C 三种安装方案怎么选？',
    answer:
      'A 是改版安装，首次通常不需要手工填 Key；B 是原版 ClaudeCode + gaccode Key；C 是原版 ClaudeCode + Tuzi 分组 Key。你可以按已有 Key 来源来选，后续都支持升级和卸载。',
    keywords: ['A', 'B', 'C', '方案选择', 'gaccode', 'tuzi'],
    actions: [{ label: '去安装页', target: 'install' }],
  },
  {
    id: 'claude-route-switch',
    category: 'post-install',
    question: '安装后如何切换路线或更新 API Key？',
    answer:
      '进入路线页可以切换当前路线，并按路线单独更新 API Key。新增路线时需要填写路线名、Base URL 和 API Key，保存后会自动应用。',
    keywords: ['路线', 'route', 'api key', 'base url', '切换'],
    actions: [{ label: '去路线页', target: 'routes' }],
  },
  {
    id: 'claude-upgrade-uninstall',
    category: 'lifecycle',
    question: '升级、卸载、重装应该怎么做？',
    answer:
      '安装页工具栏提供升级原版/改版与卸载（保留配置或清理配置）。如果升级后命令未生效，先重开终端再执行 `claude`。',
    keywords: ['升级', '卸载', '重装', '保留配置', '清理配置'],
    commands: [
      { label: '升级后验证版本', command: 'claude --version' },
    ],
    actions: [{ label: '去安装页', target: 'install' }],
  },
  {
    id: 'claude-cmd-not-found',
    category: 'troubleshooting',
    question: '出现 `claude: command not found` 怎么排查？',
    answer:
      '通常是 npm 全局 bin 未生效或 shell 未重载。先确认全局安装位置，再执行 shell 重新加载，必要时重新安装当前方案。',
    keywords: ['command not found', 'PATH', 'npm prefix', 'shell rc'],
    commands: [
      { label: '查看全局 bin', command: 'npm bin -g' },
      { label: '重载 shell 配置', command: 'source ~/.zshrc' },
    ],
    severity: 'warning',
    actions: [{ label: '去安装页', target: 'install' }],
  },
  {
    id: 'claude-auth-failed',
    category: 'troubleshooting',
    question: '认证失败或调用 401/403 怎么处理？',
    answer:
      '先确认所选方案对应的 Key 是否填写正确，并检查当前路线的 Base URL 是否匹配。若刚切换路线，建议重新写入 Key 后再试。',
    keywords: ['401', '403', '认证失败', 'api key', 'base url'],
    actions: [{ label: '去路线页', target: 'routes' }],
    severity: 'warning',
  },
];

export const codexFaqEntries: FaqEntry[] = [
  {
    id: 'codex-precheck',
    category: 'prerequisites',
    question: '安装 Codex 前最少要确认哪些环境？',
    answer:
      '建议确认 Node.js、npm 可用，并确保系统有权限写入 `~/.codex` 与 shell rc 文件。这样安装、路线配置和 Key 持久化才能正常工作。',
    keywords: ['node', 'npm', '.codex', 'shell rc', '准备'],
    commands: [
      { label: '检查 Node.js', command: 'node -v' },
      { label: '检查 npm', command: 'npm -v' },
      { label: '检查配置目录', command: 'ls -la ~/.codex' },
    ],
  },
  {
    id: 'codex-openai-vs-gac',
    category: 'install-options',
    question: '原版 openai 与改版 gac 安装有什么区别？',
    answer:
      'openai 原版支持路线管理（gac/tuzi）和模型参数配置；gac 改版安装更快，但路线管理页会禁用。按是否需要手动路线切换来选择。',
    keywords: ['openai', 'gac', '安装类型', '路线管理'],
    actions: [{ label: '去安装页', target: 'install' }],
  },
  {
    id: 'codex-route-setup',
    category: 'post-install',
    question: '如何配置 gac/tuzi 路线与模型参数？',
    answer:
      '在原版安装模式下，可在路线页切换 `gac` 或 `tuzi`，并设置 `model` 与 `model_reasoning_effort`。每次切换路线都需要重新输入 CODEX_API_KEY。',
    keywords: ['gac', 'tuzi', 'model', 'model_reasoning_effort', 'switch'],
    actions: [{ label: '去路线页', target: 'routes' }],
  },
  {
    id: 'codex-state-files',
    category: 'post-install',
    question: 'Codex 的状态和配置文件分别在哪？',
    answer:
      '安装状态写入 `~/.codex/install_state`，路线与模型配置写入 `~/.codex/config.toml`。UI 状态页展示的安装类型/当前路线就是基于这些信息。',
    keywords: ['install_state', 'config.toml', '状态文件', '配置文件'],
    commands: [
      { label: '查看 install_state', command: 'cat ~/.codex/install_state' },
      { label: '查看 config.toml', command: 'cat ~/.codex/config.toml' },
    ],
  },
  {
    id: 'codex-upgrade-uninstall',
    category: 'lifecycle',
    question: 'Codex 如何升级、卸载和重装？',
    answer:
      '安装页工具栏提供升级原版/改版、卸载（保留或清理配置）以及原版重装。执行后若提示重启终端，请先重开终端再执行 `codex`。',
    keywords: ['升级', '卸载', '重装', 'restart_required'],
    commands: [
      { label: '验证 CLI 版本', command: 'codex --version' },
    ],
    actions: [{ label: '去安装页', target: 'install' }],
  },
  {
    id: 'codex-route-disabled',
    category: 'troubleshooting',
    question: '为什么路线页显示“仅原版可用”？',
    answer:
      '当安装类型是 `gac` 改版时，路线管理会被禁用，这是预期行为。若需要路线切换能力，请改用 openai 原版安装。',
    keywords: ['路线禁用', 'gac 改版', 'openai 原版'],
    actions: [{ label: '去安装页', target: 'install' }],
    severity: 'warning',
  },
  {
    id: 'codex-api-key-issues',
    category: 'troubleshooting',
    question: '切换路线后仍报鉴权错误怎么办？',
    answer:
      '重点检查切换时是否重新输入了正确的 CODEX_API_KEY，并确认 shell rc 中的 `CODEX_API_KEY` 没有旧值覆盖。必要时重新执行一次路线切换。',
    keywords: ['鉴权', 'api key', '401', '403', 'shell rc'],
    commands: [
      { label: '检查环境变量', command: 'echo $CODEX_API_KEY' },
      { label: '重载 shell 配置', command: 'source ~/.zshrc' },
    ],
    severity: 'warning',
    actions: [{ label: '去路线页', target: 'routes' }],
  },
];
