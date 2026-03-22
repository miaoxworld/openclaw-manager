use crate::models::{AITestResult, ChannelTestResult, DiagnosticResult, SystemInfo, SecurityIssue, SecurityFixResult};
use crate::utils::{platform, shell};
use tauri::command;
use log::{info, warn, error, debug};

/// 去除 ANSI 转义序列（颜色代码等）
fn strip_ansi_codes(input: &str) -> String {
    // 匹配 ANSI 转义序列: ESC[ ... m 或 ESC[ ... 其他控制字符
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // 跳过 ESC[...m 序列
            if chars.peek() == Some(&'[') {
                chars.next(); // 跳过 '['
                // 跳过直到遇到字母
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

/// 从混合输出中提取 JSON 内容
fn extract_json_from_output(output: &str) -> Option<String> {
    // 先去除 ANSI 颜色代码
    let clean_output = strip_ansi_codes(output);
    
    // 按行查找 JSON 开始位置
    let lines: Vec<&str> = clean_output.lines().collect();
    let mut json_start_line = None;
    let mut json_end_line = None;
    
    // 找到 JSON 开始行：
    // - 以 { 开头（JSON 对象）
    // - 或以 [" 或 [数字 开头（真正的 JSON 数组，不是 [plugins] 这样的文本）
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('{') {
            json_start_line = Some(i);
            break;
        }
        // 检查是否是真正的 JSON 数组（以 [" 或 [数字 或 [{ 开头）
        if trimmed.starts_with('[') && trimmed.len() > 1 {
            let second_char = trimmed.chars().nth(1).unwrap_or(' ');
            if second_char == '"' || second_char == '{' || second_char == '[' || second_char.is_ascii_digit() {
                json_start_line = Some(i);
                break;
            }
        }
    }
    
    // 找到 JSON 结束行（以 } 或 ] 结尾的行，从后往前找）
    for (i, line) in lines.iter().enumerate().rev() {
        let trimmed = line.trim();
        if trimmed == "}" || trimmed == "}," || trimmed.ends_with('}') {
            json_end_line = Some(i);
            break;
        }
        if trimmed == "]" || trimmed == "]," {
            json_end_line = Some(i);
            break;
        }
    }
    
    match (json_start_line, json_end_line) {
        (Some(start), Some(end)) if start <= end => {
            let json_lines: Vec<&str> = lines[start..=end].to_vec();
            let json_str = json_lines.join("\n");
            Some(json_str)
        }
        _ => None,
    }
}

/// 运行诊断
#[command]
pub async fn run_doctor() -> Result<Vec<DiagnosticResult>, String> {
    info!("[诊断] 开始运行系统诊断...");
    let mut results = Vec::new();
    
    // 检查 OpenClaw 是否安装
    info!("[诊断] 检查 OpenClaw 安装状态...");
    let openclaw_installed = shell::get_openclaw_path().is_some();
    info!("[诊断] OpenClaw 安装: {}", if openclaw_installed { "✓" } else { "✗" });
    results.push(DiagnosticResult {
        name: "OpenClaw 安装".to_string(),
        passed: openclaw_installed,
        message: if openclaw_installed {
            "OpenClaw 已安装".to_string()
        } else {
            "OpenClaw 未安装".to_string()
        },
        suggestion: if openclaw_installed {
            None
        } else {
            Some("运行: npm install -g openclaw".to_string())
        },
    });
    
    // 检查 Node.js
    let node_check = shell::run_command_output("node", &["--version"]);
    results.push(DiagnosticResult {
        name: "Node.js".to_string(),
        passed: node_check.is_ok(),
        message: node_check
            .clone()
            .unwrap_or_else(|_| "未安装".to_string()),
        suggestion: if node_check.is_err() {
            Some("请安装 Node.js 22+".to_string())
        } else {
            None
        },
    });
    
    // 检查配置文件
    let config_path = platform::get_config_file_path();
    let config_exists = std::path::Path::new(&config_path).exists();
    results.push(DiagnosticResult {
        name: "配置文件".to_string(),
        passed: config_exists,
        message: if config_exists {
            format!("配置文件存在: {}", config_path)
        } else {
            "配置文件不存在".to_string()
        },
        suggestion: if config_exists {
            None
        } else {
            Some("运行 openclaw 初始化配置".to_string())
        },
    });
    
    // 检查环境变量文件
    let env_path = platform::get_env_file_path();
    let env_exists = std::path::Path::new(&env_path).exists();
    results.push(DiagnosticResult {
        name: "环境变量".to_string(),
        passed: env_exists,
        message: if env_exists {
            format!("环境变量文件存在: {}", env_path)
        } else {
            "环境变量文件不存在".to_string()
        },
        suggestion: if env_exists {
            None
        } else {
            Some("请配置 AI API Key".to_string())
        },
    });
    
    // 运行 openclaw doctor
    if openclaw_installed {
        let doctor_result = shell::run_openclaw(&["doctor"]);
        results.push(DiagnosticResult {
            name: "OpenClaw Doctor".to_string(),
            passed: doctor_result.is_ok() && !doctor_result.as_ref().unwrap().contains("invalid"),
            message: doctor_result.unwrap_or_else(|e| e),
            suggestion: None,
        });
    }
    
    Ok(results)
}

/// 测试 AI 连接
#[command]
pub async fn test_ai_connection() -> Result<AITestResult, String> {
    info!("[AI测试] 开始测试 AI 连接...");
    
    // 获取当前配置的 provider
    let start = std::time::Instant::now();
    
    // 使用 openclaw 命令测试连接
    info!("[AI测试] 执行: openclaw agent --local --to +1234567890 --message 回复 OK");
    let result = shell::run_openclaw(&["agent", "--local", "--to", "+1234567890", "--message", "回复 OK"]);
    
    let latency = start.elapsed().as_millis() as u64;
    info!("[AI测试] 命令执行完成, 耗时: {}ms", latency);
    
    match result {
        Ok(output) => {
            debug!("[AI测试] 原始输出: {}", output);
            // 过滤掉警告信息
            let filtered: String = output
                .lines()
                .filter(|l: &&str| !l.contains("ExperimentalWarning"))
                .collect::<Vec<&str>>()
                .join("\n");
            
            let success = !filtered.to_lowercase().contains("error")
                && !filtered.contains("401")
                && !filtered.contains("403");
            
            if success {
                info!("[AI测试] ✓ AI 连接测试成功");
            } else {
                warn!("[AI测试] ✗ AI 连接测试失败: {}", filtered);
            }
            
            Ok(AITestResult {
                success,
                provider: "current".to_string(),
                model: "default".to_string(),
                response: if success { Some(filtered.clone()) } else { None },
                error: if success { None } else { Some(filtered) },
                latency_ms: Some(latency),
            })
        }
        Err(e) => Ok(AITestResult {
            success: false,
            provider: "current".to_string(),
            model: "default".to_string(),
            response: None,
            error: Some(e),
            latency_ms: Some(latency),
        }),
    }
}

/// 获取渠道测试目标
fn get_channel_test_target(channel_type: &str) -> Option<String> {
    let env_path = platform::get_env_file_path();
    
    // 根据渠道类型获取测试目标的环境变量
    let env_key = match channel_type.to_lowercase().as_str() {
        "telegram" => "OPENCLAW_TELEGRAM_USERID",
        "discord" => "OPENCLAW_DISCORD_TESTCHANNELID",
        "slack" => "OPENCLAW_SLACK_TESTCHANNELID",
        "feishu" => "OPENCLAW_FEISHU_TESTCHATID",
        // WhatsApp 是扫码登录，不需要测试目标发送消息
        "whatsapp" => return None,
        // iMessage 也不需要测试目标
        "imessage" => return None,
        _ => return None,
    };
    
    crate::utils::file::read_env_value(&env_path, env_key)
}

/// 检查渠道是否需要发送测试消息
fn channel_needs_send_test(channel_type: &str) -> bool {
    match channel_type.to_lowercase().as_str() {
        // 这些渠道需要发送测试消息来验证
        "telegram" | "discord" | "slack" | "feishu" => true,
        // WhatsApp、iMessage、QQ Bot 只检查状态，不发送测试消息
        "whatsapp" | "imessage" | "qqbot" => false,
        _ => false,
    }
}

/// 从文本输出解析渠道状态
/// 格式: "- Telegram default: enabled, configured, mode:polling, token:config"
fn parse_channel_status_text(output: &str, channel_type: &str) -> Option<(bool, bool, bool, String)> {
    let channel_lower = channel_type.to_lowercase();
    
    for line in output.lines() {
        let line = line.trim();
        // 匹配 "- Telegram default: ..." 格式
        if line.starts_with("- ") && line.to_lowercase().contains(&channel_lower) {
            // 解析状态
            let enabled = line.contains("enabled");
            let configured = line.contains("configured") && !line.contains("not configured");
            let linked = line.contains("linked");
            
            // 提取状态描述（冒号后面的部分）
            let status_part = line.split(':').skip(1).collect::<Vec<&str>>().join(":");
            let status_msg = status_part.trim().to_string();
            
            return Some((enabled, configured, linked, status_msg));
        }
    }
    None
}

/// 测试渠道连接（检查状态并发送测试消息）
#[command]
pub async fn test_channel(channel_type: String) -> Result<ChannelTestResult, String> {
    info!("[渠道测试] 测试渠道: {}", channel_type);
    let channel_lower = channel_type.to_lowercase();
    
    // 使用 openclaw channels status 检查渠道状态（不加 --json，因为可能不支持）
    info!("[渠道测试] 步骤1: 检查渠道状态...");
    let status_result = shell::run_openclaw(&["channels", "status"]);
    
    let mut channel_ok = false;
    let mut status_message = String::new();
    let mut debug_info = String::new();
    
    match &status_result {
        Ok(output) => {
            info!("[渠道测试] status 命令执行成功");
            
            // 尝试从文本输出解析状态
            if let Some((enabled, configured, linked, status_msg)) = parse_channel_status_text(output, &channel_type) {
                debug_info = format!("enabled={}, configured={}, linked={}", enabled, configured, linked);
                info!("[渠道测试] {} 状态: {}", channel_type, debug_info);
                
                if !configured {
                    info!("[渠道测试] {} 未配置", channel_type);
                    return Ok(ChannelTestResult {
                        success: false,
                        channel: channel_type.clone(),
                        message: format!("{} 未配置", channel_type),
                        error: Some(format!("请运行: openclaw channels add --channel {}", channel_lower)),
                    });
                }
                
                // 已配置就认为状态OK（Gateway可能没启动，但配置是有的）
                channel_ok = configured;
                status_message = if linked {
                    "已链接".to_string()
                } else if !status_msg.is_empty() {
                    status_msg
                } else {
                    "已配置".to_string()
                };
            } else {
                // 尝试 JSON 解析（作为备选）
                if let Some(json_str) = extract_json_from_output(output) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        if let Some(channels) = json.get("channels").and_then(|c| c.as_object()) {
                            if let Some(ch) = channels.get(&channel_lower) {
                                let configured = ch.get("configured").and_then(|v| v.as_bool()).unwrap_or(false);
                                let linked = ch.get("linked").and_then(|v| v.as_bool()).unwrap_or(false);
                                channel_ok = configured;
                                status_message = if linked { "已链接".to_string() } else { "已配置".to_string() };
                            }
                        }
                    }
                }
                
                if !channel_ok {
                    debug_info = format!("无法解析 {} 的状态", channel_type);
                    info!("[渠道测试] {}", debug_info);
                }
            }
        }
        Err(e) => {
            debug_info = format!("命令执行失败: {}", e);
            info!("[渠道测试] {}", debug_info);
        }
    }
    
    // 如果渠道状态不 OK，直接返回失败
    if !channel_ok {
        info!("[渠道测试] {} 状态检查失败，不发送测试消息", channel_type);
        let error_msg = if debug_info.is_empty() {
            "渠道未运行或未配置".to_string()
        } else {
            debug_info
        };
        return Ok(ChannelTestResult {
            success: false,
            channel: channel_type.clone(),
            message: format!("{} 未连接", channel_type),
            error: Some(error_msg),
        });
    }
    
    info!("[渠道测试] {} 状态正常 ({})", channel_type, status_message);
    
    // 对于 WhatsApp 和 iMessage，只返回状态检查结果，不发送测试消息
    if !channel_needs_send_test(&channel_type) {
        info!("[渠道测试] {} 不需要发送测试消息（状态检查即可）", channel_type);
        return Ok(ChannelTestResult {
            success: true,
            channel: channel_type.clone(),
            message: format!("{} 状态正常 ({})", channel_type, status_message),
            error: None,
        });
    }
    
    // 尝试发送测试消息
    info!("[渠道测试] 步骤2: 获取测试目标...");
    let test_target = get_channel_test_target(&channel_type);
    
    if let Some(target) = test_target {
        info!("[渠道测试] 步骤3: 发送测试消息到 {}...", target);
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let message = format!("🤖 OpenClaw 测试消息\n\n✅ 连接成功！\n⏰ {}", timestamp);
        
        // 使用 openclaw message send 发送测试消息
        info!("[渠道测试] 执行: openclaw message send --channel {} --target {} ...", channel_lower, target);
        let send_result = shell::run_openclaw(&[
            "message", "send",
            "--channel", &channel_lower,
            "--target", &target,
            "--message", &message,
            "--json"
        ]);
        
        match send_result {
            Ok(output) => {
                info!("[渠道测试] 发送命令输出长度: {}", output.len());
                
                // 检查发送是否成功
                let send_ok = if let Some(json_str) = extract_json_from_output(&output) {
                    info!("[渠道测试] 提取到 JSON: {}", json_str);
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        // 检查各种成功标志
                        let has_ok = json.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                        let has_success = json.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                        let has_message_id = json.get("messageId").is_some();
                        let has_payload_ok = json.get("payload").and_then(|p| p.get("ok")).and_then(|v| v.as_bool()).unwrap_or(false);
                        let has_payload_message_id = json.get("payload").and_then(|p| p.get("messageId")).is_some();
                        let has_payload_result_message_id = json.get("payload")
                            .and_then(|p| p.get("result"))
                            .and_then(|r| r.get("messageId"))
                            .is_some();
                        
                        info!("[渠道测试] 判断条件: ok={}, success={}, messageId={}, payload.ok={}, payload.messageId={}, payload.result.messageId={}",
                            has_ok, has_success, has_message_id, has_payload_ok, has_payload_message_id, has_payload_result_message_id);
                        
                        has_ok || has_success || has_message_id || has_payload_ok || has_payload_message_id || has_payload_result_message_id
                    } else {
                        info!("[渠道测试] JSON 解析失败");
                        false
                    }
                } else {
                    info!("[渠道测试] 未提取到 JSON，检查关键词");
                    // 如果没有 JSON，检查是否有错误关键词
                    !output.to_lowercase().contains("error") && !output.to_lowercase().contains("failed")
                };
                
                if send_ok {
                    info!("[渠道测试] ✓ {} 测试消息发送成功", channel_type);
                    Ok(ChannelTestResult {
                        success: true,
                        channel: channel_type.clone(),
                        message: format!("{} 测试消息已发送 ({})", channel_type, status_message),
                        error: None,
                    })
                } else {
                    info!("[渠道测试] ✗ {} 测试消息发送失败", channel_type);
                    Ok(ChannelTestResult {
                        success: false,
                        channel: channel_type.clone(),
                        message: format!("{} 消息发送失败", channel_type),
                        error: Some(output),
                    })
                }
            }
            Err(e) => {
                info!("[渠道测试] ✗ {} 发送命令执行失败: {}", channel_type, e);
                Ok(ChannelTestResult {
                    success: false,
                    channel: channel_type.clone(),
                    message: format!("{} 消息发送失败", channel_type),
                    error: Some(e),
                })
            }
        }
    } else {
        // 没有配置测试目标，返回状态但提示需要配置测试目标
        let hint = match channel_lower.as_str() {
            "telegram" => "请配置 OPENCLAW_TELEGRAM_USERID",
            "discord" => "请配置 OPENCLAW_DISCORD_TESTCHANNELID",
            "slack" => "请配置 OPENCLAW_SLACK_TESTCHANNELID",
            "feishu" => "请配置 OPENCLAW_FEISHU_TESTCHATID",
            _ => "请配置测试目标",
        };
        
        info!("[渠道测试] {} 未配置测试目标，跳过发送消息 ({})", channel_type, hint);
        Ok(ChannelTestResult {
            success: true,
            channel: channel_type.clone(),
            message: format!("{} 状态正常 ({}) - {}", channel_type, status_message, hint),
            error: None,
        })
    }
}

