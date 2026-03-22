use serde::{Deserialize, Serialize};

/// 服务运行状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatus {
    /// 是否正在运行
    pub running: bool,
    /// 进程 ID
    pub pid: Option<u32>,
    /// 监听端口
    pub port: u16,
    /// 运行时长（秒）
    pub uptime_seconds: Option<u64>,
    /// 内存使用（MB）
    pub memory_mb: Option<f64>,
    /// CPU 使用率
    pub cpu_percent: Option<f64>,
}

impl Default for ServiceStatus {
    fn default() -> Self {
        Self {
            running: false,
            pid: None,
            port: 18789,
            uptime_seconds: None,
            memory_mb: None,
            cpu_percent: None,
        }
    }
}

/// 系统信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    /// 操作系统类型
    pub os: String,
    /// 操作系统版本
    pub os_version: String,
    /// 系统架构
    pub arch: String,
    /// OpenClaw 是否已安装
    pub openclaw_installed: bool,
    /// OpenClaw 版本
    pub openclaw_version: Option<String>,
    /// Node.js 版本
    pub node_version: Option<String>,
    /// 配置目录
    pub config_dir: String,
}

/// 诊断结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticResult {
    /// 检查项名称
    pub name: String,
    /// 是否通过
    pub passed: bool,
    /// 详细信息
    pub message: String,
    /// 修复建议
    pub suggestion: Option<String>,
}

/// AI 连接测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AITestResult {
    /// 是否成功
    pub success: bool,
    /// 提供商名称
    pub provider: String,
    /// 模型名称
    pub model: String,
    /// 响应内容
    pub response: Option<String>,
    /// 错误信息
    pub error: Option<String>,
    /// 响应时间（毫秒）
    pub latency_ms: Option<u64>,
}

/// 渠道测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelTestResult {
    /// 是否成功
    pub success: bool,
    /// 渠道名称
    pub channel: String,
    /// 消息
    pub message: String,
    /// 错误信息
    pub error: Option<String>,
}

/// 安全风险项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityIssue {
    /// 唯一标识
    pub id: String,
    /// 标题
    pub title: String,
    /// 描述
    pub description: String,
    /// 严重级别: high, medium, low
    pub severity: String,
    /// 是否可自动修复
    pub fixable: bool,
    /// 是否已修复
    pub fixed: bool,
    /// 分类: network, exposure, skills, auth, permissions, service
    pub category: String,
    /// 详细说明
    pub detail: Option<String>,
}

/// 安全修复结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityFixResult {
    /// 是否成功
    pub success: bool,
    /// 消息
    pub message: String,
    /// 已修复的项 ID
    pub fixed_ids: Vec<String>,
    /// 修复失败的项 ID
    pub failed_ids: Vec<String>,
    /// 手动修复说明
    pub manual_instructions: Option<String>,
}
