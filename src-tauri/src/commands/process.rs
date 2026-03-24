use crate::utils::shell;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleStatus {
    pub module_id: String,
    pub installed: bool,
    pub version: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleStatusOverview {
    pub node_installed: bool,
    pub node_version: Option<String>,
    pub modules: Vec<ModuleStatus>,
}

/// 检查 OpenClaw 是否已安装
#[command]
pub async fn check_openclaw_installed() -> Result<bool, String> {
    info!("[进程检查] 检查 OpenClaw 是否已安装...");
    // 使用 get_openclaw_path 来检查，因为在 Windows 上 command_exists 可能不可靠
    let installed = shell::get_openclaw_path().is_some();
    info!(
        "[进程检查] OpenClaw 安装状态: {}",
        if installed { "已安装" } else { "未安装" }
    );
    Ok(installed)
}

/// 获取 OpenClaw 版本
#[command]
pub async fn get_openclaw_version() -> Result<Option<String>, String> {
    info!("[进程检查] 获取 OpenClaw 版本...");
    // 使用 run_openclaw 来获取版本
    match shell::run_openclaw(&["--version"]) {
        Ok(version) => {
            let v = version.trim().to_string();
            info!("[进程检查] OpenClaw 版本: {}", v);
            Ok(Some(v))
        }
        Err(e) => {
            debug!("[进程检查] 获取版本失败: {}", e);
            Ok(None)
        }
    }
}

#[command]
pub async fn get_module_statuses() -> Result<ModuleStatusOverview, String> {
    let openclaw_installed = shell::get_openclaw_path().is_some();
    let openclaw_version = if openclaw_installed {
        shell::run_openclaw(&["--version"])
            .ok()
            .map(|value| value.trim().to_string())
    } else {
        None
    };

    let codex_installed = shell::command_exists("codex");
    let codex_version = if codex_installed {
        shell::run_command_output("codex", &["--version"])
            .ok()
            .map(|value| value.trim().to_string())
    } else {
        None
    };

    let claude_installed = shell::command_exists("claude");
    let claude_version = if claude_installed {
        shell::run_command_output("claude", &["--version"])
            .ok()
            .map(|value| value.trim().to_string())
    } else {
        None
    };
    let claude_route = get_claude_current_route();

    let node_installed = shell::command_exists("node");
    let node_version = if node_installed {
        shell::run_command_output("node", &["--version"]).ok()
    } else {
        None
    };

    Ok(ModuleStatusOverview {
        node_installed,
        node_version,
        modules: vec![
            ModuleStatus {
                module_id: "openclaw".to_string(),
                installed: openclaw_installed,
                version: openclaw_version,
                message: if openclaw_installed {
                    "OpenClaw CLI 已可用".to_string()
                } else {
                    "未检测到 OpenClaw CLI".to_string()
                },
            },
            ModuleStatus {
                module_id: "codex".to_string(),
                installed: codex_installed,
                version: codex_version,
                message: if codex_installed {
                    "Codex CLI 已可用".to_string()
                } else {
                    "未检测到 Codex CLI".to_string()
                },
            },
            ModuleStatus {
                module_id: "claudecode".to_string(),
                installed: claude_installed,
                version: claude_version,
                message: if claude_installed {
                    if let Some(route) = claude_route {
                        format!("Claude Code CLI 已可用（当前路线: {}）", route)
                    } else {
                        "Claude Code CLI 已可用".to_string()
                    }
                } else {
                    "未检测到 Claude Code CLI（claude）".to_string()
                },
            },
        ],
    })
}

fn get_claude_current_route() -> Option<String> {
    let home = dirs::home_dir()?;
    let route_path = if crate::utils::platform::is_windows() {
        format!("{}\\.config\\tuzi\\claude_route_status.txt", home.display())
    } else {
        format!("{}/.config/tuzi/claude_route_status.txt", home.display())
    };

    if !Path::new(&route_path).exists() {
        return None;
    }

    let content = std::fs::read_to_string(&route_path).ok()?;
    content
        .lines()
        .find_map(|line| line.trim().strip_prefix("current_route=").map(|v| v.trim().to_string()))
}

/// 检查端口是否被占用（通过尝试连接 openclaw gateway）
#[command]
pub async fn check_port_in_use(port: u16) -> Result<bool, String> {
    info!("[进程检查] 检查端口 {} 是否被占用...", port);

    // 使用 openclaw health 检查 gateway 是否在运行
    // 如果 port 是默认的 18789，直接使用 openclaw health
    if port == 18789 {
        debug!("[进程检查] 使用 openclaw health 检查端口 18789...");
        let result = shell::run_openclaw(&["health", "--timeout", "2000"]);
        // 如果 health 命令成功，说明端口被 gateway 占用
        let in_use = result.is_ok();
        info!(
            "[进程检查] 端口 18789 状态: {}",
            if in_use { "被占用" } else { "空闲" }
        );
        return Ok(in_use);
    }

    // 对于非默认端口，尝试使用 TCP 连接检查
    debug!("[进程检查] 使用 TCP 连接检查端口 {}...", port);
    use std::net::TcpStream;
    use std::time::Duration;

    let addr = format!("127.0.0.1:{}", port);
    match TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_millis(500)) {
        Ok(_) => {
            info!("[进程检查] 端口 {} 被占用", port);
            Ok(true)
        }
        Err(_) => {
            info!("[进程检查] 端口 {} 空闲", port);
            Ok(false)
        }
    }
}

/// 获取 Node.js 版本
#[command]
pub async fn get_node_version() -> Result<Option<String>, String> {
    info!("[进程检查] 获取 Node.js 版本...");
    if !shell::command_exists("node") {
        info!("[进程检查] Node.js 未安装");
        return Ok(None);
    }

    match shell::run_command_output("node", &["--version"]) {
        Ok(version) => {
            info!("[进程检查] Node.js 版本: {}", version);
            Ok(Some(version))
        }
        Err(e) => {
            debug!("[进程检查] 获取 Node.js 版本失败: {}", e);
            Ok(None)
        }
    }
}