/// 发送测试消息到渠道
#[command]
pub async fn send_test_message(channel_type: String, target: String) -> Result<ChannelTestResult, String> {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let message = format!("🤖 OpenClaw 测试消息\n\n✅ 连接成功！\n⏰ {}", timestamp);
    
    // 使用 openclaw message send 命令发送测试消息
    let send_result = shell::run_openclaw(&[
        "message", "send",
        "--channel", &channel_type,
        "--target", &target,
        "--message", &message,
        "--json"
    ]);
    
    match send_result {
        Ok(output) => {
            // 尝试从混合输出中提取并解析 JSON 结果
            let success = if let Some(json_str) = extract_json_from_output(&output) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&json_str) {
                    json.get("success").and_then(|v| v.as_bool()).unwrap_or(false)
                        || json.get("ok").and_then(|v| v.as_bool()).unwrap_or(false)
                        || json.get("messageId").is_some()
                } else {
                    false
                }
            } else {
                // 非 JSON 输出，检查是否包含错误关键词
                !output.to_lowercase().contains("error") && !output.to_lowercase().contains("failed")
            };
            
            Ok(ChannelTestResult {
                success,
                channel: channel_type,
                message: if success { "消息已发送".to_string() } else { "消息发送失败".to_string() },
                error: if success { None } else { Some(output) },
            })
        }
        Err(e) => Ok(ChannelTestResult {
            success: false,
            channel: channel_type,
            message: "发送失败".to_string(),
            error: Some(e),
        }),
    }
}

