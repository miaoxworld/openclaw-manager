import { invoke } from '@tauri-apps/api/core';
import { apiLogger } from './logger';
import { ModuleType } from '../types/modules';

// 检查是否在 Tauri 环境中运行
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// 带日志的 invoke 封装（自动检查 Tauri 环境）
async function invokeWithLog<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error('不在 Tauri 环境中运行，请通过 Tauri 应用启动');
  }
  apiLogger.apiCall(cmd, args);
  try {
    const result = await invoke<T>(cmd, args);
    apiLogger.apiResponse(cmd, result);
    return result;
  } catch (error) {
    apiLogger.apiError(cmd, error);
    throw error;
  }
}

// 服务状态
export interface ServiceStatus {
  running: boolean;
  pid: number | null;
  port: number;
  uptime_seconds: number | null;
  memory_mb: number | null;
  cpu_percent: number | null;
}

// 系统信息
export interface SystemInfo {
  os: string;
  os_version: string;
  arch: string;
  openclaw_installed: boolean;
  openclaw_version: string | null;
  node_version: string | null;
  config_dir: string;
}

// AI Provider 选项（旧版兼容）
export interface AIProviderOption {
  id: string;
  name: string;
  icon: string;
  default_base_url: string | null;
  models: AIModelOption[];
  requires_api_key: boolean;
}

export interface AIModelOption {
  id: string;
  name: string;
  description: string | null;
  recommended: boolean;
}

// 官方 Provider 预设
export interface OfficialProvider {
  id: string;
  name: string;
  icon: string;
  default_base_url: string | null;
  api_type: string;
  suggested_models: SuggestedModel[];
  requires_api_key: boolean;
  docs_url: string | null;
  source?: string | null;
}

export interface SuggestedModel {
  id: string;
  name: string;
  description: string | null;
  context_window: number | null;
  max_tokens: number | null;
  recommended: boolean;
}

// 已配置的 Provider
export interface ConfiguredProvider {
  name: string;
  base_url: string;
  api_key_masked: string | null;
  has_api_key: boolean;
  models: ConfiguredModel[];
}

export interface ConfiguredModel {
  full_id: string;
  id: string;
  name: string;
  api_type: string | null;
  context_window: number | null;
  max_tokens: number | null;
  is_primary: boolean;
}

// AI 配置概览
export interface AIConfigOverview {
  primary_model: string | null;
  configured_providers: ConfiguredProvider[];
  available_models: string[];
}

export type TuziGroup = 'claude-code' | 'codex' | 'gaccode';

export interface TuziGroupConfig {
  group: TuziGroup;
  configured: boolean;
  provider_id: string;
  provider_ids: string[];
  base_url: string;
  api_type: string;
  api_key_masked: string | null;
  primary_model: string | null;
  models: string[];
}

export interface TuziConfigOverview {
  configured: boolean;
  groups: TuziGroupConfig[];
}

export type TuziModelsSource = 'api' | 'cache';

export interface TuziModelsResponse {
  models: string[];
  source: TuziModelsSource;
  cache_timestamp: string | null;
  warning: string | null;
}

export interface TuziModelTemplate {
  group: TuziGroup;
  provider_id: string;
  name: string;
  default_base_url: string;
  api_type: string;
  suggested_models: SuggestedModel[];
}

// 模型配置
export interface ModelConfig {
  id: string;
  name: string;
  api: string | null;
  input: string[];
  context_window: number | null;
  max_tokens: number | null;
  reasoning: boolean | null;
  cost: { input: number; output: number; cache_read: number; cache_write: number } | null;
}

