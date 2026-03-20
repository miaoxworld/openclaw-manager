use crate::models::ServiceStatus;
use crate::utils::shell;
use tauri::command;
use std::process::Command;
use log::{info, debug, warn};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows CREATE_NO_WINDOW 标志，用于隐藏控制台窗口
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const SERVICE_PORT: u16 = 18789;

fn ensure_gateway_mode_local() -> Result<(), String> {
    match shell::run_openclaw(&["config", "set", "gateway.mode", "local"]) {
        Ok(_) => Ok(()),
        Err(err) => {
            warn!("[服务] 设置 gateway.mode=local 失败: {}", err);
            Err(format!("初始化 gateway.mode=local 失败: {}", err))
        }
    }
}

/// 检测端口是否有服务在监听，返回 PID
/// 简单直接：端口被占用 = 服务运行中
fn check_port_listening(port: u16) -> Option<u32> {
    #[cfg(unix)]
    {
        let output = Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
            .ok()?;
        
        if output.status.success() {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .and_then(|line| line.trim().parse::<u32>().ok())
        } else {
            None
        }
    }
    
    #[cfg(windows)]
    {
        let mut cmd = Command::new("netstat");
        cmd.args(["-ano"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        let output = cmd.output().ok()?;
        
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains(&format!(":{}", port)) && line.contains("LISTENING") {
                    if let Some(pid_str) = line.split_whitespace().last() {
                        if let Ok(pid) = pid_str.parse::<u32>() {
                            return Some(pid);
                        }
                    }
                }
            }
        }
        None
    }
}

/// 获取服务状态（简单版：直接检查端口占用）
#[command]
pub async fn get_service_status() -> Result<ServiceStatus, String> {
    // 简单直接：检查端口是否被占用
    let pid = check_port_listening(SERVICE_PORT);
    let running = pid.is_some();
    
    Ok(ServiceStatus {
        running,
        pid,
        port: SERVICE_PORT,
        uptime_seconds: None,
        memory_mb: None,
        cpu_percent: None,
    })
}

/// 启动服务
#[command]
pub async fn start_service() -> Result<String, String> {
    info!("[服务] 启动服务...");
    
    // 检查是否已经运行
    let status = get_service_status().await?;
    if status.running {
        info!("[服务] 服务已在运行中");
        return Err("服务已在运行中".to_string());
    }
    
    // 检查 openclaw 命令是否存在
    let openclaw_path = shell::get_openclaw_path();
    if openclaw_path.is_none() {
        info!("[服务] 找不到 openclaw 命令");
        return Err("找不到 openclaw 命令，请先通过 npm install -g openclaw 安装".to_string());
    }
    info!("[服务] openclaw 路径: {:?}", openclaw_path);

    // 自愈式补齐 gateway.mode，避免被 openclaw 拒绝启动
    ensure_gateway_mode_local()?;
    
    // 直接后台启动 gateway（不等待 doctor，避免阻塞）
    info!("[服务] 后台启动 gateway...");
    shell::spawn_openclaw_gateway()
        .map_err(|e| format!("启动服务失败: {}", e))?;
    
    // 轮询等待端口开始监听（最多 15 秒）
    info!("[服务] 等待端口 {} 开始监听...", SERVICE_PORT);
    for i in 1..=15 {
        std::thread::sleep(std::time::Duration::from_secs(1));
        if let Some(pid) = check_port_listening(SERVICE_PORT) {
            info!("[服务] ✓ 启动成功 ({}秒), PID: {}", i, pid);
            return Ok(format!("服务已启动，PID: {}", pid));
        }
        if i % 3 == 0 {
            debug!("[服务] 等待中... ({}秒)", i);
        }
    }
    
    info!("[服务] 等待超时，端口仍未监听");
    Err("服务启动超时（15秒），请检查 openclaw 日志".to_string())
}