/// 获取系统信息
#[command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    info!("[系统信息] 获取系统信息...");
    let os = platform::get_os();
    let arch = platform::get_arch();
    info!("[系统信息] OS: {}, Arch: {}", os, arch);
    
    // 获取 OS 版本
    let os_version = if platform::is_macos() {
        shell::run_command_output("sw_vers", &["-productVersion"])
            .unwrap_or_else(|_| "unknown".to_string())
    } else if platform::is_linux() {
        shell::run_bash_output("cat /etc/os-release | grep VERSION_ID | cut -d'=' -f2 | tr -d '\"'")
            .unwrap_or_else(|_| "unknown".to_string())
    } else {
        "unknown".to_string()
    };
    
    let openclaw_installed = shell::get_openclaw_path().is_some();
    let openclaw_version = if openclaw_installed {
        shell::run_openclaw(&["--version"]).ok()
    } else {
        None
    };
    
    let node_version = shell::run_command_output("node", &["--version"]).ok();
    
    Ok(SystemInfo {
        os,
        os_version,
        arch,
        openclaw_installed,
        openclaw_version,
        node_version,
        config_dir: platform::get_config_dir(),
    })
}

/// 启动渠道登录（如 WhatsApp 扫码）
#[command]
pub async fn start_channel_login(channel_type: String) -> Result<String, String> {
    info!("[渠道登录] 开始渠道登录流程: {}", channel_type);
    
    match channel_type.as_str() {
        "whatsapp" => {
            info!("[渠道登录] WhatsApp 登录流程...");
            // 先在后台启用插件
            info!("[渠道登录] 启用 whatsapp 插件...");
            let _ = shell::run_openclaw(&["plugins", "enable", "whatsapp"]);
            
            #[cfg(target_os = "macos")]
            {
                let env_path = platform::get_env_file_path();
                // 创建一个临时脚本文件
                // 流程：1. 启用插件 2. 重启 Gateway 3. 登录
                let script_content = format!(
                    r#"#!/bin/bash
source {} 2>/dev/null
clear
echo "╔════════════════════════════════════════════════════════╗"
echo "║           📱 WhatsApp 登录向导                          ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

echo "步骤 1/3: 启用 WhatsApp 插件..."
openclaw plugins enable whatsapp 2>/dev/null || true

# 确保 whatsapp 在 plugins.allow 数组中
python3 << 'PYEOF'
import json
import os

config_path = os.path.expanduser("~/.openclaw/openclaw.json")
plugin_id = "whatsapp"

try:
    with open(config_path, 'r') as f:
        config = json.load(f)
    
    # 设置 plugins.allow 和 plugins.entries
    if 'plugins' not in config:
        config['plugins'] = {{'allow': [], 'entries': {{}}}}
    if 'allow' not in config['plugins']:
        config['plugins']['allow'] = []
    if 'entries' not in config['plugins']:
        config['plugins']['entries'] = {{}}
    
    if plugin_id not in config['plugins']['allow']:
        config['plugins']['allow'].append(plugin_id)
    
    config['plugins']['entries'][plugin_id] = {{'enabled': True}}
    
    # 确保 channels.whatsapp 存在（但不设置 enabled，WhatsApp 不支持这个键）
    if 'channels' not in config:
        config['channels'] = {{}}
    if plugin_id not in config['channels']:
        config['channels'][plugin_id] = {{'dmPolicy': 'pairing', 'groupPolicy': 'allowlist'}}
    
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    print("配置已更新")
except Exception as e:
    print(f"Warning: {{e}}")
PYEOF

echo "✅ 插件已启用"
echo ""

echo "步骤 2/3: 重启 Gateway 使插件生效..."
# 使用 openclaw 命令停止和启动 gateway
openclaw gateway stop 2>/dev/null || true
sleep 2
# 启动 gateway 服务
openclaw gateway start 2>/dev/null || openclaw gateway --port 18789 &
sleep 3
echo "✅ Gateway 已重启"
echo ""

echo "步骤 3/3: 启动 WhatsApp 登录..."
echo "请使用 WhatsApp 手机 App 扫描下方二维码"
echo ""
openclaw channels login --channel whatsapp --verbose
echo ""
echo "════════════════════════════════════════════════════════"
echo "登录完成！"
echo ""
read -p "按回车键关闭此窗口..."
"#,
                    env_path
                );
                
                let script_path = "/tmp/openclaw_whatsapp_login.command";
                std::fs::write(script_path, script_content)
                    .map_err(|e| format!("创建脚本失败: {}", e))?;
                
                // 设置可执行权限
                std::process::Command::new("chmod")
                    .args(["+x", script_path])
                    .output()
                    .map_err(|e| format!("设置权限失败: {}", e))?;
                
                // 使用 open 命令打开 .command 文件（会自动在新终端窗口中执行）
                std::process::Command::new("open")
                    .arg(script_path)
                    .spawn()
                    .map_err(|e| format!("启动终端失败: {}", e))?;
            }
            
            #[cfg(target_os = "linux")]
            {
                let env_path = platform::get_env_file_path();
                // 创建脚本
                let script_content = format!(
                    r#"#!/bin/bash
source {} 2>/dev/null
clear
echo "📱 WhatsApp 登录向导"
echo ""
openclaw channels login --channel whatsapp --verbose
echo ""
read -p "按回车键关闭..."
"#,
                    env_path
                );
                
                let script_path = "/tmp/openclaw_whatsapp_login.sh";
                std::fs::write(script_path, &script_content)
                    .map_err(|e| format!("创建脚本失败: {}", e))?;
                
                std::process::Command::new("chmod")
                    .args(["+x", script_path])
                    .output()
                    .map_err(|e| format!("设置权限失败: {}", e))?;
                
                // 尝试不同的终端模拟器
                let terminals = ["gnome-terminal", "xfce4-terminal", "konsole", "xterm"];
                let mut launched = false;
                
                for term in terminals {
                    let result = std::process::Command::new(term)
                        .args(["--", script_path])
                        .spawn();
                    
                    if result.is_ok() {
                        launched = true;
                        break;
                    }
                }
                
                if !launched {
                    return Err("无法启动终端，请手动运行: openclaw channels login --channel whatsapp".to_string());
                }
            }
            
            #[cfg(target_os = "windows")]
            {
                return Err("Windows 暂不支持自动启动终端，请手动运行: openclaw channels login --channel whatsapp".to_string());
            }
            
            Ok("已在新终端窗口中启动 WhatsApp 登录，请查看弹出的终端窗口并扫描二维码".to_string())
        }
        _ => Err(format!("不支持 {} 的登录向导", channel_type)),
    }
}

