use crate::models::{AITestResult, ChannelTestResult, DiagnosticResult, SystemInfo};
use crate::utils::{file, platform, shell};
use log::{debug, error, info, warn};
use serde_json::json;
use tauri::command;

const AI_TEST_TIMEOUT_SECS: u64 = 30;

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
            if second_char == '"'
                || second_char == '{'
                || second_char == '['
                || second_char.is_ascii_digit()
            {
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
    info!(
        "[诊断] OpenClaw 安装: {}",
        if openclaw_installed { "✓" } else { "✗" }
    );
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
        message: node_check.clone().unwrap_or_else(|_| "未安装".to_string()),
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
    let result = shell::run_openclaw_with_timeout(&[
        "agent",
        "--local",
        "--to",
        "+1234567890",
        "--message",
        "回复 OK",
    ], std::time::Duration::from_secs(AI_TEST_TIMEOUT_SECS));

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
                response: if success {
                    Some(filtered.clone())
                } else {
                    None
                },
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

#[command]
pub async fn test_model_connection(
    provider_id: String,
    model_id: String,
) -> Result<AITestResult, String> {
    info!("[AI测试] 开始测试指定模型: {}/{}", provider_id, model_id);

    let config_path = platform::get_config_file_path();
    let original_content = file::read_file(&config_path).unwrap_or_else(|_| "{}".to_string());
    let mut config: serde_json::Value =
        serde_json::from_str(&original_content).unwrap_or_else(|_| json!({}));

    if config.get("agents").is_none() {
        config["agents"] = json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = json!({});
    }
    if config["agents"]["defaults"].get("model").is_none() {
        config["agents"]["defaults"]["model"] = json!({});
    }

    let full_model_id = format!("{}/{}", provider_id, model_id);
    let fallback_models = config
        .pointer(&format!("/models/providers/{}/models", provider_id))
        .and_then(|value| value.as_array())
        .map(|models| {
            models
                .iter()
                .filter_map(|model| model.get("id").and_then(|value| value.as_str()))
                .filter(|id| *id != model_id)
                .map(|id| format!("{}/{}", provider_id, id))
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    config["agents"]["defaults"]["model"] = json!({
        "primary": full_model_id,
        "fallbacks": fallback_models,
    });

    let updated_content =
        serde_json::to_string_pretty(&config).map_err(|e| format!("序列化测试配置失败: {}", e))?;
    file::write_file(&config_path, &updated_content)
        .map_err(|e| format!("写入测试配置失败: {}", e))?;

    let start = std::time::Instant::now();
    let result = shell::run_openclaw_with_timeout(&[
        "agent",
        "--local",
        "--to",
        "+1234567890",
        "--message",
        "回复 OK",
    ], std::time::Duration::from_secs(AI_TEST_TIMEOUT_SECS));
    let latency = start.elapsed().as_millis() as u64;

    let _ = file::write_file(&config_path, &original_content);

    match result {
        Ok(output) => {
            let filtered = output
                .lines()
                .filter(|line| !line.contains("ExperimentalWarning"))
                .collect::<Vec<&str>>()
                .join("\n");
            let success = !filtered.to_lowercase().contains("error")
                && !filtered.contains("401")
                && !filtered.contains("403");

            Ok(AITestResult {
                success,
                provider: provider_id,
                model: model_id,
                response: if success {
                    Some(filtered.clone())
                } else {
                    None
                },
                error: if success { None } else { Some(filtered) },
                latency_ms: Some(latency),
            })
        }
        Err(e) => Ok(AITestResult {
            success: false,
            provider: provider_id,
            model: model_id,
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
        // WhatsApp 和 iMessage 只检查状态，不发送测试消息
        "whatsapp" | "imessage" => false,
        _ => false,
    }
}

/// 从文本输出解析渠道状态
/// 格式: "- Telegram default: enabled, configured, mode:polling, token:config"
fn parse_channel_status_text(
    output: &str,
    channel_type: &str,
) -> Option<(bool, bool, bool, String)> {
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
            if let Some((enabled, configured, linked, status_msg)) =
                parse_channel_status_text(output, &channel_type)
            {
                debug_info = format!(
                    "enabled={}, configured={}, linked={}",
                    enabled, configured, linked
                );
                info!("[渠道测试] {} 状态: {}", channel_type, debug_info);

                if !configured {
                    info!("[渠道测试] {} 未配置", channel_type);
                    return Ok(ChannelTestResult {
                        success: false,
                        channel: channel_type.clone(),
                        message: format!("{} 未配置", channel_type),
                        error: Some(format!(
                            "请运行: openclaw channels add --channel {}",
                            channel_lower
                        )),
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
                                let configured = ch
                                    .get("configured")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);
                                let linked =
                                    ch.get("linked").and_then(|v| v.as_bool()).unwrap_or(false);
                                channel_ok = configured;
                                status_message = if linked {
                                    "已链接".to_string()
                                } else {
                                    "已配置".to_string()
                                };
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
        info!(
            "[渠道测试] {} 不需要发送测试消息（状态检查即可）",
            channel_type
        );
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
        info!(
            "[渠道测试] 执行: openclaw message send --channel {} --target {} ...",
            channel_lower, target
        );
        let send_result = shell::run_openclaw(&[
            "message",
            "send",
            "--channel",
            &channel_lower,
            "--target",
            &target,
            "--message",
            &message,
            "--json",
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
                        let has_success = json
                            .get("success")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        let has_message_id = json.get("messageId").is_some();
                        let has_payload_ok = json
                            .get("payload")
                            .and_then(|p| p.get("ok"))
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        let has_payload_message_id = json
                            .get("payload")
                            .and_then(|p| p.get("messageId"))
                            .is_some();
                        let has_payload_result_message_id = json
                            .get("payload")
                            .and_then(|p| p.get("result"))
                            .and_then(|r| r.get("messageId"))
                            .is_some();

                        info!("[渠道测试] 判断条件: ok={}, success={}, messageId={}, payload.ok={}, payload.messageId={}, payload.result.messageId={}",
                            has_ok, has_success, has_message_id, has_payload_ok, has_payload_message_id, has_payload_result_message_id);

                        has_ok
                            || has_success
                            || has_message_id
                            || has_payload_ok
                            || has_payload_message_id
                            || has_payload_result_message_id
                    } else {
                        info!("[渠道测试] JSON 解析失败");
                        false
                    }
                } else {
                    info!("[渠道测试] 未提取到 JSON，检查关键词");
                    // 如果没有 JSON，检查是否有错误关键词
                    !output.to_lowercase().contains("error")
                        && !output.to_lowercase().contains("failed")
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

        info!(
            "[渠道测试] {} 未配置测试目标，跳过发送消息 ({})",
            channel_type, hint
        );
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
pub async fn send_test_message(
    channel_type: String,
    target: String,
) -> Result<ChannelTestResult, String> {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let message = format!("🤖 OpenClaw 测试消息\n\n✅ 连接成功！\n⏰ {}", timestamp);

    // 使用 openclaw message send 命令发送测试消息
    let send_result = shell::run_openclaw(&[
        "message",
        "send",
        "--channel",
        &channel_type,
        "--target",
        &target,
        "--message",
        &message,
        "--json",
    ]);

    match send_result {
        Ok(output) => {
            // 尝试从混合输出中提取并解析 JSON 结果
            let success = if let Some(json_str) = extract_json_from_output(&output) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&json_str) {
                    json.get("success")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                        || json.get("ok").and_then(|v| v.as_bool()).unwrap_or(false)
                        || json.get("messageId").is_some()
                } else {
                    false
                }
            } else {
                // 非 JSON 输出，检查是否包含错误关键词
                !output.to_lowercase().contains("error")
                    && !output.to_lowercase().contains("failed")
            };

            Ok(ChannelTestResult {
                success,
                channel: channel_type,
                message: if success {
                    "消息已发送".to_string()
                } else {
                    "消息发送失败".to_string()
                },
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
                    return Err(
                        "无法启动终端，请手动运行: openclaw channels login --channel whatsapp"
                            .to_string(),
                    );
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