/// 获取监听指定端口的所有 PID
fn get_pids_on_port(port: u16) -> Vec<u32> {
    #[cfg(unix)]
    {
        let output = Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output();
        
        match output {
            Ok(out) if out.status.success() => {
                String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .filter_map(|line| line.trim().parse::<u32>().ok())
                    .collect()
            }
            _ => vec![],
        }
    }
    
    #[cfg(windows)]
    {
        let mut cmd = Command::new("netstat");
        cmd.args(["-ano"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        match cmd.output() {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                stdout.lines()
                    .filter(|line| line.contains(&format!(":{}", port)) && line.contains("LISTENING"))
                    .filter_map(|line| line.split_whitespace().last())
                    .filter_map(|pid_str| pid_str.parse::<u32>().ok())
                    .collect()
            }
            _ => vec![],
        }
    }
}

/// 通过 PID 杀死进程
fn kill_process(pid: u32, force: bool) -> bool {
    info!("[服务] 杀死进程 PID: {}, force: {}", pid, force);
    
    #[cfg(unix)]
    {
        let signal = if force { "-9" } else { "-TERM" };
        Command::new("kill")
            .args([signal, &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    
    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        if force {
            cmd.args(["/F", "/PID", &pid.to_string()]);
        } else {
            cmd.args(["/PID", &pid.to_string()]);
        }
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

/// 停止服务（通过杀死监听端口的进程）
#[command]
pub async fn stop_service() -> Result<String, String> {
    info!("[服务] 停止服务...");
    
    let pids = get_pids_on_port(SERVICE_PORT);
    if pids.is_empty() {
        info!("[服务] 端口 {} 无进程监听，服务未运行", SERVICE_PORT);
        return Ok("服务未在运行".to_string());
    }
    
    info!("[服务] 发现 {} 个进程监听端口 {}: {:?}", pids.len(), SERVICE_PORT, pids);
    
    // 第一步：优雅终止 (SIGTERM)
    for &pid in &pids {
        kill_process(pid, false);
    }
    std::thread::sleep(std::time::Duration::from_secs(2));
    
    // 检查是否已停止
    let remaining = get_pids_on_port(SERVICE_PORT);
    if remaining.is_empty() {
        info!("[服务] ✓ 已停止");
        return Ok("服务已停止".to_string());
    }
    
    // 第二步：强制终止 (SIGKILL)
    info!("[服务] 仍有 {} 个进程存活，强制终止...", remaining.len());
    for &pid in &remaining {
        kill_process(pid, true);
    }
    std::thread::sleep(std::time::Duration::from_secs(1));
    
    let still_running = get_pids_on_port(SERVICE_PORT);
    if still_running.is_empty() {
        info!("[服务] ✓ 已强制停止");
        Ok("服务已停止".to_string())
    } else {
        Err(format!("无法停止服务，仍有进程: {:?}", still_running))
    }
}

/// 重启服务
#[command]
pub async fn restart_service() -> Result<String, String> {
    info!("[服务] 重启服务...");
    
    // 先停止
    let _ = stop_service().await;
    std::thread::sleep(std::time::Duration::from_secs(1));
    
    // 再启动
    start_service().await
}

/// 获取日志（直接读取日志文件，比 RPC 更可靠）
#[command]
pub async fn get_logs(lines: Option<u32>) -> Result<Vec<String>, String> {
    let n = lines.unwrap_or(100);
    
    let config_dir = crate::utils::platform::get_config_dir();
    
    // 尝试多个已知的日志文件位置
    let log_files = vec![
        format!("{}/logs/gateway.log", config_dir),
        format!("{}/logs/gateway.err.log", config_dir),
        format!("{}/stderr.log", config_dir),
        format!("{}/stdout.log", config_dir),
    ];
    
    let mut all_lines: Vec<String> = Vec::new();
    
    for log_file in &log_files {
        if !std::path::Path::new(log_file).exists() {
            continue;
        }
        
        // 使用 tail 高效读取最后 N 行
        match Command::new("tail")
            .args(["-n", &n.to_string(), log_file])
            .output()
        {
            Ok(output) if output.status.success() => {
                let content = String::from_utf8_lossy(&output.stdout);
                for line in content.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        all_lines.push(trimmed.to_string());
                    }
                }
            }
            _ => continue,
        }
    }
    
    // 尝试按时间戳排序（日志格式通常以 ISO 时间戳开头）
    all_lines.sort();
    
    // 去重并保留最后 N 行
    all_lines.dedup();
    let total = all_lines.len();
    if total > n as usize {
        all_lines = all_lines.split_off(total - n as usize);
    }
    
    Ok(all_lines)
}