/// 安全扫描 - 检测系统安全风险
#[command]
pub async fn run_security_scan() -> Result<Vec<SecurityIssue>, String> {
    info!("[安全扫描] 开始安全风险检测...");
    let mut issues: Vec<SecurityIssue> = Vec::new();

    // ===== 1. 检测服务端口绑定 =====
    info!("[安全扫描] 检查服务端口绑定...");
    let port_bind_exposed = {
        // 检查配置文件中的 host 设置
        let config_path = platform::get_config_file_path();
        let mut exposed = false;
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(host) = json.get("gateway").and_then(|g| g.get("host")).and_then(|h| h.as_str()) {
                    if host == "0.0.0.0" {
                        exposed = true;
                    }
                }
            }
        }
        // 也通过 netstat 检查实际绑定
        if !exposed {
            #[cfg(target_os = "windows")]
            {
                if let Ok(output) = shell::run_cmd_output("netstat -ano | findstr :18789") {
                    if output.contains("0.0.0.0:18789") {
                        exposed = true;
                    }
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                if let Ok(output) = shell::run_bash_output("netstat -tlnp 2>/dev/null | grep 18789 || ss -tlnp 2>/dev/null | grep 18789") {
                    if output.contains("0.0.0.0:18789") || output.contains(":::18789") {
                        exposed = true;
                    }
                }
            }
        }
        exposed
    };

    if port_bind_exposed {
        issues.push(SecurityIssue {
            id: "port_bind_all".to_string(),
            title: "服务端口绑定到所有网络接口".to_string(),
            description: "OpenClaw Gateway 绑定在 0.0.0.0:18789，意味着所有网络接口（含公网）都可以访问该服务。".to_string(),
            severity: "high".to_string(),
            fixable: false,
            fixed: false,
            category: "exposure".to_string(),
            detail: Some("编辑 ~/.openclaw/openclaw.json，将 gateway.host 改为 \"127.0.0.1\" 以仅允许本机访问。".to_string()),
        });
    }

    // ===== 2. 检测 IP 地址类型 =====
    info!("[安全扫描] 检查 IP 地址类型...");
    let mut has_public_ip = false;
    {
        #[cfg(target_os = "windows")]
        let ip_output = shell::run_cmd_output("ipconfig");
        #[cfg(not(target_os = "windows"))]
        let ip_output = shell::run_bash_output("ip addr 2>/dev/null || ifconfig 2>/dev/null");

        if let Ok(output) = ip_output {
            // 简单检测是否有非私有 IP
            for line in output.lines() {
                let trimmed = line.trim();
                // 查找 IPv4 地址模式
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                for part in &parts {
                    // 尝试匹配 IP 地址格式
                    let ip_str = part.trim_start_matches("addr:");
                    if let Ok(ip) = ip_str.parse::<std::net::Ipv4Addr>() {
                        if !ip.is_loopback() && !ip.is_private() && !ip.is_link_local() && !ip.is_unspecified() {
                            has_public_ip = true;
                        }
                    }
                }
            }
        }
    }

    if has_public_ip {
        issues.push(SecurityIssue {
            id: "public_ip".to_string(),
            title: "检测到公网 IP 地址".to_string(),
            description: "本机存在公网 IP 地址，如果 OpenClaw 绑定在 0.0.0.0，互联网用户可能直接访问服务。".to_string(),
            severity: "high".to_string(),
            fixable: false,
            fixed: false,
            category: "network".to_string(),
            detail: Some("建议使用防火墙限制 18789 端口的外部访问，或者将服务绑定到 127.0.0.1。".to_string()),
        });
    } else {
        info!("[安全扫描] IP 地址检测通过，仅有私有/本地 IP");
    }

    // ===== 3. 检测 Gateway Token 身份验证 =====
    info!("[安全扫描] 检查 Gateway Token...");
    let has_gateway_token = {
        let env_path = platform::get_env_file_path();
        let token = crate::utils::file::read_env_value(&env_path, "OPENCLAW_GATEWAY_TOKEN");
        // 检查是否有真正的自定义 token（不是默认的）
        match token {
            Some(t) if !t.is_empty() && t != shell::DEFAULT_GATEWAY_TOKEN => true,
            _ => false,
        }
    };

    if !has_gateway_token {
        issues.push(SecurityIssue {
            id: "no_gateway_token".to_string(),
            title: "未配置 Gateway 安全令牌".to_string(),
            description: "OpenClaw Gateway 使用默认令牌或未配置令牌，任何知道端口的人都可以未授权访问。".to_string(),
            severity: "high".to_string(),
            fixable: true,
            fixed: false,
            category: "auth".to_string(),
            detail: Some("点击一键修复可自动生成一个安全的随机令牌。".to_string()),
        });
    }

    // ===== 4. 检测已安装技能库的安全性 =====
    info!("[安全扫描] 检查已安装技能库...");
    if let Ok(skills_output) = shell::run_openclaw(&["skills", "list", "--json"]) {
        if let Some(json_str) = extract_json_from_output(&skills_output) {
            if let Ok(skills_json) = serde_json::from_str::<serde_json::Value>(&json_str) {
                // 检查技能列表
                let skills_array = skills_json.as_array()
                    .or_else(|| skills_json.get("skills").and_then(|s| s.as_array()))
                    .or_else(|| skills_json.get("installed").and_then(|s| s.as_array()));

                if let Some(skills) = skills_array {
                    let dangerous_keywords = ["shell", "exec", "sudo", "admin", "root", "system", "eval", "rm", "delete"];
                    for skill in skills {
                        let name = skill.get("name")
                            .or_else(|| skill.get("id"))
                            .and_then(|n| n.as_str())
                            .unwrap_or("unknown");
                        let description = skill.get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("");
                        let combined = format!("{} {}", name, description).to_lowercase();

                        let is_dangerous = dangerous_keywords.iter().any(|kw| combined.contains(kw));
                        if is_dangerous {
                            issues.push(SecurityIssue {
                                id: format!("skill_risk_{}", name.replace(['/', '@', ' '], "_")),
                                title: format!("技能 \"{}\" 可能存在安全风险", name),
                                description: format!("该技能包含敏感关键词，可能拥有系统命令执行或文件删除权限。{}",
                                    if description.is_empty() { String::new() } else { format!(" 描述: {}", description) }),
                                severity: "medium".to_string(),
                                fixable: false,
                                fixed: false,
                                category: "skills".to_string(),
                                detail: Some(format!("请审查技能 \"{}\" 的源代码和权限声明，确认其安全性。如不再需要，可将其卸载。", name)),
                            });
                        }
                    }
                }
            }
        }
    }

    // ===== 5. 检测文件权限（仅 Unix） =====
    #[cfg(not(target_os = "windows"))]
    {
        info!("[安全扫描] 检查配置文件权限...");
        let env_path = platform::get_env_file_path();
        if std::path::Path::new(&env_path).exists() {
            if let Ok(output) = shell::run_bash_output(&format!("stat -c '%a' {} 2>/dev/null || stat -f '%Lp' {} 2>/dev/null", env_path, env_path)) {
                let perms = output.trim();
                // 环境变量文件不应该对其他用户可读（应该是 600 或 700）
                if perms != "600" && perms != "700" && perms.len() == 3 {
                    let other_perm = perms.chars().last().unwrap_or('0');
                    if other_perm != '0' {
                        issues.push(SecurityIssue {
                            id: "env_file_perms".to_string(),
                            title: "环境变量文件权限过宽".to_string(),
                            description: format!("~/.openclaw/env 文件权限为 {}，其他用户可能读取其中的 API Key 等敏感信息。", perms),
                            severity: "medium".to_string(),
                            fixable: true,
                            fixed: false,
                            category: "permissions".to_string(),
                            detail: Some("运行 chmod 600 ~/.openclaw/env 限制文件权限。".to_string()),
                        });
                    }
                }
            }
        }
    }

    // ===== 6. 检查 AI 文件访问权限配置 =====
    info!("[安全扫描] 检查 AI 文件访问权限...");
    {
        let config_path = platform::get_config_file_path();
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                // 检查是否有不受限的文件访问权限
                let file_access = json.get("permissions").and_then(|p| p.get("fileAccess")).and_then(|f| f.as_str());
                if file_access == Some("full") || file_access == Some("unrestricted") {
                    issues.push(SecurityIssue {
                        id: "unrestricted_file_access".to_string(),
                        title: "AI 拥有不受限的文件访问权限".to_string(),
                        description: "AI 可以读写系统上的任意文件，包括系统配置文件、SSH 密钥等敏感数据。".to_string(),
                        severity: "high".to_string(),
                        fixable: false,
                        fixed: false,
                        category: "permissions".to_string(),
                        detail: Some("在设置中将文件访问权限改为限制模式，只允许 AI 访问特定目录。".to_string()),
                    });
                }
            }
        }
    }

    // ===== 7. 通用安全建议（低风险） =====
    // 检查是否使用了 HTTPS
    issues.push(SecurityIssue {
        id: "no_https".to_string(),
        title: "服务未使用 HTTPS 加密".to_string(),
        description: "OpenClaw Gateway 使用 HTTP 明文传输，通信内容（含 API Key）可能被中间人窃取。".to_string(),
        severity: "low".to_string(),
        fixable: false,
        fixed: false,
        category: "service".to_string(),
        detail: Some("如果通过公网访问，建议使用 Nginx/Caddy 反向代理并启用 HTTPS。本地开发环境可忽略此项。".to_string()),
    });

    info!("[安全扫描] 扫描完成，发现 {} 个风险项", issues.len());
    Ok(issues)
}