// 渠道配置
export interface ChannelConfig {
  id: string;
  channel_type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

// 诊断结果
export interface DiagnosticResult {
  name: string;
  passed: boolean;
  message: string;
  suggestion: string | null;
}

// AI 测试结果
export interface AITestResult {
  success: boolean;
  provider: string;
  model: string;
  response: string | null;
  error: string | null;
  latency_ms: number | null;
}

export interface EnvironmentStatus {
  node_installed: boolean;
  node_version: string | null;
  node_version_ok: boolean;
  openclaw_installed: boolean;
  openclaw_version: string | null;
  config_dir_exists: boolean;
  ai_configured: boolean;
  tuzi_configured: boolean;
  ready: boolean;
  os: string;
}

export interface ModuleStatus {
  module_id: ModuleType;
  installed: boolean;
  version: string | null;
  message: string;
}

export interface ModuleStatusOverview {
  node_installed: boolean;
  node_version: string | null;
  modules: ModuleStatus[];
}

export type ClaudeInstallScheme = 'A' | 'B' | 'C';

export interface ClaudeRoute {
  name: string;
  base_url: string | null;
  has_key: boolean;
  is_current: boolean;
  api_key_masked: string | null;
}

export interface ClaudeEnvSummary {
  anthropic_api_key_masked: string | null;
  anthropic_base_url: string | null;
  anthropic_api_token_set: boolean;
}

export interface ClaudeCodeStatus {
  installed: boolean;
  version: string | null;
  current_route: string | null;
  route_file_exists: boolean;
  routes: ClaudeRoute[];
  env_summary: ClaudeEnvSummary;
}

export interface ClaudeReferenceDocs {
  readme_markdown: string;
  flow_markdown: string;
  updated_at: string | null;
  error: string | null;
}

export interface ClaudeActionResult {
  success: boolean;
  message: string;
  error: string | null;
  stdout: string;
  stderr: string;
  restart_required: boolean;
}

export interface ClaudeRoutesResponse {
  current_route: string | null;
  routes: ClaudeRoute[];
}

export type CodexInstallVariant = 'openai' | 'gac';
export type CodexInstallType = 'openai' | 'gac' | 'unknown';

export interface CodexModelSettings {
  model: string;
  model_reasoning_effort: string;
}

export interface CodexRoute {
  name: string;
  base_url: string | null;
  has_key: boolean;
  is_current: boolean;
  api_key_masked: string | null;
  model_settings: CodexModelSettings;
}

export interface CodexEnvSummary {
  codex_api_key_masked: string | null;
}

export interface CodexStatus {
  installed: boolean;
  version: string | null;
  install_type: CodexInstallType | null;
  current_route: string | null;
  state_file_exists: boolean;
  config_file_exists: boolean;
  routes: CodexRoute[];
  env_summary: CodexEnvSummary;
}

export interface CodexReferenceDocs {
  script_markdown: string;
  updated_at: string | null;
  error: string | null;
}

export interface CodexActionResult {
  success: boolean;
  message: string;
  error: string | null;
  stdout: string;
  stderr: string;
  restart_required: boolean;
}

export interface CodexRoutesResponse {
  current_route: string | null;
  routes: CodexRoute[];
}

export interface TuziSkillsPluginGroup {
  name: string;
  description: string;
  skills: string[];
}

export interface TuziSkillsManifest {
  marketplace_name: string;
  version: string;
  plugins: TuziSkillsPluginGroup[];
  stale: boolean;
  source: string;
  error: string | null;
}

export interface TuziSkillsGroupStatus {
  group_name: string;
  installed_count: number;
  total_count: number;
  fully_installed: boolean;
}

export interface TuziSkillsStatus {
  cli_available: boolean;
  installed_skills: string[];
  group_status: TuziSkillsGroupStatus[];
  last_checked_at: string;
  error: string | null;
}

export interface TuziSkillsCheckResult {
  all_up_to_date: boolean;
  checked_count: number;
  failed_count: number;
  raw_output: string;
  error: string | null;
}

export interface TuziSkillInstallResult {
  running: boolean;
  success: boolean;
  message: string;
  error: string | null;
  stdout: string;
  stderr: string;
}

export interface TuziSkillsRefreshResult {
  manifest: TuziSkillsManifest;
  status: TuziSkillsStatus;
  requirements: TuziSkillsCheckResult;
}

// API 封装（带日志）
export const api = {
  // 服务管理
  getServiceStatus: () => invokeWithLog<ServiceStatus>('get_service_status'),
  startService: () => invokeWithLog<string>('start_service'),
  stopService: () => invokeWithLog<string>('stop_service'),
  restartService: () => invokeWithLog<string>('restart_service'),
  getLogs: (lines?: number) => invokeWithLog<string[]>('get_logs', { lines }),

  // 系统信息
  getSystemInfo: () => invokeWithLog<SystemInfo>('get_system_info'),
  checkOpenclawInstalled: () => invokeWithLog<boolean>('check_openclaw_installed'),
  getOpenclawVersion: () => invokeWithLog<string | null>('get_openclaw_version'),
  getModuleStatuses: () => invokeWithLog<ModuleStatusOverview>('get_module_statuses'),
  getClaudeCodeStatus: () => invokeWithLog<ClaudeCodeStatus>('get_claudecode_status'),
  getClaudeInstallReference: () => invokeWithLog<ClaudeReferenceDocs>('get_claude_install_reference'),
  installClaudeCode: (scheme: ClaudeInstallScheme, apiKey?: string) =>
    invokeWithLog<ClaudeActionResult>('install_claudecode', { scheme, apiKey }),
  upgradeClaudeCode: (targetVariant?: string) =>
    invokeWithLog<ClaudeActionResult>('upgrade_claudecode', { targetVariant }),
  uninstallClaudeCode: (clearConfig: boolean) =>
    invokeWithLog<ClaudeActionResult>('uninstall_claudecode', { clearConfig }),
  listClaudeRoutes: () => invokeWithLog<ClaudeRoutesResponse>('list_claude_routes'),
  switchClaudeRoute: (routeName: string) =>
    invokeWithLog<ClaudeActionResult>('switch_claude_route', { routeName }),
  addClaudeRoute: (routeName: string, baseUrl: string, apiKey: string) =>
    invokeWithLog<ClaudeActionResult>('add_claude_route', { routeName, baseUrl, apiKey }),
  updateClaudeRouteKey: (routeName: string, apiKey: string) =>
    invokeWithLog<ClaudeActionResult>('update_claude_route_key', { routeName, apiKey }),
  getCodexStatus: () => invokeWithLog<CodexStatus>('get_codex_status'),
  getCodexInstallReference: () =>
    invokeWithLog<CodexReferenceDocs>('get_codex_install_reference'),
  installCodex: (
    variant: CodexInstallVariant,
    route?: string,
    apiKey?: string,
    model?: string,
    modelReasoningEffort?: string
  ) =>
    invokeWithLog<CodexActionResult>('install_codex', {
      variant,
      route,
      api_key: apiKey,
      model,
      model_reasoning_effort: modelReasoningEffort,
    }),
  upgradeCodex: (targetVariant?: CodexInstallVariant) =>
    invokeWithLog<CodexActionResult>('upgrade_codex', { target_variant: targetVariant }),
  uninstallCodex: (clearConfig: boolean) =>
    invokeWithLog<CodexActionResult>('uninstall_codex', { clear_config: clearConfig }),
  reinstallCodex: (
    variant: CodexInstallVariant,
    route?: string,
    apiKey?: string,
    model?: string,
    modelReasoningEffort?: string,
    clearConfig?: boolean
  ) =>
    invokeWithLog<CodexActionResult>('reinstall_codex', {
      variant,
      route,
      api_key: apiKey,
      model,
      model_reasoning_effort: modelReasoningEffort,
      clear_config: clearConfig,
    }),
  listCodexRoutes: () => invokeWithLog<CodexRoutesResponse>('list_codex_routes'),
  switchCodexRoute: (
    routeName: string,
    apiKey: string,
    model?: string,
    modelReasoningEffort?: string
  ) =>
    invokeWithLog<CodexActionResult>('switch_codex_route', {
      route_name: routeName,
      api_key: apiKey,
      model,
      model_reasoning_effort: modelReasoningEffort,
    }),
  setCodexRouteModel: (
    routeName: string,
    model: string,
    modelReasoningEffort?: string
  ) =>
    invokeWithLog<CodexActionResult>('set_codex_route_model', {
      route_name: routeName,
      model,
      model_reasoning_effort: modelReasoningEffort,
    }),

  // 配置管理
  getConfig: () => invokeWithLog<unknown>('get_config'),
  saveConfig: (config: unknown) => invokeWithLog<string>('save_config', { config }),
  getEnvValue: (key: string) => invokeWithLog<string | null>('get_env_value', { key }),
  saveEnvValue: (key: string, value: string) =>
    invokeWithLog<string>('save_env_value', { key, value }),

  // AI Provider（旧版兼容）
  getAIProviders: () => invokeWithLog<AIProviderOption[]>('get_ai_providers'),

  // AI 配置（新版）
  getOfficialProviders: () => invokeWithLog<OfficialProvider[]>('get_official_providers'),
  fetchTuziModels: (group: TuziGroup, apiKey: string) =>
    invokeWithLog<TuziModelsResponse>('fetch_tuzi_models', { group, apiKey }),
  getTuziTemplates: () => invokeWithLog<TuziModelTemplate[]>('get_tuzi_templates'),
  getTuziConfig: () => invokeWithLog<TuziConfigOverview>('get_tuzi_config'),
  getAIConfig: () => invokeWithLog<AIConfigOverview>('get_ai_config'),
  saveTuziConfig: (group: TuziGroup, apiKey: string, models: string[]) =>
    invokeWithLog<string>('save_tuzi_config', { group, apiKey, models }),
  saveProvider: (
    providerName: string,
    baseUrl: string,
    apiKey: string | null,
    apiType: string,
    models: ModelConfig[]
  ) =>
    invokeWithLog<string>('save_provider', {
      providerName,
      baseUrl,
      apiKey,
      apiType,
      models,
    }),
  deleteProvider: (providerName: string) =>
    invokeWithLog<string>('delete_provider', { providerName }),
  setPrimaryModel: (modelId: string) =>
    invokeWithLog<string>('set_primary_model', { modelId }),
  addAvailableModel: (modelId: string) =>
    invokeWithLog<string>('add_available_model', { modelId }),
  removeAvailableModel: (modelId: string) =>
    invokeWithLog<string>('remove_available_model', { modelId }),

  // 渠道
  getChannelsConfig: () => invokeWithLog<ChannelConfig[]>('get_channels_config'),
  saveChannelConfig: (channel: ChannelConfig) =>
    invokeWithLog<string>('save_channel_config', { channel }),

  // 诊断测试
  runDoctor: () => invokeWithLog<DiagnosticResult[]>('run_doctor'),
  testAIConnection: () => invokeWithLog<AITestResult>('test_ai_connection'),
  testModelConnection: (providerId: string, modelId: string) =>
    invokeWithLog<AITestResult>('test_model_connection', { providerId, modelId }),
  testChannel: (channelType: string) =>
    invokeWithLog<unknown>('test_channel', { channelType }),

  // Skills
  getTuziSkillsManifest: () =>
    invokeWithLog<TuziSkillsManifest>('get_tuzi_skills_manifest'),
  getTuziSkillsStatus: () =>
    invokeWithLog<TuziSkillsStatus>('get_tuzi_skills_status'),
  installTuziSkillsGroup: (groupName: string) =>
    invokeWithLog<TuziSkillInstallResult>('install_tuzi_skills_group', { groupName }),
  installAllTuziSkills: () =>
    invokeWithLog<TuziSkillInstallResult>('install_all_tuzi_skills'),
  removeTuziSkillsGroup: (groupName: string) =>
    invokeWithLog<TuziSkillInstallResult>('remove_tuzi_skills_group', { groupName }),
  checkTuziSkillsRequirements: () =>
    invokeWithLog<TuziSkillsCheckResult>('check_tuzi_skills_requirements'),
  refreshTuziSkills: () =>
    invokeWithLog<TuziSkillsRefreshResult>('refresh_tuzi_skills'),
};
