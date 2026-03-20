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
    /// 回退模型列表
    #[serde(default)]
    pub fallbacks: Vec<String>,
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
    /// 来源标识（official / tuzi）
    #[serde(default)]
    pub source: Option<String>,
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

/// Tuzi 分组
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TuziGroup {
    ClaudeCode,
    Codex,
    Gaccode,
}

impl TuziGroup {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ClaudeCode => "claude-code",
            Self::Codex => "codex",
            Self::Gaccode => "gaccode",
        }
    }
}

/// Tuzi 分组配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziGroupConfig {
    pub group: TuziGroup,
    pub configured: bool,
    pub provider_id: String,
    #[serde(default)]
    pub provider_ids: Vec<String>,
    pub base_url: String,
    pub api_type: String,
    pub api_key_masked: Option<String>,
    pub primary_model: Option<String>,
    pub models: Vec<String>,
}

/// Tuzi 配置概览
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziConfigOverview {
    pub configured: bool,
    pub groups: Vec<TuziGroupConfig>,
}

/// Tuzi 模型来源
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TuziModelsSource {
    Api,
    Cache,
}

/// Tuzi 实时模型拉取结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziModelsResponse {
    pub models: Vec<String>,
    pub source: TuziModelsSource,
    pub cache_timestamp: Option<String>,
    pub warning: Option<String>,
}

/// Tuzi 模型模板
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziModelTemplate {
    pub group: TuziGroup,
    pub provider_id: String,
    pub name: String,
    pub default_base_url: String,
    pub api_type: String,
    pub suggested_models: Vec<SuggestedModel>,
}
