use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// OpenClaw 完整配置 - 对应 openclaw.json 结构
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpenClawConfig {
    /// Agent 配置
    #[serde(default)]
    pub agents: AgentsConfig,
    /// 模型配置
    #[serde(default)]
    pub models: ModelsConfig,
    /// 网关配置
    #[serde(default)]
    pub gateway: GatewayConfig,
    /// 渠道配置
    #[serde(default)]
    pub channels: HashMap<String, serde_json::Value>,
    /// 插件配置
    #[serde(default)]
    pub plugins: PluginsConfig,
    /// 元数据
    #[serde(default)]
    pub meta: MetaConfig,
}

/// Agent 配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentsConfig {
    /// 默认配置
    #[serde(default)]
    pub defaults: AgentDefaults,
}

/// Agent 默认配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentDefaults {
    /// 模型配置
    #[serde(default)]
    pub model: AgentModelConfig,
    /// 可用模型列表 (provider/model -> {})
    #[serde(default)]
    pub models: HashMap<String, serde_json::Value>,
    /// 压缩配置
    #[serde(default)]
    pub compaction: Option<serde_json::Value>,
    /// 上下文裁剪
    #[serde(rename = "contextPruning", default)]
    pub context_pruning: Option<serde_json::Value>,
    /// 心跳配置
    #[serde(default)]
    pub heartbeat: Option<serde_json::Value>,
    /// 最大并发数
    #[serde(rename = "maxConcurrent", default)]
    pub max_concurrent: Option<u32>,
    /// 子代理配置
    #[serde(default)]
    pub subagents: Option<serde_json::Value>,
}

/// Agent 模型配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentModelConfig {
    /// 主模型 (格式: provider/model-id)
    #[serde(default)]
    pub primary: Option<String>,
}

/// 模型配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelsConfig {
    /// Provider 配置映射
    #[serde(default)]
    pub providers: HashMap<String, ProviderConfig>,
}

/// Provider 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// API 地址
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    /// API Key
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
    /// 模型列表
    #[serde(default)]
    pub models: Vec<ModelConfig>,
}

/// 模型配置详情
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    /// 模型 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// API 类型 (anthropic-messages / openai-completions)
    #[serde(default)]
    pub api: Option<String>,
    /// 支持的输入类型
    #[serde(default)]
    pub input: Vec<String>,
    /// 上下文窗口大小
    #[serde(rename = "contextWindow", default)]
    pub context_window: Option<u32>,
    /// 最大输出 Token
    #[serde(rename = "maxTokens", default)]
    pub max_tokens: Option<u32>,
    /// 是否支持推理模式
    #[serde(default)]
    pub reasoning: Option<bool>,
    /// 成本配置
    #[serde(default)]
    pub cost: Option<ModelCostConfig>,
}

/// 模型成本配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelCostConfig {
    #[serde(default)]
    pub input: f64,
    #[serde(default)]
    pub output: f64,
    #[serde(rename = "cacheRead", default)]
    pub cache_read: f64,
    #[serde(rename = "cacheWrite", default)]
    pub cache_write: f64,
}

/// 网关配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GatewayConfig {
    /// 模式：local 或 cloud
    #[serde(default)]
    pub mode: Option<String>,
    /// 认证配置
    #[serde(default)]
    pub auth: Option<GatewayAuthConfig>,
}

/// 网关认证配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GatewayAuthConfig {
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub token: Option<String>,
}

/// 插件配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginsConfig {
    #[serde(default)]
    pub allow: Vec<String>,
    #[serde(default)]
    pub entries: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub installs: HashMap<String, serde_json::Value>,
}

/// 元数据配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MetaConfig {
    #[serde(rename = "lastTouchedAt", default)]
    pub last_touched_at: Option<String>,
    #[serde(rename = "lastTouchedVersion", default)]
    pub last_touched_version: Option<String>,
}

// ============ 前端展示用数据结构 ============

/// 官方 Provider 预设（用于前端展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficialProvider {
    /// Provider ID (用于配置中)
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 图标（emoji）
    pub icon: String,
    /// 官方 API 地址
    pub default_base_url: Option<String>,
    /// API 类型
    pub api_type: String,
    /// 推荐模型列表
    pub suggested_models: Vec<SuggestedModel>,
    /// 是否需要 API Key
    pub requires_api_key: bool,
    /// 文档链接
    pub docs_url: Option<String>,
}

/// 推荐模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedModel {
    /// 模型 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 描述
    pub description: Option<String>,
    /// 上下文窗口
    pub context_window: Option<u32>,
    /// 最大输出
    pub max_tokens: Option<u32>,
    /// 是否推荐
    pub recommended: bool,
}

/// 已配置的 Provider（从配置文件读取）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfiguredProvider {
    /// Provider 名称 (配置中的 key)
    pub name: String,
    /// API 地址
    pub base_url: String,
    /// API Key (脱敏显示)
    pub api_key_masked: Option<String>,
    /// 是否有 API Key
    pub has_api_key: bool,
    /// 配置的模型列表
    pub models: Vec<ConfiguredModel>,
}

/// 已配置的模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfiguredModel {
    /// 完整模型 ID (provider/model-id)
    pub full_id: String,
    /// 模型 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// API 类型
    pub api_type: Option<String>,
    /// 上下文窗口
    pub context_window: Option<u32>,
    /// 最大输出
    pub max_tokens: Option<u32>,
    /// 是否为主模型
    pub is_primary: bool,
}

