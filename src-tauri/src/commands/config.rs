use crate::models::{
    AIConfigOverview, ChannelConfig, ConfiguredModel, ConfiguredProvider,
    ModelConfig, ModelCostConfig, OfficialProvider, OpenClawConfig,
    ProviderConfig, SuggestedModel,
};
use crate::utils::{file, platform, shell};
use log::{debug, error, info, warn};
use serde_json::{json, Value};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::command;

/// 获取 openclaw.json 配置
fn load_openclaw_config() -> Result<Value, String> {
    let config_path = platform::get_config_file_path();
    
    if !file::file_exists(&config_path) {
        return Ok(json!({}));
    }
    
    let content =
        file::read_file(&config_path).map_err(|e| format!("读取配置文件失败: {}", e))?;
    
    serde_json::from_str(&content).map_err(|e| format!("解析配置文件失败: {}", e))
}

/// 保存 openclaw.json 配置
fn save_openclaw_config(config: &Value) -> Result<(), String> {
    let config_path = platform::get_config_file_path();
    
    let content =
        serde_json::to_string_pretty(config).map_err(|e| format!("序列化配置失败: {}", e))?;
    
    file::write_file(&config_path, &content).map_err(|e| format!("写入配置文件失败: {}", e))
}

/// 获取完整配置
#[command]
pub async fn get_config() -> Result<Value, String> {
    info!("[获取配置] 读取 openclaw.json 配置...");
    let result = load_openclaw_config();
    match &result {
        Ok(_) => info!("[获取配置] ✓ 配置读取成功"),
        Err(e) => error!("[获取配置] ✗ 配置读取失败: {}", e),
    }
    result
}

/// 保存配置
#[command]
pub async fn save_config(config: Value) -> Result<String, String> {
    info!("[保存配置] 保存 openclaw.json 配置...");
    debug!(
        "[保存配置] 配置内容: {}",
        serde_json::to_string_pretty(&config).unwrap_or_default()
    );
    match save_openclaw_config(&config) {
        Ok(_) => {
            info!("[保存配置] ✓ 配置保存成功");
            Ok("配置已保存".to_string())
        }
        Err(e) => {
            error!("[保存配置] ✗ 配置保存失败: {}", e);
            Err(e)
        }
    }
}

/// 获取环境变量值
#[command]
pub async fn get_env_value(key: String) -> Result<Option<String>, String> {
    info!("[获取环境变量] 读取环境变量: {}", key);
    let env_path = platform::get_env_file_path();
    let value = file::read_env_value(&env_path, &key);
    match &value {
        Some(v) => debug!(
            "[获取环境变量] {}={} (已脱敏)",
            key,
            if v.len() > 8 { "***" } else { v }
        ),
        None => debug!("[获取环境变量] {} 不存在", key),
    }
    Ok(value)
}

/// 保存环境变量值
#[command]
pub async fn save_env_value(key: String, value: String) -> Result<String, String> {
    info!("[保存环境变量] 保存环境变量: {}", key);
    let env_path = platform::get_env_file_path();
    debug!("[保存环境变量] 环境文件路径: {}", env_path);
    
    match file::set_env_value(&env_path, &key, &value) {
        Ok(_) => {
            info!("[保存环境变量] ✓ 环境变量 {} 保存成功", key);
            Ok("环境变量已保存".to_string())
        }
        Err(e) => {
            error!("[保存环境变量] ✗ 保存失败: {}", e);
            Err(format!("保存环境变量失败: {}", e))
        }
    }
}

// ============ Gateway Token 命令 ============

/// 生成随机 token
fn generate_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    
    // 使用时间戳和随机数生成 token
    let random_part: u64 = (timestamp as u64) ^ 0x5DEECE66Du64;
    format!("{:016x}{:016x}{:016x}", 
        random_part, 
        random_part.wrapping_mul(0x5DEECE66Du64),
        timestamp as u64
    )
}

/// 获取或生成 Gateway Token
#[command]
pub async fn get_or_create_gateway_token() -> Result<String, String> {
    info!("[Gateway Token] 获取或创建 Gateway Token...");
    
    let mut config = load_openclaw_config()?;
    
    // 检查是否已有 token
    if let Some(token) = config
        .pointer("/gateway/auth/token")
        .and_then(|v| v.as_str())
    {
        if !token.is_empty() {
            info!("[Gateway Token] ✓ 使用现有 Token");
            return Ok(token.to_string());
        }
    }
    
    // 生成新 token
    let new_token = generate_token();
    info!("[Gateway Token] 生成新 Token: {}...", &new_token[..8]);
    
    // 确保路径存在
    if config.get("gateway").is_none() {
        config["gateway"] = json!({});
    }
    if config["gateway"].get("auth").is_none() {
        config["gateway"]["auth"] = json!({});
    }
    
    // 设置 token 和 mode
    config["gateway"]["auth"]["token"] = json!(new_token);
    config["gateway"]["auth"]["mode"] = json!("token");
    config["gateway"]["mode"] = json!("local");
    
    // 保存配置
    save_openclaw_config(&config)?;
    
    info!("[Gateway Token] ✓ Token 已保存到配置");
    Ok(new_token)
}

/// 获取 Dashboard URL（带 token）
#[command]
pub async fn get_dashboard_url() -> Result<String, String> {
    info!("[Dashboard URL] 获取 Dashboard URL...");
    
    let token = get_or_create_gateway_token().await?;
    let url = format!("http://localhost:18789?token={}", token);
    
    info!("[Dashboard URL] ✓ URL: {}...", &url[..50.min(url.len())]);
    Ok(url)
}

// ============ AI 配置相关命令 ============

