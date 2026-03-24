import { ModuleDefinition } from '../types/modules';

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    id: 'openclaw',
    name: 'OpenClaw',
    description: 'OpenClaw CLI 安装、初始化、更新与服务运行管理。',
    capabilities: ['CLI 安装与初始化', '服务启动/停止/重启', '版本更新与配置'],
    prerequisites: ['Node.js 22+'],
    installCommands: ['npm install -g openclaw@latest', 'openclaw config set gateway.mode local'],
    verifyCommands: ['openclaw --version', 'openclaw doctor'],
    docs: [
      { label: 'OpenClaw 文档', url: 'https://docs.openclaw.ai' },
    ],
    faqs: [
      {
        question: '安装后命令找不到怎么办？',
        answer: '请重启终端后再次执行，或确认 npm 全局目录在 PATH 中。',
      },
      {
        question: '为什么服务无法启动？',
        answer: '先执行 openclaw doctor 检查依赖与配置，然后在测试诊断页查看详细日志。',
      },
    ],
    actions: [
      {
        id: 'openclaw_setup',
        label: '运行安装与配置向导',
        description: '使用内置向导完成 Node.js/OpenClaw 安装与 Tuzi 快速接入。',
      },
    ],
  },
  {
    id: 'codex',
    name: 'Codex',
    description: 'Codex CLI 的安装前置、安装命令、验证命令与常见问题引导。',
    capabilities: ['安装引导', '命令校验', '常见问题排查'],
    prerequisites: ['Node.js 22+'],
    installCommands: ['npm install -g @openai/codex'],
    verifyCommands: ['codex --version', 'codex --help'],
    docs: [
      { label: 'Codex 文档', url: 'https://developers.openai.com/codex' },
      { label: 'OpenAI 平台', url: 'https://platform.openai.com/' },
    ],
    faqs: [
      {
        question: '安装后 codex 命令不存在？',
        answer: '确认 npm 全局安装目录已加入 PATH，必要时重启终端。',
      },
      {
        question: '如何进行身份验证？',
        answer: '通常通过 API Key 或平台登录方式完成认证，按官方文档指引配置。',
      },
    ],
    actions: [
      {
        id: 'codex_copy_install',
        label: '复制安装命令',
        description: '将安装命令复制到终端执行。',
        command: 'npm install -g @openai/codex',
      },
    ],
  },
  {
    id: 'claudecode',
    name: 'Claude Code',
    description: 'Claude Code CLI 的安装前置、安装命令、验证命令与常见问题引导。',
    capabilities: ['安装引导', '命令校验', '常见问题排查'],
    prerequisites: ['Node.js 22+'],
    installCommands: ['npm install -g @anthropic-ai/claude-code'],
    verifyCommands: ['claude --version', 'claude --help'],
    docs: [
      { label: 'Claude Code 文档', url: 'https://docs.anthropic.com' },
    ],
    faqs: [
      {
        question: '为什么检测不到 Claude Code？',
        answer: '当前通过 claude 命令检测，请确认 CLI 已安装并可在终端直接执行。',
      },
      {
        question: '安装后需要额外配置吗？',
        answer: '通常需要按官方文档完成 API Key 或账号登录配置。',
      },
    ],
    actions: [
      {
        id: 'claude_copy_install',
        label: '复制安装命令',
        description: '将安装命令复制到终端执行。',
        command: 'npm install -g @anthropic-ai/claude-code',
      },
    ],
  },
];

export function getModuleDefinition(moduleId: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((item) => item.id === moduleId);
}