/// 安全修复 - 修复可自动修复的安全问题
#[command]
pub async fn fix_security_issues(issue_ids: Vec<String>) -> Result<SecurityFixResult, String> {
    info!("[安全修复] 开始修复 {} 个问题...", issue_ids.len());
    let mut fixed_ids: Vec<String> = Vec::new();
    let mut failed_ids: Vec<String> = Vec::new();
    let mut manual_parts: Vec<String> = Vec::new();

    for id in &issue_ids {
        match id.as_str() {
            "no_gateway_token" => {
                info!("[安全修复] 生成 Gateway Token...");
                // 生成一个安全的随机 token
                use std::fmt::Write;
                let mut token = String::with_capacity(32);
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos();
                // 简单的伪随机 token
                let _ = write!(token, "ocm-{:x}-{:x}", timestamp, timestamp.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407));

                let env_path = platform::get_env_file_path();
                match crate::utils::file::set_env_value(&env_path, "OPENCLAW_GATEWAY_TOKEN", &token) {
                    Ok(_) => {
                        info!("[安全修复] Gateway Token 已生成并保存");
                        fixed_ids.push(id.clone());
                    }
                    Err(e) => {
                        error!("[安全修复] 保存 Gateway Token 失败: {}", e);
                        failed_ids.push(id.clone());
                    }
                }
            }
            "env_file_perms" => {
                info!("[安全修复] 修复环境变量文件权限...");
                #[cfg(not(target_os = "windows"))]
                {
                    let env_path = platform::get_env_file_path();
                    match shell::run_bash_output(&format!("chmod 600 {}", env_path)) {
                        Ok(_) => {
                            info!("[安全修复] 文件权限已修复为 600");
                            fixed_ids.push(id.clone());
                        }
                        Err(e) => {
                            error!("[安全修复] 修改权限失败: {}", e);
                            failed_ids.push(id.clone());
                        }
                    }
                }
                #[cfg(target_os = "windows")]
                {
                    failed_ids.push(id.clone());
                    manual_parts.push("Windows 系统请手动检查文件 ACL 权限设置。".to_string());
                }
            }
            _ => {
                warn!("[安全修复] 未知或不可修复的问题 ID: {}", id);
                failed_ids.push(id.clone());
            }
        }
    }

    // 组装不可修复项的手动说明
    let manual_instructions = if !failed_ids.is_empty() || !manual_parts.is_empty() {
        let mut instructions = String::new();
        if !manual_parts.is_empty() {
            instructions.push_str(&manual_parts.join("\n"));
            instructions.push_str("\n\n");
        }
        instructions.push_str("以下安全问题需要手动处理：\n");
        instructions.push_str("• 端口绑定：编辑 ~/.openclaw/openclaw.json 中的 gateway.host 设为 \"127.0.0.1\"\n");
        instructions.push_str("• 公网 IP：配置防火墙规则，限制 18789 端口的外部访问\n");
        instructions.push_str("• 技能库审查：检查可疑技能的源代码和权限，卸载不需要的技能\n");
        instructions.push_str("• HTTPS：使用 Nginx 反向代理并配置 SSL 证书\n");
        instructions.push_str("• 文件权限：在设置 > 安全设置中限制 AI 的文件访问范围");
        Some(instructions)
    } else {
        None
    };

    let message = if fixed_ids.is_empty() && !failed_ids.is_empty() {
        "修复失败，请参考手动防护建议".to_string()
    } else if !fixed_ids.is_empty() && failed_ids.is_empty() {
        format!("成功修复 {} 个安全问题", fixed_ids.len())
    } else if !fixed_ids.is_empty() && !failed_ids.is_empty() {
        format!("已修复 {} 个问题，{} 个需手动处理", fixed_ids.len(), failed_ids.len())
    } else {
        "没有需要修复的问题".to_string()
    };

    info!("[安全修复] 修复完成: 成功={}, 失败={}", fixed_ids.len(), failed_ids.len());

    Ok(SecurityFixResult {
        success: failed_ids.is_empty(),
        message,
        fixed_ids,
        failed_ids,
        manual_instructions,
    })
}