/// 获取官方 Provider 列表（预设模板）
#[command]
pub async fn get_official_providers() -> Result<Vec<OfficialProvider>, String> {
    info!("[官方 Provider] 获取官方 Provider 预设列表...");

    let providers = vec![
        OfficialProvider {
            id: "anthropic".to_string(),
            name: "Anthropic Claude".to_string(),
            icon: "🟣".to_string(),
            default_base_url: Some("https://api.anthropic.com".to_string()),
            api_type: "anthropic-messages".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/anthropic".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "claude-opus-4-5-20251101".to_string(),
                    name: "Claude Opus 4.5".to_string(),
                    description: Some("最强大版本，适合复杂任务".to_string()),
                    context_window: Some(200000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
                SuggestedModel {
                    id: "claude-sonnet-4-5-20250929".to_string(),
                    name: "Claude Sonnet 4.5".to_string(),
                    description: Some("平衡版本，性价比高".to_string()),
                    context_window: Some(200000),
                    max_tokens: Some(8192),
                    recommended: false,
                },
            ],
        },
        OfficialProvider {
            id: "openai".to_string(),
            name: "OpenAI".to_string(),
            icon: "🟢".to_string(),
            default_base_url: Some("https://api.openai.com/v1".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/openai".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "gpt-4o".to_string(),
                    name: "GPT-4o".to_string(),
                    description: Some("最新多模态模型".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(4096),
                    recommended: true,
                },
                SuggestedModel {
                    id: "gpt-4o-mini".to_string(),
                    name: "GPT-4o Mini".to_string(),
                    description: Some("快速经济版".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(4096),
                    recommended: false,
                },
            ],
        },
        OfficialProvider {
            id: "moonshot".to_string(),
            name: "Moonshot".to_string(),
            icon: "🌙".to_string(),
            default_base_url: Some("https://api.moonshot.cn/v1".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/moonshot".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "kimi-k2.5".to_string(),
                    name: "Kimi K2.5".to_string(),
                    description: Some("最新旗舰模型".to_string()),
                    context_window: Some(200000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
                SuggestedModel {
                    id: "moonshot-v1-128k".to_string(),
                    name: "Moonshot 128K".to_string(),
                    description: Some("超长上下文".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: false,
                },
            ],
        },
        OfficialProvider {
            id: "qwen".to_string(),
            name: "Qwen (通义千问)".to_string(),
            icon: "🔮".to_string(),
            default_base_url: Some("https://dashscope.aliyuncs.com/compatible-mode/v1".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/qwen".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "qwen-max".to_string(),
                    name: "Qwen Max".to_string(),
                    description: Some("最强大版本".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
                SuggestedModel {
                    id: "qwen-plus".to_string(),
                    name: "Qwen Plus".to_string(),
                    description: Some("平衡版本".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: false,
                },
            ],
        },
        OfficialProvider {
            id: "deepseek".to_string(),
            name: "DeepSeek".to_string(),
            icon: "🔵".to_string(),
            default_base_url: Some("https://api.deepseek.com".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: None,
            suggested_models: vec![
                SuggestedModel {
                    id: "deepseek-chat".to_string(),
                    name: "DeepSeek V3".to_string(),
                    description: Some("最新对话模型".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
                SuggestedModel {
                    id: "deepseek-reasoner".to_string(),
                    name: "DeepSeek R1".to_string(),
                    description: Some("推理增强模型".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: false,
                },
            ],
        },
        OfficialProvider {
            id: "glm".to_string(),
            name: "GLM (智谱)".to_string(),
            icon: "🔷".to_string(),
            default_base_url: Some("https://open.bigmodel.cn/api/paas/v4".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/glm".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "glm-4".to_string(),
                    name: "GLM-4".to_string(),
                    description: Some("最新旗舰模型".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
            ],
        },
        OfficialProvider {
            id: "minimax".to_string(),
            name: "MiniMax".to_string(),
            icon: "🟡".to_string(),
            default_base_url: Some("https://api.minimax.io/anthropic".to_string()),
            api_type: "anthropic-messages".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/minimax".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "minimax-m2.1".to_string(),
                    name: "MiniMax M2.1".to_string(),
                    description: Some("最新模型".to_string()),
                    context_window: Some(200000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
            ],
        },
        OfficialProvider {
            id: "venice".to_string(),
            name: "Venice AI".to_string(),
            icon: "🏛️".to_string(),
            default_base_url: Some("https://api.venice.ai/api/v1".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/venice".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "llama-3.3-70b".to_string(),
                    name: "Llama 3.3 70B".to_string(),
                    description: Some("隐私优先推理".to_string()),
                    context_window: Some(128000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
            ],
        },
        OfficialProvider {
            id: "openrouter".to_string(),
            name: "OpenRouter".to_string(),
            icon: "🔄".to_string(),
            default_base_url: Some("https://openrouter.ai/api/v1".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: true,
            docs_url: Some("https://docs.openclaw.ai/providers/openrouter".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "anthropic/claude-opus-4-5".to_string(),
                    name: "Claude Opus 4.5".to_string(),
                    description: Some("通过 OpenRouter 访问".to_string()),
                    context_window: Some(200000),
                    max_tokens: Some(8192),
                    recommended: true,
                },
            ],
        },
        OfficialProvider {
            id: "ollama".to_string(),
            name: "Ollama (本地)".to_string(),
            icon: "🟠".to_string(),
            default_base_url: Some("http://localhost:11434".to_string()),
            api_type: "openai-completions".to_string(),
            requires_api_key: false,
            docs_url: Some("https://docs.openclaw.ai/providers/ollama".to_string()),
            suggested_models: vec![
                SuggestedModel {
                    id: "llama3".to_string(),
                    name: "Llama 3".to_string(),
                    description: Some("本地运行".to_string()),
                    context_window: Some(8192),
                    max_tokens: Some(4096),
                    recommended: true,
                },
            ],
        },
    ];

    info!(
        "[官方 Provider] ✓ 返回 {} 个官方 Provider 预设",
        providers.len()
    );
    Ok(providers)
}

/// 获取 AI 配置概览
#[command]
pub async fn get_ai_config() -> Result<AIConfigOverview, String> {
    info!("[AI 配置] 获取 AI 配置概览...");

    let config_path = platform::get_config_file_path();
    info!("[AI 配置] 配置文件路径: {}", config_path);

    let config = load_openclaw_config()?;
    debug!("[AI 配置] 配置内容: {}", serde_json::to_string_pretty(&config).unwrap_or_default());

    // 解析主模型
    let primary_model = config
        .pointer("/agents/defaults/model/primary")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    info!("[AI 配置] 主模型: {:?}", primary_model);

    // 解析可用模型列表
    let available_models: Vec<String> = config
        .pointer("/agents/defaults/models")
        .and_then(|v| v.as_object())
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default();
    info!("[AI 配置] 可用模型数: {}", available_models.len());

    // 解析已配置的 Provider
    let mut configured_providers: Vec<ConfiguredProvider> = Vec::new();

    let providers_value = config.pointer("/models/providers");
    info!("[AI 配置] providers 节点存在: {}", providers_value.is_some());

    if let Some(providers) = providers_value.and_then(|v| v.as_object()) {
        info!("[AI 配置] 找到 {} 个 Provider", providers.len());
        
        for (provider_name, provider_config) in providers {
            info!("[AI 配置] 解析 Provider: {}", provider_name);
            
            let base_url = provider_config
                .get("baseUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let api_key = provider_config
                .get("apiKey")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let api_key_masked = api_key.as_ref().map(|key| {
                if key.len() > 8 {
                    format!("{}...{}", &key[..4], &key[key.len() - 4..])
                } else {
                    "****".to_string()
                }
            });

            // 解析模型列表
            let models_array = provider_config.get("models").and_then(|v| v.as_array());
            info!("[AI 配置] Provider {} 的 models 数组: {:?}", provider_name, models_array.map(|a| a.len()));
            
            let models: Vec<ConfiguredModel> = models_array
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| {
                            let id = m.get("id")?.as_str()?.to_string();
                            let name = m
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or(&id)
                                .to_string();
                            let full_id = format!("{}/{}", provider_name, id);
                            let is_primary = primary_model.as_ref() == Some(&full_id);

                            info!("[AI 配置] 解析模型: {} (is_primary: {})", full_id, is_primary);

                            Some(ConfiguredModel {
                                full_id,
                                id,
                                name,
                                api_type: m.get("api").and_then(|v| v.as_str()).map(|s| s.to_string()),
                                context_window: m
                                    .get("contextWindow")
                                    .and_then(|v| v.as_u64())
                                    .map(|n| n as u32),
                                max_tokens: m
                                    .get("maxTokens")
                                    .and_then(|v| v.as_u64())
                                    .map(|n| n as u32),
                                is_primary,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            info!("[AI 配置] Provider {} 解析完成: {} 个模型", provider_name, models.len());

            configured_providers.push(ConfiguredProvider {
                name: provider_name.clone(),
                base_url,
                api_key_masked,
                has_api_key: api_key.is_some(),
                models,
            });
        }
    } else {
        info!("[AI 配置] 未找到 providers 配置或格式不正确");
    }

    info!(
        "[AI 配置] ✓ 最终结果 - 主模型: {:?}, {} 个 Provider, {} 个可用模型",
        primary_model,
        configured_providers.len(),
        available_models.len()
    );

    Ok(AIConfigOverview {
        primary_model,
        configured_providers,
        available_models,
    })
}

/// 添加或更新 Provider
#[command]
pub async fn save_provider(
    provider_name: String,
    base_url: String,
    api_key: Option<String>,
    api_type: String,
    models: Vec<ModelConfig>,
) -> Result<String, String> {
    info!(
        "[保存 Provider] 保存 Provider: {} ({} 个模型)",
        provider_name,
        models.len()
    );

    let mut config = load_openclaw_config()?;

    // 确保路径存在
    if config.get("models").is_none() {
        config["models"] = json!({});
    }
    if config["models"].get("providers").is_none() {
        config["models"]["providers"] = json!({});
    }
    if config.get("agents").is_none() {
        config["agents"] = json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = json!({});
    }
    if config["agents"]["defaults"].get("models").is_none() {
        config["agents"]["defaults"]["models"] = json!({});
    }

    // 构建模型配置
    let models_json: Vec<Value> = models
        .iter()
        .map(|m| {
            let mut model_obj = json!({
                "id": m.id,
                "name": m.name,
                "api": m.api.clone().unwrap_or(api_type.clone()),
                "input": if m.input.is_empty() { vec!["text".to_string()] } else { m.input.clone() },
            });

            if let Some(cw) = m.context_window {
                model_obj["contextWindow"] = json!(cw);
            }
            if let Some(mt) = m.max_tokens {
                model_obj["maxTokens"] = json!(mt);
            }
            if let Some(r) = m.reasoning {
                model_obj["reasoning"] = json!(r);
            }
            if let Some(cost) = &m.cost {
                model_obj["cost"] = json!({
                    "input": cost.input,
                    "output": cost.output,
                    "cacheRead": cost.cache_read,
                    "cacheWrite": cost.cache_write,
                });
            } else {
                model_obj["cost"] = json!({
                    "input": 0,
                    "output": 0,
                    "cacheRead": 0,
                    "cacheWrite": 0,
                });
            }

            model_obj
        })
        .collect();

    // 构建 Provider 配置
    let mut provider_config = json!({
        "baseUrl": base_url,
        "models": models_json,
    });

    // 处理 API Key：如果传入了新的非空 key，使用新的；否则保留原有的
    if let Some(key) = api_key {
        if !key.is_empty() {
            // 使用新传入的 API Key
            provider_config["apiKey"] = json!(key);
            info!("[保存 Provider] 使用新的 API Key");
        } else {
            // 空字符串表示不更改，尝试保留原有的 API Key
            if let Some(existing_key) = config
                .pointer(&format!("/models/providers/{}/apiKey", provider_name))
                .and_then(|v| v.as_str())
            {
                provider_config["apiKey"] = json!(existing_key);
                info!("[保存 Provider] 保留原有的 API Key");
            }
        }
    } else {
        // None 表示不更改，尝试保留原有的 API Key
        if let Some(existing_key) = config
            .pointer(&format!("/models/providers/{}/apiKey", provider_name))
            .and_then(|v| v.as_str())
        {
            provider_config["apiKey"] = json!(existing_key);
            info!("[保存 Provider] 保留原有的 API Key");
        }
    }

    // 保存 Provider 配置
    config["models"]["providers"][&provider_name] = provider_config;

    // 将模型添加到 agents.defaults.models
    for model in &models {
        let full_id = format!("{}/{}", provider_name, model.id);
        config["agents"]["defaults"]["models"][&full_id] = json!({});
    }

    // 更新元数据
    let now = chrono::Utc::now().to_rfc3339();
    if config.get("meta").is_none() {
        config["meta"] = json!({});
    }
    config["meta"]["lastTouchedAt"] = json!(now);

    save_openclaw_config(&config)?;
    info!("[保存 Provider] ✓ Provider {} 保存成功", provider_name);

    Ok(format!("Provider {} 已保存", provider_name))
}

/// 删除 Provider
#[command]
pub async fn delete_provider(provider_name: String) -> Result<String, String> {
    info!("[删除 Provider] 删除 Provider: {}", provider_name);

    let mut config = load_openclaw_config()?;

    // 删除 Provider 配置
    if let Some(providers) = config
        .pointer_mut("/models/providers")
        .and_then(|v| v.as_object_mut())
    {
        providers.remove(&provider_name);
    }

    // 删除相关模型
    if let Some(models) = config
        .pointer_mut("/agents/defaults/models")
        .and_then(|v| v.as_object_mut())
    {
        let keys_to_remove: Vec<String> = models
            .keys()
            .filter(|k| k.starts_with(&format!("{}/", provider_name)))
            .cloned()
            .collect();

        for key in keys_to_remove {
            models.remove(&key);
        }
    }

    // 如果主模型属于该 Provider，清除主模型
    if let Some(primary) = config
        .pointer("/agents/defaults/model/primary")
        .and_then(|v| v.as_str())
    {
        if primary.starts_with(&format!("{}/", provider_name)) {
            config["agents"]["defaults"]["model"]["primary"] = json!(null);
        }
    }

    save_openclaw_config(&config)?;
    info!("[删除 Provider] ✓ Provider {} 已删除", provider_name);

    Ok(format!("Provider {} 已删除", provider_name))
}

/// 设置主模型
#[command]
pub async fn set_primary_model(model_id: String) -> Result<String, String> {
    info!("[设置主模型] 设置主模型: {}", model_id);

    let mut config = load_openclaw_config()?;

    // 确保路径存在
    if config.get("agents").is_none() {
        config["agents"] = json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = json!({});
    }
    if config["agents"]["defaults"].get("model").is_none() {
        config["agents"]["defaults"]["model"] = json!({});
    }

    // 设置主模型
    config["agents"]["defaults"]["model"]["primary"] = json!(model_id);

    save_openclaw_config(&config)?;
    info!("[设置主模型] ✓ 主模型已设置为: {}", model_id);

    Ok(format!("主模型已设置为 {}", model_id))
}

/// 添加模型到可用列表
#[command]
pub async fn add_available_model(model_id: String) -> Result<String, String> {
    info!("[添加模型] 添加模型到可用列表: {}", model_id);

    let mut config = load_openclaw_config()?;

    // 确保路径存在
    if config.get("agents").is_none() {
        config["agents"] = json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = json!({});
    }
    if config["agents"]["defaults"].get("models").is_none() {
        config["agents"]["defaults"]["models"] = json!({});
    }

    // 添加模型
    config["agents"]["defaults"]["models"][&model_id] = json!({});

    save_openclaw_config(&config)?;
    info!("[添加模型] ✓ 模型 {} 已添加", model_id);

    Ok(format!("模型 {} 已添加", model_id))
}

/// 从可用列表移除模型
#[command]
pub async fn remove_available_model(model_id: String) -> Result<String, String> {
    info!("[移除模型] 从可用列表移除模型: {}", model_id);

    let mut config = load_openclaw_config()?;

    if let Some(models) = config
        .pointer_mut("/agents/defaults/models")
        .and_then(|v| v.as_object_mut())
    {
        models.remove(&model_id);
    }

    save_openclaw_config(&config)?;
    info!("[移除模型] ✓ 模型 {} 已移除", model_id);

    Ok(format!("模型 {} 已移除", model_id))
}

// ============ 旧版兼容 ============

/// 获取所有支持的 AI Provider（旧版兼容）
#[command]
pub async fn get_ai_providers() -> Result<Vec<crate::models::AIProviderOption>, String> {
    info!("[AI Provider] 获取支持的 AI Provider 列表（旧版）...");

    let official = get_official_providers().await?;
    let providers: Vec<crate::models::AIProviderOption> = official
        .into_iter()
        .map(|p| crate::models::AIProviderOption {
            id: p.id,
            name: p.name,
            icon: p.icon,
            default_base_url: p.default_base_url,
            requires_api_key: p.requires_api_key,
            models: p
                .suggested_models
                .into_iter()
                .map(|m| crate::models::AIModelOption {
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    recommended: m.recommended,
                })
                .collect(),
        })
        .collect();

    Ok(providers)
}

// ============ 渠道配置 ============

/// 获取渠道配置 - 从 openclaw.json 和 env 文件读取
#[command]
pub async fn get_channels_config() -> Result<Vec<ChannelConfig>, String> {
    info!("[渠道配置] 获取渠道配置列表...");
    
    let config = load_openclaw_config()?;
    let channels_obj = config.get("channels").cloned().unwrap_or(json!({}));
    let env_path = platform::get_env_file_path();
    debug!("[渠道配置] 环境文件路径: {}", env_path);
    
    let mut channels = Vec::new();
    
    // 支持的渠道类型列表及其测试字段
    let channel_types = vec![
        ("telegram", "telegram", vec!["userId"]),
        ("discord", "discord", vec!["testChannelId"]),
        ("slack", "slack", vec!["testChannelId"]),
        ("feishu", "feishu", vec!["testChatId"]),
        ("whatsapp", "whatsapp", vec![]),
        ("imessage", "imessage", vec![]),
        ("wechat", "wechat", vec![]),
        ("dingtalk", "dingtalk", vec![]),
        ("qqbot", "qqbot", vec![]),
    ];
    
    for (channel_id, channel_type, test_fields) in channel_types {
        let channel_config = channels_obj.get(channel_id);
        
        let enabled = channel_config
            .and_then(|c| c.get("enabled"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        
        // 将渠道配置转换为 HashMap
        let mut config_map: HashMap<String, Value> = if let Some(cfg) = channel_config {
            if let Some(obj) = cfg.as_object() {
                obj.iter()
                    .filter(|(k, _)| *k != "enabled") // 排除 enabled 字段
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect()
            } else {
                HashMap::new()
            }
        } else {
            HashMap::new()
        };
        
        // 从 env 文件读取测试字段
        for field in test_fields {
            let env_key = format!(
                "OPENCLAW_{}_{}",
                channel_id.to_uppercase(),
                field.to_uppercase()
            );
            if let Some(value) = file::read_env_value(&env_path, &env_key) {
                config_map.insert(field.to_string(), json!(value));
            }
        }
        
        // 判断是否已配置（有任何非空配置项）
        let has_config = !config_map.is_empty() || enabled;
        
        channels.push(ChannelConfig {
            id: channel_id.to_string(),
            channel_type: channel_type.to_string(),
            enabled: has_config,
            config: config_map,
        });
    }
    
    info!("[渠道配置] ✓ 返回 {} 个渠道配置", channels.len());
    for ch in &channels {
        debug!("[渠道配置] - {}: enabled={}", ch.id, ch.enabled);
    }
    Ok(channels)
}

/// 保存渠道配置 - 保存到 openclaw.json
#[command]
pub async fn save_channel_config(channel: ChannelConfig) -> Result<String, String> {
    info!(
        "[保存渠道配置] 保存渠道配置: {} ({})",
        channel.id, channel.channel_type
    );
    
    let mut config = load_openclaw_config()?;
    let env_path = platform::get_env_file_path();
    debug!("[保存渠道配置] 环境文件路径: {}", env_path);
    
    // 确保 channels 对象存在
    if config.get("channels").is_none() {
        config["channels"] = json!({});
    }
    
    // 确保 plugins 对象存在
    if config.get("plugins").is_none() {
        config["plugins"] = json!({
            "allow": [],
            "entries": {}
        });
    }
    if config["plugins"].get("allow").is_none() {
        config["plugins"]["allow"] = json!([]);
    }
    if config["plugins"].get("entries").is_none() {
        config["plugins"]["entries"] = json!({});
    }
    
    // 这些字段只用于测试，不保存到 openclaw.json，而是保存到 env 文件
    let test_only_fields = vec!["userId", "testChatId", "testChannelId"];
    
    // 构建渠道配置
    let mut channel_obj = json!({
        "enabled": true
    });
    
    // 添加渠道特定配置
    for (key, value) in &channel.config {
        if test_only_fields.contains(&key.as_str()) {
            // 保存到 env 文件
            let env_key = format!(
                "OPENCLAW_{}_{}",
                channel.id.to_uppercase(),
                key.to_uppercase()
            );
            if let Some(val_str) = value.as_str() {
                let _ = file::set_env_value(&env_path, &env_key, val_str);
            }
        } else {
            // 保存到 openclaw.json
            channel_obj[key] = value.clone();
        }
    }
    
    // 更新 channels 配置
    config["channels"][&channel.id] = channel_obj;
    
    // 更新 plugins.allow 数组 - 确保渠道在白名单中
    if let Some(allow_arr) = config["plugins"]["allow"].as_array_mut() {
        let channel_id_val = json!(&channel.id);
        if !allow_arr.contains(&channel_id_val) {
            allow_arr.push(channel_id_val);
        }
    }
    
    // 更新 plugins.entries - 确保插件已启用
    config["plugins"]["entries"][&channel.id] = json!({
        "enabled": true
    });
    
    // 保存配置
    info!("[保存渠道配置] 写入配置文件...");
    match save_openclaw_config(&config) {
        Ok(_) => {
            info!(
                "[保存渠道配置] ✓ {} 配置保存成功",
                channel.channel_type
            );
            Ok(format!("{} 配置已保存", channel.channel_type))
        }
        Err(e) => {
            error!("[保存渠道配置] ✗ 保存失败: {}", e);
            Err(e)
        }
    }
}

/// 清空渠道配置 - 从 openclaw.json 中删除指定渠道的配置
#[command]
pub async fn clear_channel_config(channel_id: String) -> Result<String, String> {
    info!("[清空渠道配置] 清空渠道配置: {}", channel_id);
    
    let mut config = load_openclaw_config()?;
    let env_path = platform::get_env_file_path();
    
    // 从 channels 对象中删除该渠道
    if let Some(channels) = config.get_mut("channels").and_then(|v| v.as_object_mut()) {
        channels.remove(&channel_id);
        info!("[清空渠道配置] 已从 channels 中删除: {}", channel_id);
    }
    
    // 从 plugins.allow 数组中删除
    if let Some(allow_arr) = config.pointer_mut("/plugins/allow").and_then(|v| v.as_array_mut()) {
        allow_arr.retain(|v| v.as_str() != Some(&channel_id));
        info!("[清空渠道配置] 已从 plugins.allow 中删除: {}", channel_id);
    }
    
    // 从 plugins.entries 中删除
    if let Some(entries) = config.pointer_mut("/plugins/entries").and_then(|v| v.as_object_mut()) {
        entries.remove(&channel_id);
        info!("[清空渠道配置] 已从 plugins.entries 中删除: {}", channel_id);
    }
    
    // 清除相关的环境变量
    let env_prefixes = vec![
        format!("OPENCLAW_{}_USERID", channel_id.to_uppercase()),
        format!("OPENCLAW_{}_TESTCHATID", channel_id.to_uppercase()),
        format!("OPENCLAW_{}_TESTCHANNELID", channel_id.to_uppercase()),
    ];
    for env_key in env_prefixes {
        let _ = file::remove_env_value(&env_path, &env_key);
    }
    
    // 保存配置
    match save_openclaw_config(&config) {
        Ok(_) => {
            info!("[清空渠道配置] ✓ {} 配置已清空", channel_id);
            Ok(format!("{} 配置已清空", channel_id))
        }
        Err(e) => {
            error!("[清空渠道配置] ✗ 清空失败: {}", e);
            Err(e)
        }
    }
}

// ============ 飞书插件管理 ============

/// 飞书插件状态
#[derive(Debug, Serialize, Deserialize)]
pub struct FeishuPluginStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub plugin_name: Option<String>,
}

/// 检查飞书插件是否已安装
#[command]
pub async fn check_feishu_plugin() -> Result<FeishuPluginStatus, String> {
    info!("[飞书插件] 检查飞书插件安装状态...");
    
    // 执行 openclaw plugins list 命令
    match shell::run_openclaw(&["plugins", "list"]) {
        Ok(output) => {
            debug!("[飞书插件] plugins list 输出: {}", output);
            
            // 查找包含 feishu 的行（不区分大小写）
            let lines: Vec<&str> = output.lines().collect();
            let feishu_line = lines.iter().find(|line| {
                line.to_lowercase().contains("feishu")
            });
            
            if let Some(line) = feishu_line {
                info!("[飞书插件] ✓ 飞书插件已安装: {}", line);
                
                // 尝试解析版本号（通常格式为 "name@version" 或 "name version"）
                let version = if line.contains('@') {
                    line.split('@').last().map(|s| s.trim().to_string())
                } else {
                    // 尝试匹配版本号模式 (如 0.1.2)
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    parts.iter()
                        .find(|p| p.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false))
                        .map(|s| s.to_string())
                };
                
                Ok(FeishuPluginStatus {
                    installed: true,
                    version,
                    plugin_name: Some(line.trim().to_string()),
                })
            } else {
                info!("[飞书插件] ✗ 飞书插件未安装");
                Ok(FeishuPluginStatus {
                    installed: false,
                    version: None,
                    plugin_name: None,
                })
            }
        }
        Err(e) => {
            warn!("[飞书插件] 检查插件列表失败: {}", e);
            // 如果命令失败，假设插件未安装
            Ok(FeishuPluginStatus {
                installed: false,
                version: None,
                plugin_name: None,
            })
        }
    }
}

/// 安装飞书插件
#[command]
pub async fn install_feishu_plugin() -> Result<String, String> {
    info!("[飞书插件] 开始安装飞书插件...");
    
    // 先检查是否已安装
    let status = check_feishu_plugin().await?;
    if status.installed {
        info!("[飞书插件] 飞书插件已安装，跳过");
        return Ok(format!("飞书插件已安装: {}", status.plugin_name.unwrap_or_default()));
    }
    
    // 安装飞书插件
    // 注意：使用 @m1heng-clawd/feishu 包名
    info!("[飞书插件] 执行 openclaw plugins install @m1heng-clawd/feishu ...");
    match shell::run_openclaw(&["plugins", "install", "@m1heng-clawd/feishu"]) {
        Ok(output) => {
            info!("[飞书插件] 安装输出: {}", output);
            
            // 验证安装结果
            let verify_status = check_feishu_plugin().await?;
            if verify_status.installed {
                info!("[飞书插件] ✓ 飞书插件安装成功");
                Ok(format!("飞书插件安装成功: {}", verify_status.plugin_name.unwrap_or_default()))
            } else {
                warn!("[飞书插件] 安装命令执行成功但插件未找到");
                Err("安装命令执行成功但插件未找到，请检查 openclaw 版本".to_string())
            }
        }
        Err(e) => {
            error!("[飞书插件] ✗ 安装失败: {}", e);
            Err(format!("安装飞书插件失败: {}\n\n请手动执行: openclaw plugins install @m1heng-clawd/feishu", e))
        }
    }
}

// ============ QQ Bot 插件管理 ============

/// QQ Bot 插件状态
#[derive(Debug, Serialize, Deserialize)]
pub struct QQBotPluginStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub plugin_name: Option<String>,
}

/// 检查 QQ Bot 插件是否已安装
#[command]
pub async fn check_qqbot_plugin() -> Result<QQBotPluginStatus, String> {
    info!("[QQ Bot 插件] 检查 QQ Bot 插件安装状态...");
    
    // 执行 openclaw plugins list 命令
    match shell::run_openclaw(&["plugins", "list"]) {
        Ok(output) => {
            debug!("[QQ Bot 插件] plugins list 输出: {}", output);
            
            // 查找包含 qqbot 的行（不区分大小写）
            let lines: Vec<&str> = output.lines().collect();
            let qqbot_line = lines.iter().find(|line| {
                line.to_lowercase().contains("qqbot")
            });
            
            if let Some(line) = qqbot_line {
                info!("[QQ Bot 插件] ✓ QQ Bot 插件已安装: {}", line);
                
                // 尝试解析版本号
                let version = if line.contains('@') {
                    line.split('@').last().map(|s| s.trim().to_string())
                } else {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    parts.iter()
                        .find(|p| p.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false))
                        .map(|s| s.to_string())
                };
                
                Ok(QQBotPluginStatus {
                    installed: true,
                    version,
                    plugin_name: Some(line.trim().to_string()),
                })
            } else {
                info!("[QQ Bot 插件] ✗ QQ Bot 插件未安装");
                Ok(QQBotPluginStatus {
                    installed: false,
                    version: None,
                    plugin_name: None,
                })
            }
        }
        Err(e) => {
            warn!("[QQ Bot 插件] 检查插件列表失败: {}", e);
            Ok(QQBotPluginStatus {
                installed: false,
                version: None,
                plugin_name: None,
            })
        }
    }
}

/// 安装 QQ Bot 插件
#[command]
pub async fn install_qqbot_plugin() -> Result<String, String> {
    info!("[QQ Bot 插件] 开始安装 QQ Bot 插件...");
    
    // 先检查是否已安装
    let status = check_qqbot_plugin().await?;
    if status.installed {
        info!("[QQ Bot 插件] QQ Bot 插件已安装，跳过");
        return Ok(format!("QQ Bot 插件已安装: {}", status.plugin_name.unwrap_or_default()));
    }
    
    // 安装 QQ Bot 插件
    info!("[QQ Bot 插件] 执行 openclaw plugins install @sliverp/qqbot@latest ...");
    match shell::run_openclaw(&["plugins", "install", "@sliverp/qqbot@latest"]) {
        Ok(output) => {
            info!("[QQ Bot 插件] 安装输出: {}", output);
            
            // 验证安装结果
            let verify_status = check_qqbot_plugin().await?;
            if verify_status.installed {
                info!("[QQ Bot 插件] ✓ QQ Bot 插件安装成功");
                Ok(format!("QQ Bot 插件安装成功: {}", verify_status.plugin_name.unwrap_or_default()))
            } else {
                warn!("[QQ Bot 插件] 安装命令执行成功但插件未找到");
                Err("安装命令执行成功但插件未找到，请检查 openclaw 版本".to_string())
            }
        }
        Err(e) => {
            error!("[QQ Bot 插件] ✗ 安装失败: {}", e);
            Err(format!("安装 QQ Bot 插件失败: {}\n\n请手动执行: openclaw plugins install @sliverp/qqbot@latest", e))
        }
    }
}

// ============ 技能库管理 ============

use crate::models::{SkillDefinition, SkillConfigField, SkillSelectOption};

/// 获取内置技能预设清单
fn get_preset_skills() -> Vec<SkillDefinition> {
    vec![
        // ---- 内置工具 (builtin) ----
        SkillDefinition {
            id: "brave-search".into(),
            name: "Brave Search".into(),
            description: "使用 Brave Search API 进行网页搜索".into(),
            icon: "🔍".into(),
            source: "builtin".into(),
            version: None,
            author: Some("OpenClaw".into()),
            package_name: None,
            clawhub_slug: None,
            installed: true, // 内置默认已安装
            enabled: false,
            config_fields: vec![
                SkillConfigField {
                    key: "apiKey".into(), label: "Brave API Key".into(), field_type: "password".into(),
                    placeholder: Some("BSA...".into()), options: None, required: true,
                    default_value: None, help_text: Some("从 brave.com/search/api 获取".into()),
                },
            ],
            config_values: HashMap::new(),
            docs_url: Some("https://docs.openclaw.ai/tools/brave-search".into()),
            category: Some("搜索".into()),
        },
        SkillDefinition {
            id: "perplexity-sonar".into(),
            name: "Perplexity Sonar".into(),
            description: "使用 Perplexity Sonar API 进行深度搜索和问答".into(),
            icon: "🌐".into(),
            source: "builtin".into(),
            version: None,
            author: Some("OpenClaw".into()),
            package_name: None,
            clawhub_slug: None,
            installed: true,
            enabled: false,
            config_fields: vec![
                SkillConfigField {
                    key: "apiKey".into(), label: "Perplexity API Key".into(), field_type: "password".into(),
                    placeholder: Some("pplx-...".into()), options: None, required: true,
                    default_value: None, help_text: Some("从 perplexity.ai 获取 API Key".into()),
                },
            ],
            config_values: HashMap::new(),
            docs_url: Some("https://docs.openclaw.ai/tools/perplexity-sonar".into()),
            category: Some("搜索".into()),
        },
        SkillDefinition {
            id: "web-tools".into(),
            name: "Web Tools".into(),
            description: "网页浏览、表单填写、数据提取".into(),
            icon: "🌍".into(),
            source: "builtin".into(),
            version: None,
            author: Some("OpenClaw".into()),
            package_name: None,
            clawhub_slug: None,
            installed: true,
            enabled: false,
            config_fields: vec![],
            config_values: HashMap::new(),
            docs_url: Some("https://docs.openclaw.ai/browser".into()),
            category: Some("工具".into()),
        },
        SkillDefinition {
            id: "pdf-tool".into(),
            name: "PDF Tool".into(),
            description: "PDF 文件读取和解析".into(),
            icon: "📄".into(),
            source: "builtin".into(),
            version: None,
            author: Some("OpenClaw".into()),
            package_name: None,
            clawhub_slug: None,
            installed: true,
            enabled: false,
            config_fields: vec![],
            config_values: HashMap::new(),
            docs_url: Some("https://docs.openclaw.ai/tools/pdf".into()),
            category: Some("工具".into()),
        },
        SkillDefinition {
            id: "firecrawl".into(),
            name: "Firecrawl".into(),
            description: "高级网页抓取与内容提取工具".into(),
            icon: "🔥".into(),
            source: "builtin".into(),
            version: None,
            author: Some("OpenClaw".into()),
            package_name: None,
            clawhub_slug: None,
            installed: true,
            enabled: false,
            config_fields: vec![
                SkillConfigField {
                    key: "apiKey".into(), label: "Firecrawl API Key".into(), field_type: "password".into(),
                    placeholder: Some("fc-...".into()), options: None, required: true,
                    default_value: None, help_text: Some("从 firecrawl.dev 获取".into()),
                },
            ],
            config_values: HashMap::new(),
            docs_url: Some("https://docs.openclaw.ai/tools/firecrawl".into()),
            category: Some("工具".into()),
        },

        // ---- 官方插件 (official) ----
        SkillDefinition {
            id: "voice-call".into(),
            name: "Voice Call".into(),
            description: "语音通话功能，支持实时语音交互".into(),
            icon: "📞".into(),
            source: "official".into(),
            version: None,
            author: Some("OpenClaw".into()),
            package_name: Some("@openclaw/voice-call".into()),
            clawhub_slug: None,
            installed: false,
            enabled: false,
            config_fields: vec![],
            config_values: HashMap::new(),
            docs_url: Some("https://docs.openclaw.ai/plugins/voice-call".into()),
            category: Some("通讯".into()),
        },
        SkillDefinition {
            id: "msteams".into(),
            name: "Microsoft Teams".into(),
            description: "Microsoft Teams 消息渠道集成".into(),
            icon: "🟦".into(),
            source: "official".into(),
            version: None,
            author: Some("OpenClaw".into()),
            package_name: Some("@openclaw/msteams".into()),
            clawhub_slug: None,
            installed: false,
            enabled: false,
            config_fields: vec![
                SkillConfigField {
                    key: "appId".into(), label: "App ID".into(), field_type: "text".into(),
                    placeholder: Some("Teams Bot App ID".into()), options: None, required: true,
                    default_value: None, help_text: None,
                },
                SkillConfigField {
                    key: "appPassword".into(), label: "App Password".into(), field_type: "password".into(),
                    placeholder: Some("Teams Bot App Password".into()), options: None, required: true,
                    default_value: None, help_text: None,
                },
            ],
            config_values: HashMap::new(),
            docs_url: Some("https://docs.openclaw.ai/plugins/msteams".into()),
            category: Some("通讯".into()),
        },
        SkillDefinition {
            id: "matrix".into(),
            name: "Matrix".into(),
            description: "Matrix 去中心化通讯协议集成".into(),
            icon: "🟩".into(),
            source: "official".into(),
            version: None,
            author: Some("OpenClaw".into()),
            package_name: Some("@openclaw/matrix".into()),
            clawhub_slug: None,
            installed: false,
            enabled: false,
            config_fields: vec![
                SkillConfigField {
                    key: "homeserverUrl".into(), label: "Homeserver URL".into(), field_type: "text".into(),
                    placeholder: Some("https://matrix.org".into()), options: None, required: true,
                    default_value: None, help_text: None,
                },
                SkillConfigField {
                    key: "accessToken".into(), label: "Access Token".into(), field_type: "password".into(),
                    placeholder: Some("Matrix Access Token".into()), options: None, required: true,
                    default_value: None, help_text: None,
                },
            ],
            config_values: HashMap::new(),
            docs_url: Some("https://docs.openclaw.ai/plugins/matrix".into()),
            category: Some("通讯".into()),
        },
        SkillDefinition {
            id: "nostr".into(),
            name: "Nostr".into(),
            description: "Nostr 去中心化社交协议集成".into(),
            icon: "🟪".into(),
            source: "official".into(),
            version: None,
            author: Some("OpenClaw".into()),
            package_name: Some("@openclaw/nostr".into()),
            clawhub_slug: None,
            installed: false,
            enabled: false,
            config_fields: vec![],
            config_values: HashMap::new(),
            docs_url: None,
            category: Some("通讯".into()),
        },

        // ---- 社区技能 (community) ----
        SkillDefinition {
            id: "github".into(),
            name: "GitHub".into(),
            description: "GitHub 仓库管理、Issue、PR 操作".into(),
            icon: "🐙".into(),
            source: "community".into(),
            version: None,
            author: Some("Community".into()),
            package_name: None,
            clawhub_slug: Some("github".into()),
            installed: false,
            enabled: false,
            config_fields: vec![
                SkillConfigField {
                    key: "token".into(), label: "GitHub Token".into(), field_type: "password".into(),
                    placeholder: Some("ghp_...".into()), options: None, required: true,
                    default_value: None, help_text: Some("Personal Access Token".into()),
                },
            ],
            config_values: HashMap::new(),
            docs_url: Some("https://clawhub.ai/skills/github".into()),
            category: Some("开发".into()),
        },
        SkillDefinition {
            id: "coding-agent".into(),
            name: "Coding Agent".into(),
            description: "增强编程能力，支持代码生成、重构和调试".into(),
            icon: "💻".into(),
            source: "community".into(),
            version: None,
            author: Some("Community".into()),
            package_name: None,
            clawhub_slug: Some("coding-agent".into()),
            installed: false,
            enabled: false,
            config_fields: vec![],
            config_values: HashMap::new(),
            docs_url: Some("https://clawhub.ai/skills/coding-agent".into()),
            category: Some("开发".into()),
        },
        SkillDefinition {
            id: "gog".into(),
            name: "Google Workspace (GOG)".into(),
            description: "Google Workspace 集成，支持 Gmail、Calendar、Drive".into(),
            icon: "📧".into(),
            source: "community".into(),
            version: None,
            author: Some("Community".into()),
            package_name: None,
            clawhub_slug: Some("gog".into()),
            installed: false,
            enabled: false,
            config_fields: vec![],
            config_values: HashMap::new(),
            docs_url: Some("https://clawhub.ai/skills/gog".into()),
            category: Some("生产力".into()),
        },
        SkillDefinition {
            id: "linear".into(),
            name: "Linear".into(),
            description: "Linear 项目管理工具集成".into(),
            icon: "📋".into(),
            source: "community".into(),
            version: None,
            author: Some("Community".into()),
            package_name: None,
            clawhub_slug: Some("linear".into()),
            installed: false,
            enabled: false,
            config_fields: vec![
                SkillConfigField {
                    key: "apiKey".into(), label: "Linear API Key".into(), field_type: "password".into(),
                    placeholder: Some("lin_api_...".into()), options: None, required: true,
                    default_value: None, help_text: None,
                },
            ],
            config_values: HashMap::new(),
            docs_url: Some("https://clawhub.ai/skills/linear".into()),
            category: Some("生产力".into()),
        },
        SkillDefinition {
            id: "obsidian".into(),
            name: "Obsidian".into(),
            description: "Obsidian 笔记管理，支持读写 Vault".into(),
            icon: "📝".into(),
            source: "community".into(),
            version: None,
            author: Some("Community".into()),
            package_name: None,
            clawhub_slug: Some("obsidian".into()),
            installed: false,
            enabled: false,
            config_fields: vec![
                SkillConfigField {
                    key: "vaultPath".into(), label: "Vault 路径".into(), field_type: "text".into(),
                    placeholder: Some("/path/to/vault".into()), options: None, required: true,
                    default_value: None, help_text: Some("Obsidian Vault 文件夹路径".into()),
                },
            ],
            config_values: HashMap::new(),
            docs_url: Some("https://clawhub.ai/skills/obsidian".into()),
            category: Some("生产力".into()),
        },
        SkillDefinition {
            id: "playwright-scraper".into(),
            name: "Playwright Scraper".into(),
            description: "基于 Playwright 的高级网页爬虫和数据抓取".into(),
            icon: "🕷️".into(),
            source: "community".into(),
            version: None,
            author: Some("Community".into()),
            package_name: None,
            clawhub_slug: Some("playwright-scraper".into()),
            installed: false,
            enabled: false,
            config_fields: vec![],
            config_values: HashMap::new(),
            docs_url: Some("https://clawhub.ai/skills/playwright-scraper".into()),
            category: Some("工具".into()),
        },
    ]
}

/// 获取技能库列表 — 合并预设定义 + 配置文件中的安装/启用状态
#[command]
pub async fn get_skills_list() -> Result<Vec<SkillDefinition>, String> {
    info!("[技能库] 获取技能列表...");

    let config = load_openclaw_config()?;
    let plugins_entries = config.pointer("/plugins/entries")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let plugins_allow: Vec<String> = config.pointer("/plugins/allow")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    // 获取已安装的插件列表（通过 openclaw plugins list）
    let installed_plugins: Vec<String> = match shell::run_openclaw(&["plugins", "list"]) {
        Ok(output) => {
            output.lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        }
        Err(_) => Vec::new(),
    };

    let mut skills = get_preset_skills();

    // 合并配置状态
    for skill in &mut skills {
        // 检查 plugins.entries 中是否有对应条目
        if let Some(entry) = plugins_entries.get(&skill.id) {
            let is_enabled = entry.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
            skill.enabled = is_enabled;

            // 读取保存的配置值
            if let Some(cfg) = entry.as_object() {
                for (k, v) in cfg {
                    if k != "enabled" {
                        skill.config_values.insert(k.clone(), v.clone());
                    }
                }
            }
        }

        // 检查 plugins.allow 中是否包含该技能
        if plugins_allow.contains(&skill.id) {
            skill.enabled = true;
        }

        // 对于非内置技能，检查是否已安装
        if skill.source != "builtin" {
            let pkg = skill.package_name.as_deref().unwrap_or(&skill.id);
            skill.installed = installed_plugins.iter().any(|line| {
                line.to_lowercase().contains(&pkg.to_lowercase())
                    || line.to_lowercase().contains(&skill.id.to_lowercase())
            });
        }
    }

    info!("[技能库] ✓ 返回 {} 个技能", skills.len());
    Ok(skills)
}

/// 安装技能
#[command]
pub async fn install_skill(skill_id: String, package_name: Option<String>, clawhub_slug: Option<String>) -> Result<String, String> {
    info!("[技能库] 安装技能: {} (pkg: {:?}, slug: {:?})", skill_id, package_name, clawhub_slug);

    // 优先使用 npm 包名安装
    if let Some(pkg) = &package_name {
        info!("[技能库] 通过 npm 包安装: {}", pkg);
        match shell::run_openclaw(&["plugins", "install", pkg]) {
            Ok(output) => {
                info!("[技能库] ✓ 安装成功: {}", output);
                // 更新配置：添加到 plugins.entries 和 plugins.allow
                let _ = update_skill_plugin_config(&skill_id, true);
                return Ok(format!("技能 {} 安装成功", skill_id));
            }
            Err(e) => {
                error!("[技能库] ✗ npm 安装失败: {}", e);
                return Err(format!("安装失败: {}", e));
            }
        }
    }

    // 使用 clawhub slug 安装
    if let Some(slug) = &clawhub_slug {
        info!("[技能库] 通过 ClawHub 安装: {}", slug);
        // 使用 npx clawhub install <slug>
        let install_cmd = format!("npx -y clawhub@latest install {}", slug);
        match shell::run_script_output(&install_cmd) {
            Ok(output) => {
                info!("[技能库] ✓ ClawHub 安装成功: {}", output);
                let _ = update_skill_plugin_config(&skill_id, true);
                return Ok(format!("技能 {} 安装成功", skill_id));
            }
            Err(e) => {
                error!("[技能库] ✗ ClawHub 安装失败: {}", e);
                return Err(format!("安装失败: {}", e));
            }
        }
    }

    Err("未指定安装来源（npm 包名或 ClawHub slug）".into())
}

/// 卸载技能
#[command]
pub async fn uninstall_skill(skill_id: String, package_name: Option<String>) -> Result<String, String> {
    info!("[技能库] 卸载技能: {} (pkg: {:?})", skill_id, package_name);

    let pkg = package_name.as_deref().unwrap_or(&skill_id);

    match shell::run_openclaw(&["plugins", "uninstall", pkg]) {
        Ok(output) => {
            info!("[技能库] ✓ 卸载成功: {}", output);
            // 从配置中移除
            let _ = update_skill_plugin_config(&skill_id, false);
            Ok(format!("技能 {} 已卸载", skill_id))
        }
        Err(e) => {
            warn!("[技能库] 卸载命令失败: {}", e);
            // 即使命令失败，也从配置中移除
            let _ = update_skill_plugin_config(&skill_id, false);
            Ok(format!("技能 {} 配置已清除", skill_id))
        }
    }
}

/// 保存技能配置
#[command]
pub async fn save_skill_config(skill_id: String, enabled: bool, config: HashMap<String, Value>) -> Result<String, String> {
    info!("[技能库] 保存技能配置: {} (enabled: {})", skill_id, enabled);

    let mut full_config = load_openclaw_config()?;

    // 确保 plugins 路径存在
    if full_config.get("plugins").is_none() {
        full_config["plugins"] = json!({ "allow": [], "entries": {} });
    }
    if full_config["plugins"].get("allow").is_none() {
        full_config["plugins"]["allow"] = json!([]);
    }
    if full_config["plugins"].get("entries").is_none() {
        full_config["plugins"]["entries"] = json!({});
    }

    // 构建 entry
    let mut entry = json!({ "enabled": enabled });
    for (k, v) in &config {
        entry[k] = v.clone();
    }
    full_config["plugins"]["entries"][&skill_id] = entry;

    // 更新 allow 列表
    if let Some(allow_arr) = full_config["plugins"]["allow"].as_array_mut() {
        let id_val = json!(&skill_id);
        if enabled {
            if !allow_arr.contains(&id_val) {
                allow_arr.push(id_val);
            }
        } else {
            allow_arr.retain(|v| v.as_str() != Some(&skill_id));
        }
    }

    // 对于有环境变量需求的配置，保存到 env 文件
    let env_path = platform::get_env_file_path();
    for (k, v) in &config {
        if k.ends_with("apiKey") || k.ends_with("Key") || k.ends_with("Token") || k.ends_with("token") || k.ends_with("Secret") {
            let env_key = format!("OPENCLAW_SKILL_{}_{}", skill_id.to_uppercase().replace('-', "_"), k.to_uppercase());
            if let Some(val_str) = v.as_str() {
                let _ = file::set_env_value(&env_path, &env_key, val_str);
            }
        }
    }

    save_openclaw_config(&full_config)?;
    info!("[技能库] ✓ 技能 {} 配置已保存", skill_id);
    Ok(format!("技能 {} 配置已保存", skill_id))
}

/// 安装自定义技能（npm 包名 或 本地 zip/文件夹路径）
#[command]
pub async fn install_custom_skill(source: String, source_type: String) -> Result<String, String> {
    info!("[技能库] 安装自定义技能: {} (类型: {})", source, source_type);

    match source_type.as_str() {
        "npm" => {
            // npm 包名安装
            match shell::run_openclaw(&["plugins", "install", &source]) {
                Ok(output) => {
                    info!("[技能库] ✓ npm 安装成功: {}", output);
                    Ok(format!("自定义技能 {} 安装成功", source))
                }
                Err(e) => {
                    error!("[技能库] ✗ npm 安装失败: {}", e);
                    Err(format!("安装失败: {}", e))
                }
            }
        }
        "local" => {
            // 本地路径安装（zip 或文件夹）
            // OpenClaw 支持 openclaw plugins install /path/to/dir
            match shell::run_openclaw(&["plugins", "install", &source]) {
                Ok(output) => {
                    info!("[技能库] ✓ 本地安装成功: {}", output);
                    Ok(format!("自定义技能 {} 安装成功", source))
                }
                Err(e) => {
                    error!("[技能库] ✗ 本地安装失败: {}", e);
                    Err(format!("安装失败: {}", e))
                }
            }
        }
        _ => {
            Err(format!("不支持的安装类型: {}", source_type))
        }
    }
}

/// 更新技能在 plugins 配置中的状态（内部函数）
fn update_skill_plugin_config(skill_id: &str, add: bool) -> Result<(), String> {
    let mut config = load_openclaw_config()?;

    if config.get("plugins").is_none() {
        config["plugins"] = json!({ "allow": [], "entries": {} });
    }
    if config["plugins"].get("allow").is_none() {
        config["plugins"]["allow"] = json!([]);
    }
    if config["plugins"].get("entries").is_none() {
        config["plugins"]["entries"] = json!({});
    }

    if add {
        // 添加到 allow 和 entries
        if let Some(allow_arr) = config["plugins"]["allow"].as_array_mut() {
            let id_val = json!(skill_id);
            if !allow_arr.contains(&id_val) {
                allow_arr.push(id_val);
            }
        }
        config["plugins"]["entries"][skill_id] = json!({ "enabled": true });
    } else {
        // 从 allow 和 entries 移除
        if let Some(allow_arr) = config["plugins"]["allow"].as_array_mut() {
            allow_arr.retain(|v| v.as_str() != Some(skill_id));
        }
        if let Some(entries) = config["plugins"]["entries"].as_object_mut() {
            entries.remove(skill_id);
        }
    }

    save_openclaw_config(&config)?;
    Ok(())
}

// ============ Agent（虚拟员工）管理 ============

use crate::models::{AgentConfig, AgentBinding};

/// 从 openclaw.json 的 agents.list[] 解析单个 agent 为 AgentConfig
fn parse_agent_entry(entry: &Value, all_bindings: &[Value]) -> AgentConfig {
    let id = entry.get("id").and_then(|v| v.as_str()).unwrap_or("main").to_string();
    let is_default = entry.get("default").and_then(|v| v.as_bool()).unwrap_or(false);

    let identity = entry.get("identity").cloned().unwrap_or(json!({}));
    let name = identity.get("name").and_then(|v| v.as_str()).unwrap_or(&id).to_string();
    let emoji = identity.get("emoji").and_then(|v| v.as_str()).unwrap_or("🤖").to_string();
    let theme = identity.get("theme").and_then(|v| v.as_str()).map(|s| s.to_string());

    let workspace = entry.get("workspace").and_then(|v| v.as_str())
        .unwrap_or("~/.openclaw/workspace").to_string();
    let agent_dir = entry.get("agentDir").and_then(|v| v.as_str()).map(|s| s.to_string());

    let model = match entry.get("model") {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Object(obj)) => obj.get("primary").and_then(|v| v.as_str()).map(|s| s.to_string()),
        _ => None,
    };

    let sandbox = entry.get("sandbox").cloned().unwrap_or(json!({}));
    let sandbox_mode = sandbox.get("mode").and_then(|v| v.as_str()).unwrap_or("off").to_string();

    let tools = entry.get("tools").cloned().unwrap_or(json!({}));
    let tools_profile = tools.get("profile").and_then(|v| v.as_str()).map(|s| s.to_string());
    let tools_allow = tools.get("allow").and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    let tools_deny = tools.get("deny").and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let group_chat = entry.get("groupChat").cloned().unwrap_or(json!({}));
    let mention_patterns = group_chat.get("mentionPatterns").and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let subagents = entry.get("subagents").cloned().unwrap_or(json!({}));
    let subagent_allow = subagents.get("allowAgents").and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    // 从全局 bindings 中提取属于该 agent 的绑定
    let bindings: Vec<AgentBinding> = all_bindings.iter()
        .filter(|b| b.get("agentId").and_then(|v| v.as_str()) == Some(&id))
        .filter_map(|b| {
            let m = b.get("match")?;
            Some(AgentBinding {
                channel: m.get("channel").and_then(|v| v.as_str())?.to_string(),
                account_id: m.get("accountId").and_then(|v| v.as_str()).map(|s| s.to_string()),
            })
        })
        .collect();

    AgentConfig {
        id, name, emoji, theme, workspace, agent_dir, model, is_default,
        sandbox_mode, tools_profile, tools_allow, tools_deny, bindings,
        mention_patterns, subagent_allow,
    }
}

/// 将 AgentConfig 转换为 openclaw.json 的 agents.list[] 条目
fn agent_to_json(agent: &AgentConfig) -> Value {
    let mut entry = json!({
        "id": agent.id,
        "workspace": agent.workspace,
    });

    if agent.is_default {
        entry["default"] = json!(true);
    }

    // identity
    let mut identity = json!({ "name": agent.name, "emoji": agent.emoji });
    if let Some(ref theme) = agent.theme {
        identity["theme"] = json!(theme);
    }
    entry["identity"] = identity;

    if let Some(ref dir) = agent.agent_dir {
        entry["agentDir"] = json!(dir);
    }
    if let Some(ref model) = agent.model {
        entry["model"] = json!(model);
    }

    // sandbox
    if agent.sandbox_mode != "off" {
        entry["sandbox"] = json!({ "mode": agent.sandbox_mode });
    }

    // tools
    let has_tools = agent.tools_profile.is_some() || !agent.tools_allow.is_empty() || !agent.tools_deny.is_empty();
    if has_tools {
        let mut tools = json!({});
        if let Some(ref profile) = agent.tools_profile {
            tools["profile"] = json!(profile);
        }
        if !agent.tools_allow.is_empty() {
            tools["allow"] = json!(agent.tools_allow);
        }
        if !agent.tools_deny.is_empty() {
            tools["deny"] = json!(agent.tools_deny);
        }
        entry["tools"] = tools;
    }

    // groupChat
    if !agent.mention_patterns.is_empty() {
        entry["groupChat"] = json!({ "mentionPatterns": agent.mention_patterns });
    }

    // subagents
    if !agent.subagent_allow.is_empty() {
        entry["subagents"] = json!({ "allowAgents": agent.subagent_allow });
    }

    entry
}

/// 获取 Agent 列表
#[command]
pub async fn get_agents_list() -> Result<Vec<AgentConfig>, String> {
    info!("[Agent 管理] 获取 Agent 列表...");

    let config = load_openclaw_config()?;

    // 读取 agents.list 数组
    let agents_list = config.pointer("/agents/list")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // 读取顶层 bindings 数组
    let all_bindings = config.get("bindings")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut agents: Vec<AgentConfig> = agents_list.iter()
        .map(|entry| parse_agent_entry(entry, &all_bindings))
        .collect();

    // 如果没有任何 Agent，生成一个默认的 main Agent
    if agents.is_empty() {
        let default_workspace = config.pointer("/agents/defaults/workspace")
            .and_then(|v| v.as_str())
            .unwrap_or("~/.openclaw/workspace")
            .to_string();

        agents.push(AgentConfig {
            id: "main".into(),
            name: "Main Agent".into(),
            emoji: "🤖".into(),
            theme: Some("通用智能助手".into()),
            workspace: default_workspace,
            agent_dir: None,
            model: None,
            is_default: true,
            sandbox_mode: "off".into(),
            tools_profile: None,
            tools_allow: vec![],
            tools_deny: vec![],
            bindings: vec![],
            mention_patterns: vec![],
            subagent_allow: vec!["*".into()],
        });
    }

    // 确保至少有一个默认 Agent
    let has_default = agents.iter().any(|a| a.is_default);
    if !has_default {
        if let Some(first) = agents.first_mut() {
            first.is_default = true;
        }
    }

    info!("[Agent 管理] ✓ 返回 {} 个 Agent", agents.len());
    Ok(agents)
}

/// 保存 Agent（新增或更新）
#[command]
pub async fn save_agent(agent: AgentConfig) -> Result<String, String> {
    info!("[Agent 管理] 保存 Agent: {} ({})", agent.id, agent.name);

    let mut config = load_openclaw_config()?;

    // 确保 agents 和 agents.list 存在
    if config.get("agents").is_none() {
        config["agents"] = json!({ "defaults": {}, "list": [] });
    }
    if config["agents"].get("list").is_none() {
        config["agents"]["list"] = json!([]);
    }
    if config.get("bindings").is_none() {
        config["bindings"] = json!([]);
    }

    let agent_json = agent_to_json(&agent);

    // 更新或添加到 agents.list
    if let Some(list) = config["agents"]["list"].as_array_mut() {
        if let Some(pos) = list.iter().position(|a| a.get("id").and_then(|v| v.as_str()) == Some(&agent.id)) {
            list[pos] = agent_json;
        } else {
            list.push(agent_json);
        }
    }

    // 更新 bindings：先移除该 agent 的所有旧 binding，再添加新的
    if let Some(bindings_arr) = config["bindings"].as_array_mut() {
        bindings_arr.retain(|b| b.get("agentId").and_then(|v| v.as_str()) != Some(&agent.id));
        for binding in &agent.bindings {
            let mut match_obj = json!({ "channel": binding.channel });
            if let Some(ref acc) = binding.account_id {
                match_obj["accountId"] = json!(acc);
            }
            bindings_arr.push(json!({
                "agentId": agent.id,
                "match": match_obj,
            }));
        }
    }

    // 确保工作空间目录存在
    let workspace_path = agent.workspace.replace("~", &dirs::home_dir()
        .map(|h| h.display().to_string()).unwrap_or_default());
    let _ = std::fs::create_dir_all(&workspace_path);

    save_openclaw_config(&config)?;
    info!("[Agent 管理] ✓ Agent {} 已保存", agent.id);
    Ok(format!("Agent {} 已保存", agent.name))
}

/// 删除 Agent
#[command]
pub async fn delete_agent(agent_id: String) -> Result<String, String> {
    info!("[Agent 管理] 删除 Agent: {}", agent_id);

    if agent_id == "main" {
        return Err("无法删除主 Agent".into());
    }

    let mut config = load_openclaw_config()?;

    // 从 agents.list 移除
    if let Some(list) = config.pointer_mut("/agents/list").and_then(|v| v.as_array_mut()) {
        list.retain(|a| a.get("id").and_then(|v| v.as_str()) != Some(&agent_id));
    }

    // 从 bindings 移除
    if let Some(bindings) = config.get_mut("bindings").and_then(|v| v.as_array_mut()) {
        bindings.retain(|b| b.get("agentId").and_then(|v| v.as_str()) != Some(&agent_id));
    }

    save_openclaw_config(&config)?;
    info!("[Agent 管理] ✓ Agent {} 已删除", agent_id);
    Ok(format!("Agent {} 已删除", agent_id))
}

/// 设置默认 Agent
#[command]
pub async fn set_default_agent(agent_id: String) -> Result<String, String> {
    info!("[Agent 管理] 设置默认 Agent: {}", agent_id);

    let mut config = load_openclaw_config()?;

    if let Some(list) = config.pointer_mut("/agents/list").and_then(|v| v.as_array_mut()) {
        for entry in list.iter_mut() {
            let is_target = entry.get("id").and_then(|v| v.as_str()) == Some(&agent_id);
            if let Some(obj) = entry.as_object_mut() {
                if is_target {
                    obj.insert("default".into(), json!(true));
                } else {
                    obj.remove("default");
                }
            }
        }
    }

    save_openclaw_config(&config)?;
    info!("[Agent 管理] ✓ 默认 Agent 已设为 {}", agent_id);
    Ok(format!("默认 Agent 已设为 {}", agent_id))
}