/// AI 配置概览（返回给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIConfigOverview {
    /// 主模型
    pub primary_model: Option<String>,
    /// 已配置的 Provider 列表
    pub configured_providers: Vec<ConfiguredProvider>,
    /// 可用模型列表
    pub available_models: Vec<String>,
}

// ============ 旧数据结构保持兼容 ============

/// AI Provider 选项（用于前端展示）- 旧版兼容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProviderOption {
    /// Provider ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 图标（emoji）
    pub icon: String,
    /// 官方 API 地址
    pub default_base_url: Option<String>,
    /// 推荐模型列表
    pub models: Vec<AIModelOption>,
    /// 是否需要 API Key
    pub requires_api_key: bool,
}

/// AI 模型选项 - 旧版兼容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIModelOption {
    /// 模型 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 描述
    pub description: Option<String>,
    /// 是否推荐
    pub recommended: bool,
}

/// 渠道配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelConfig {
    /// 渠道 ID
    pub id: String,
    /// 渠道类型
    pub channel_type: String,
    /// 是否启用
    pub enabled: bool,
    /// 配置详情
    pub config: HashMap<String, serde_json::Value>,
}

/// 环境变量配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvConfig {
    pub key: String,
    pub value: String,
}

// ============ 技能库相关数据结构 ============

/// 技能定义（返回给前端展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDefinition {
    /// 技能 ID（唯一标识）
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 描述
    pub description: String,
    /// 图标（emoji）
    pub icon: String,
    /// 来源分类: "builtin" | "official" | "community" | "custom"
    pub source: String,
    /// 版本号
    pub version: Option<String>,
    /// 作者
    pub author: Option<String>,
    /// npm 包名（用于安装/卸载）
    pub package_name: Option<String>,
    /// ClawHub slug（用于 npx clawhub install）
    pub clawhub_slug: Option<String>,
    /// 是否已安装
    pub installed: bool,
    /// 是否已启用
    pub enabled: bool,
    /// 配置字段定义
    pub config_fields: Vec<SkillConfigField>,
    /// 当前配置值
    pub config_values: std::collections::HashMap<String, serde_json::Value>,
    /// 文档链接
    pub docs_url: Option<String>,
    /// 分类标签
    pub category: Option<String>,
}

/// 技能配置字段定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillConfigField {
    /// 字段 key
    pub key: String,
    /// 显示标签
    pub label: String,
    /// 字段类型: "text" | "password" | "select" | "toggle" | "number"
    pub field_type: String,
    /// 占位文本
    pub placeholder: Option<String>,
    /// 下拉选项（field_type = "select" 时使用）
    pub options: Option<Vec<SkillSelectOption>>,
    /// 是否必填
    pub required: bool,
    /// 默认值
    pub default_value: Option<String>,
    /// 帮助文本
    pub help_text: Option<String>,
}

/// 技能下拉选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSelectOption {
    pub value: String,
    pub label: String,
}

/// 技能保存请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSaveRequest {
    /// 技能 ID
    pub skill_id: String,
    /// 是否启用
    pub enabled: bool,
    /// 配置值
    pub config: std::collections::HashMap<String, serde_json::Value>,
}

// ============ Agent 管理相关数据结构 ============

/// Agent 配置（前端展示与编辑用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    /// Agent ID (唯一标识, 如 "main", "work", "assistant")
    pub id: String,
    /// 显示名称 (identity.name)
    pub name: String,
    /// Emoji 标识 (identity.emoji)
    pub emoji: String,
    /// 角色描述/人设 (identity.theme)
    pub theme: Option<String>,
    /// 独立工作空间路径
    pub workspace: String,
    /// Agent 目录 (agentDir, 存放 AGENTS.md, SOUL.md 等)
    #[serde(rename = "agentDir")]
    pub agent_dir: Option<String>,
    /// 覆盖模型 (provider/model-id)
    pub model: Option<String>,
    /// 是否为默认 Agent
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    /// 沙箱模式: "off" | "non-main" | "all"
    #[serde(rename = "sandboxMode")]
    pub sandbox_mode: String,
    /// 工具 profile: "coding" | "full" 等
    #[serde(rename = "toolsProfile")]
    pub tools_profile: Option<String>,
    /// 允许的工具列表
    #[serde(rename = "toolsAllow")]
    pub tools_allow: Vec<String>,
    /// 禁止的工具列表
    #[serde(rename = "toolsDeny")]
    pub tools_deny: Vec<String>,
    /// 绑定的渠道
    pub bindings: Vec<AgentBinding>,
    /// 群聊提及模式
    #[serde(rename = "mentionPatterns")]
    pub mention_patterns: Vec<String>,
    /// 子代理权限 (["*"] = 全部, 或指定 agent id)
    #[serde(rename = "subagentAllow")]
    pub subagent_allow: Vec<String>,
}

/// Agent 渠道绑定
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentBinding {
    /// 渠道类型 (whatsapp, telegram, discord, etc.)
    pub channel: String,
    /// 账号 ID (可选, "*" = 任意)
    #[serde(rename = "accountId")]
    pub account_id: Option<String>,
}

