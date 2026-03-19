use crate::models::{
    AIConfigOverview, ChannelConfig, ConfiguredModel, ConfiguredProvider,
    ModelConfig, OfficialProvider, SuggestedModel, TuziConfigOverview, TuziGroup,
    TuziGroupConfig, TuziModelTemplate, TuziModelsResponse, TuziModelsSource,
};
use crate::utils::{file, platform, shell};
use log::{debug, error, info, warn};
use reqwest::Client;
use serde_json::{json, Value};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::command;

const TUZI_CLAUDE_PROVIDER_ID: &str = "tuzi-claude-code";
const TUZI_CODEX_PROVIDER_ID: &str = "tuzi-codex";
const TUZI_MODELS_API_URL: &str = "https://api.tu-zi.com/v1/models";

fn mask_api_key(value: Option<String>) -> Option<String> {
    value.map(|key| {
        if key.len() > 8 {
            format!("{}...{}", &key[..4], &key[key.len() - 4..])
        } else {
            "****".to_string()
        }
    })
}

fn tuzi_group_settings(group: &TuziGroup) -> (&'static str, &'static str, &'static str) {
    match group {
        TuziGroup::Codex => (
            TUZI_CODEX_PROVIDER_ID,
            "https://api.tu-zi.com/v1",
            "openai-responses",
        ),
        TuziGroup::ClaudeCode => (
            TUZI_CLAUDE_PROVIDER_ID,
            "https://api.tu-zi.com",
            "anthropic-messages",
        ),
    }
}

fn tuzi_group_keys(group: &TuziGroup) -> (&'static str, &'static str, &'static str) {
    match group {
        TuziGroup::Codex => (
            "TUZI_CODEX_API_KEY",
            "TUZI_CODEX_MODEL",
            "TUZI_CODEX_MODELS",
        ),
        TuziGroup::ClaudeCode => (
            "TUZI_CLAUDE_CODE_API_KEY",
            "TUZI_CLAUDE_CODE_MODEL",
            "TUZI_CLAUDE_CODE_MODELS",
        ),
    }
}

fn split_csv_models(value: Option<String>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
        .collect()
}

fn normalize_model_list(models: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for model in models {
        let trimmed = model.trim();
        if trimmed.is_empty() || normalized.iter().any(|item| item == trimmed) {
            continue;
        }
        normalized.push(trimmed.to_string());
    }
    normalized
}

fn get_tuzi_cache_dir() -> String {
    format!("{}/cache", platform::get_config_dir())
}

fn get_tuzi_cache_file(group: &TuziGroup) -> PathBuf {
    PathBuf::from(get_tuzi_cache_dir()).join(format!("tuzi-models-{}.json", group.as_str()))
}

fn extract_tuzi_error_message(payload: &Value) -> Option<String> {
    let message = payload
        .get("error")
        .and_then(|error| error.as_object())
        .and_then(|error| {
            error
                .get("message")
                .and_then(|value| value.as_str())
                .or_else(|| error.get("type").and_then(|value| value.as_str()))
        })
        .or_else(|| payload.get("message").and_then(|value| value.as_str()))
        .or_else(|| payload.get("detail").and_then(|value| value.as_str()))?;
    let trimmed = message.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn parse_tuzi_models_payload(payload: &Value) -> Result<Vec<String>, String> {
    let items = if let Some(data) = payload.get("data") {
        data
    } else {
        payload
    };

    let array = items
        .as_array()
        .ok_or_else(|| "模型列表解析失败".to_string())?;

    let models = normalize_model_list(array.iter().filter_map(|item| {
        item.get("id")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
    }));

    Ok(models)
}

fn write_tuzi_model_cache(group: &TuziGroup, models: &[String]) -> Result<(), String> {
    let cache_dir = get_tuzi_cache_dir();
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("创建 Tuzi 模型缓存目录失败: {}", e))?;

    let payload = json!({
        "group": group.as_str(),
        "fetched_at": chrono::Utc::now().to_rfc3339(),
        "models": models,
    });

    let cache_file = get_tuzi_cache_file(group);
    file::write_file(
        cache_file
            .to_str()
            .ok_or_else(|| "Tuzi 模型缓存路径无效".to_string())?,
        &serde_json::to_string_pretty(&payload).map_err(|e| format!("序列化 Tuzi 模型缓存失败: {}", e))?,
    )
    .map_err(|e| format!("写入 Tuzi 模型缓存失败: {}", e))
}

fn read_tuzi_model_cache(group: &TuziGroup) -> Result<(Vec<String>, Option<String>), String> {
    let cache_file = get_tuzi_cache_file(group);
    let cache_path = cache_file
        .to_str()
        .ok_or_else(|| "Tuzi 模型缓存路径无效".to_string())?;
    let raw = file::read_file(cache_path).map_err(|e| format!("读取 Tuzi 模型缓存失败: {}", e))?;
    let payload: Value =
        serde_json::from_str(&raw).map_err(|e| format!("解析 Tuzi 模型缓存失败: {}", e))?;
    let models = normalize_model_list(
        payload
            .get("models")
            .and_then(|value| value.as_array())
            .into_iter()
            .flatten()
            .filter_map(|item| item.as_str().map(|value| value.to_string())),
    );

    if models.is_empty() {
        return Err("Tuzi 模型缓存为空".to_string());
    }

    let timestamp = payload
        .get("fetched_at")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());

    Ok((models, timestamp))
}

fn ensure_config_file_parent_dirs() -> Result<(), String> {
    let config_dir = platform::get_config_dir();
    std::fs::create_dir_all(format!("{}/agents/main/sessions", config_dir))
        .map_err(|e| format!("创建 sessions 目录失败: {}", e))?;
    std::fs::create_dir_all(format!("{}/agents/main/agent", config_dir))
        .map_err(|e| format!("创建 agent 目录失败: {}", e))?;
    std::fs::create_dir_all(format!("{}/credentials", config_dir))
        .map_err(|e| format!("创建 credentials 目录失败: {}", e))?;
    Ok(())
}

fn rewrite_env_file(env_pairs: &[(String, String)]) -> Result<(), String> {
    let env_path = platform::get_env_file_path();
    let mut lines = vec![
        "# OpenClaw 环境变量配置".to_string(),
        format!(
            "# 由 OpenClaw Manager 自动生成: {}",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
        ),
    ];

    for (key, value) in env_pairs {
        let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
        lines.push(format!("export {}=\"{}\"", key, escaped));
    }

    file::write_file(&env_path, &lines.join("\n"))
        .map_err(|e| format!("写入 env 文件失败: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(&env_path)
            .map_err(|e| format!("读取 env 文件权限失败: {}", e))?;
        let mut perms = metadata.permissions();
        perms.set_mode(0o600);
        std::fs::set_permissions(&env_path, perms)
            .map_err(|e| format!("设置 env 文件权限失败: {}", e))?;
    }

    Ok(())
}

fn build_tuzi_group_config(group: TuziGroup) -> TuziGroupConfig {
    let env_path = platform::get_env_file_path();
    let (provider_id, base_url, api_type) = tuzi_group_settings(&group);
    let (api_key_key, model_key, models_key) = tuzi_group_keys(&group);
    let api_key = file::read_env_value(&env_path, api_key_key);
    let primary_model = file::read_env_value(&env_path, model_key);
    let mut models = split_csv_models(file::read_env_value(&env_path, models_key));
    if models.is_empty() {
        if let Some(model) = &primary_model {
            models.push(model.clone());
        }
    }

    TuziGroupConfig {
        group,
        configured: api_key.is_some() && primary_model.is_some(),
        provider_id: provider_id.to_string(),
        base_url: base_url.to_string(),
        api_type: api_type.to_string(),
        api_key_masked: mask_api_key(api_key),
        primary_model,
        models,
    }
}

fn sync_tuzi_provider_in_config(
    config: &mut Value,
    group: &TuziGroup,
    api_key: &str,
    models: &[String],
    update_default: bool,
) -> Result<(), String> {
    if models.is_empty() {
        return Err("至少选择一个模型".to_string());
    }

    let (provider_id, base_url, api_type) = tuzi_group_settings(group);
    let primary_model = models[0].clone();

    if config.get("auth").is_none() {
        config["auth"] = json!({});
    }
    if config["auth"].get("profiles").is_none() {
        config["auth"]["profiles"] = json!({});
    }
    config["auth"]["profiles"][format!("{}:default", provider_id)] = json!({
        "provider": provider_id,
        "mode": "api_key",
    });

    if config.get("models").is_none() {
        config["models"] = json!({});
    }
    if config["models"].get("providers").is_none() {
        config["models"]["providers"] = json!({});
    }

    let provider_models: Vec<Value> = models
        .iter()
        .map(|model_id| {
            json!({
                "id": model_id,
                "name": model_id,
                "api": api_type,
                "reasoning": false,
                "input": ["text"],
                "cost": {
                    "input": 0,
                    "output": 0,
                    "cacheRead": 0,
                    "cacheWrite": 0
                },
                "contextWindow": 200000,
                "maxTokens": if provider_id == TUZI_CODEX_PROVIDER_ID { 100000 } else { 8192 }
            })
        })
        .collect();

    config["models"]["providers"][provider_id] = json!({
        "baseUrl": base_url,
        "apiKey": api_key,
        "api": api_type,
        "models": provider_models
    });

    if config.get("agents").is_none() {
        config["agents"] = json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = json!({});
    }
    if config["agents"]["defaults"].get("models").is_none() {
        config["agents"]["defaults"]["models"] = json!({});
    }

    for model_id in models {
        config["agents"]["defaults"]["models"][format!("{}/{}", provider_id, model_id)] = json!({});
    }

    if update_default {
        if config["agents"]["defaults"].get("model").is_none() {
            config["agents"]["defaults"]["model"] = json!({});
        }
        config["agents"]["defaults"]["model"] = json!({
            "primary": format!("{}/{}", provider_id, primary_model),
            "fallbacks": models
                .iter()
                .skip(1)
                .map(|model_id| format!("{}/{}", provider_id, model_id))
                .collect::<Vec<String>>(),
        });
    }

    Ok(())
}

fn build_tuzi_env_pairs(
    groups: &[TuziGroupConfig],
    api_key_overrides: &HashMap<String, String>,
) -> Vec<(String, String)> {
    let env_path = platform::get_env_file_path();
    let mut env_pairs = Vec::new();

    for group_cfg in groups {
        if !group_cfg.configured {
            continue;
        }

        let (api_key_key, model_key, models_key) = tuzi_group_keys(&group_cfg.group);
        let stored_api_key = api_key_overrides
            .get(group_cfg.group.as_str())
            .cloned()
            .unwrap_or_else(|| file::read_env_value(&env_path, api_key_key).unwrap_or_default());
        if !stored_api_key.is_empty() {
            env_pairs.push((api_key_key.to_string(), stored_api_key.clone()));
        }
        if let Some(primary_model) = &group_cfg.primary_model {
            env_pairs.push((model_key.to_string(), primary_model.clone()));
        }
        if !group_cfg.models.is_empty() {
            env_pairs.push((models_key.to_string(), group_cfg.models.join(",")));
        }
    }

    env_pairs
}

fn split_model_id(full_model_id: &str) -> Result<(String, String), String> {
    let mut parts = full_model_id.splitn(2, '/');
    let provider_id = parts
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "无效的模型 ID".to_string())?;
    let model_id = parts
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "无效的模型 ID".to_string())?;

    Ok((provider_id.to_string(), model_id.to_string()))
}

fn update_tuzi_env_for_primary_model(
    model_id: &str,
) -> Result<(), String> {
    let (provider_id, short_model_id) = split_model_id(model_id)?;
    let group = match provider_id.as_str() {
        TUZI_CLAUDE_PROVIDER_ID => TuziGroup::ClaudeCode,
        TUZI_CODEX_PROVIDER_ID => TuziGroup::Codex,
        _ => return Ok(()),
    };

    let overview_groups = vec![
        build_tuzi_group_config(TuziGroup::ClaudeCode),
        build_tuzi_group_config(TuziGroup::Codex),
    ];
    let target = overview_groups
        .iter()
        .find(|item| item.group == group && item.configured)
        .cloned()
        .ok_or_else(|| "目标 Tuzi 分组尚未配置".to_string())?;

    let mut reordered_models = target.models.clone();
    if let Some(index) = reordered_models.iter().position(|item| item == &short_model_id) {
        let primary = reordered_models.remove(index);
        reordered_models.insert(0, primary);
    } else {
        reordered_models.insert(0, short_model_id.clone());
    }

    let updated_groups = overview_groups
        .into_iter()
        .map(|mut group_cfg| {
            if group_cfg.group == group {
                group_cfg.primary_model = Some(short_model_id.clone());
                group_cfg.models = reordered_models.clone();
            }
            group_cfg
        })
        .collect::<Vec<_>>();

    let env_pairs = build_tuzi_env_pairs(&updated_groups, &HashMap::new());
    if env_pairs.is_empty() {
        return Err("无法生成 Tuzi 环境变量".to_string());
    }

    rewrite_env_file(&env_pairs)?;

    Ok(())
}

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

fn collect_provider_model_ids(config: &Value) -> Vec<String> {
    config
        .pointer("/models/providers")
        .and_then(|value| value.as_object())
        .map(|providers| {
            providers
                .iter()
                .flat_map(|(provider_id, provider_config)| {
                    provider_config
                        .get("models")
                        .and_then(|value| value.as_array())
                        .into_iter()
                        .flatten()
                        .filter_map(move |model| {
                            model
                                .get("id")
                                .and_then(|value| value.as_str())
                                .map(str::trim)
                                .filter(|value| !value.is_empty())
                                .map(|model_id| format!("{}/{}", provider_id, model_id))
                        })
                })
                .collect::<Vec<String>>()
        })
        .map(normalize_model_list)
        .unwrap_or_default()
}

fn build_available_models_from_config(config: &Value) -> Vec<String> {
    let registry_models = config
        .pointer("/agents/defaults/models")
        .and_then(|value| value.as_object())
        .map(|models| models.keys().cloned().collect::<Vec<String>>())
        .map(normalize_model_list)
        .unwrap_or_default();
    let primary = config
        .pointer("/agents/defaults/model/primary")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    let fallbacks = config
        .pointer("/agents/defaults/model/fallbacks")
        .and_then(|value| value.as_array())
        .map(|items| {
            normalize_model_list(
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(|value| value.to_string()))
                    .collect::<Vec<String>>(),
            )
        })
        .unwrap_or_default();

    let mut ordered = Vec::new();
    if let Some(primary_model) = primary.filter(|value| registry_models.iter().any(|item| item == value)) {
        ordered.push(primary_model);
    }
    ordered.extend(fallbacks);
    for model_id in registry_models {
        if !ordered.iter().any(|item| item == &model_id) {
            ordered.push(model_id);
        }
    }

    ordered
}

fn rebuild_model_registry_and_fallbacks(config: &mut Value) -> Result<bool, String> {
    if config.get("agents").is_none() {
        config["agents"] = json!({});
    }
    if config["agents"].get("defaults").is_none() {
        config["agents"]["defaults"] = json!({});
    }
    if config["agents"]["defaults"].get("model").is_none() {
        config["agents"]["defaults"]["model"] = json!({});
    }

    let all_models = collect_provider_model_ids(config);

    let current_registry = config
        .pointer("/agents/defaults/models")
        .and_then(|value| value.as_object())
        .map(|models| models.keys().cloned().collect::<Vec<String>>())
        .map(normalize_model_list)
        .unwrap_or_default();

    let current_primary = config
        .pointer("/agents/defaults/model/primary")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    let current_fallbacks = config
        .pointer("/agents/defaults/model/fallbacks")
        .and_then(|value| value.as_array())
        .map(|items| {
            normalize_model_list(
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(|value| value.to_string()))
                    .collect::<Vec<String>>(),
            )
        })
        .unwrap_or_default();

    let mut registry_object = serde_json::Map::new();
    for model_id in &all_models {
        registry_object.insert(model_id.clone(), json!({}));
    }
    config["agents"]["defaults"]["models"] = Value::Object(registry_object);

    let next_fallbacks = if let Some(primary) = current_primary.as_deref() {
        let mut ordered = Vec::new();
        let mut parts = primary.splitn(2, '/');
        let primary_provider = parts.next().unwrap_or_default();

        if !primary_provider.is_empty() {
            for model_id in &all_models {
                if model_id == primary {
                    continue;
                }
                if model_id.starts_with(&format!("{}/", primary_provider)) {
                    ordered.push(model_id.clone());
                }
            }
            for model_id in &all_models {
                if model_id == primary {
                    continue;
                }
                if !model_id.starts_with(&format!("{}/", primary_provider)) {
                    ordered.push(model_id.clone());
                }
            }
        } else {
            ordered.extend(all_models.iter().filter(|model_id| model_id.as_str() != primary).cloned());
        }

        if !all_models.iter().any(|model_id| model_id == primary) {
            warn!(
                "[AI 配置] 当前主模型 {} 不在已配置 provider 模型列表中，fallback 将退化为全量平铺",
                primary
            );
            all_models
                .iter()
                .filter(|model_id| model_id.as_str() != primary)
                .cloned()
                .collect::<Vec<String>>()
        } else {
            ordered
        }
    } else {
        Vec::new()
    };

    config["agents"]["defaults"]["model"]["fallbacks"] = json!(next_fallbacks);

    Ok(current_registry != all_models || current_fallbacks != next_fallbacks)
}

pub fn sync_model_registry_on_startup() -> Result<(), String> {
    let config_path = platform::get_config_file_path();
    if !file::file_exists(&config_path) {
        return Ok(());
    }

    let mut config = load_openclaw_config()?;
    if rebuild_model_registry_and_fallbacks(&mut config)? {
        save_openclaw_config(&config)?;
        info!("[AI 配置] 启动时已同步模型 registry 与 fallbacks");
    } else {
        info!("[AI 配置] 启动时模型 registry 与 fallbacks 已是最新");
    }

    Ok(())
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
            source: Some("official".to_string()),
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
            source: Some("official".to_string()),
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
            source: Some("official".to_string()),
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
            source: Some("official".to_string()),
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
            source: Some("official".to_string()),
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
            source: Some("official".to_string()),
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
            source: Some("official".to_string()),
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
            source: Some("official".to_string()),
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
            source: Some("official".to_string()),
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
            source: Some("official".to_string()),
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

#[command]
pub async fn fetch_tuzi_models(
    group: TuziGroup,
    api_key: String,
) -> Result<TuziModelsResponse, String> {
    let trimmed_api_key = api_key.trim();
    if trimmed_api_key.is_empty() {
        return Err("API Key 不能为空".to_string());
    }

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("初始化 Tuzi 模型请求失败: {}", e))?;

    let fetch_error = match client
        .get(TUZI_MODELS_API_URL)
        .bearer_auth(trimmed_api_key)
        .send()
        .await
    {
        Ok(response) => {
            let status = response.status();
            let body = response
                .text()
                .await
                .map_err(|e| format!("读取 Tuzi 模型响应失败: {}", e))?;

            if status.is_success() {
                let payload: Value = serde_json::from_str(&body)
                    .map_err(|e| format!("解析 Tuzi 模型响应失败: {}", e))?;
                let models = parse_tuzi_models_payload(&payload)?;
                if models.is_empty() {
                    "接口返回成功，但当前 Key 没有可见模型".to_string()
                } else {
                    if let Err(error) = write_tuzi_model_cache(&group, &models) {
                        warn!("[Tuzi] 写入模型缓存失败: {}", error);
                    }
                    return Ok(TuziModelsResponse {
                        models,
                        source: TuziModelsSource::Api,
                        cache_timestamp: None,
                        warning: None,
                    });
                }
            } else {
                let payload = serde_json::from_str::<Value>(&body).ok();
                let error_message = payload
                    .as_ref()
                    .and_then(extract_tuzi_error_message)
                    .map(|message| format!(": {}", message))
                    .unwrap_or_default();
                format!("接口返回 HTTP {}{}", status.as_u16(), error_message)
            }
        }
        Err(error) => {
            format!("请求模型列表失败: {}", error)
        }
    };

    match read_tuzi_model_cache(&group) {
        Ok((models, cache_timestamp)) => Ok(TuziModelsResponse {
            models,
            source: TuziModelsSource::Cache,
            cache_timestamp,
            warning: Some(fetch_error),
        }),
        Err(_) => Err(fetch_error),
    }
}

#[command]
pub async fn get_tuzi_templates() -> Result<Vec<TuziModelTemplate>, String> {
    Ok(vec![
        TuziModelTemplate {
            group: TuziGroup::ClaudeCode,
            provider_id: TUZI_CLAUDE_PROVIDER_ID.to_string(),
            name: "Tuzi Claude-Code".to_string(),
            default_base_url: "https://api.tu-zi.com".to_string(),
            api_type: "anthropic-messages".to_string(),
            suggested_models: Vec::<SuggestedModel>::new(),
        },
        TuziModelTemplate {
            group: TuziGroup::Codex,
            provider_id: TUZI_CODEX_PROVIDER_ID.to_string(),
            name: "Tuzi Codex".to_string(),
            default_base_url: "https://api.tu-zi.com/v1".to_string(),
            api_type: "openai-responses".to_string(),
            suggested_models: Vec::<SuggestedModel>::new(),
        },
    ])
}

#[command]
pub async fn get_tuzi_config() -> Result<TuziConfigOverview, String> {
    let groups = vec![
        build_tuzi_group_config(TuziGroup::ClaudeCode),
        build_tuzi_group_config(TuziGroup::Codex),
    ];
    let configured = groups.iter().any(|group| group.configured);

    Ok(TuziConfigOverview {
        configured,
        groups,
    })
}

#[command]
pub async fn save_tuzi_config(
    group: TuziGroup,
    api_key: String,
    models: Vec<String>,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("API Key 不能为空".to_string());
    }
    if models.is_empty() {
        return Err("至少选择一个模型".to_string());
    }

    ensure_config_file_parent_dirs()?;

    let mut config = load_openclaw_config()?;
    let current_primary = config
        .pointer("/agents/defaults/model/primary")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string());
    let target_provider_id = tuzi_group_settings(&group).0.to_string();
    let should_update_default = match current_primary.as_deref() {
        None | Some("") => true,
        Some(primary) => primary.starts_with(&format!("{}/", target_provider_id)),
    };
    sync_tuzi_provider_in_config(&mut config, &group, api_key.trim(), &models, should_update_default)?;
    rebuild_model_registry_and_fallbacks(&mut config)?;
    save_openclaw_config(&config)?;

    let primary_model = models[0].clone();
    let current = get_tuzi_config().await?;
    let updated_groups = current
        .groups
        .iter()
        .map(|group_cfg| {
            if group_cfg.group == group {
                let mut updated = group_cfg.clone();
                updated.configured = true;
                updated.api_key_masked = mask_api_key(Some(api_key.trim().to_string()));
                updated.primary_model = Some(primary_model.clone());
                updated.models = models.clone();
                updated
            } else {
                group_cfg.clone()
            }
        })
        .collect::<Vec<_>>();
    let mut api_key_overrides = HashMap::new();
    api_key_overrides.insert(group.as_str().to_string(), api_key.trim().to_string());
    let env_pairs = build_tuzi_env_pairs(&updated_groups, &api_key_overrides);
    rewrite_env_file(&env_pairs)?;

    Ok(format!("Tuzi {} 配置已保存", group.as_str()))
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
    let available_models = build_available_models_from_config(&config);
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

            let api_key_masked = mask_api_key(api_key.clone());

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

    rebuild_model_registry_and_fallbacks(&mut config)?;
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

    rebuild_model_registry_and_fallbacks(&mut config)?;
    save_openclaw_config(&config)?;
    info!("[删除 Provider] ✓ Provider {} 已删除", provider_name);

    Ok(format!("Provider {} 已删除", provider_name))
}

/// 设置主模型
#[command]
pub async fn set_primary_model(model_id: String) -> Result<String, String> {
    info!("[设置主模型] 设置主模型: {}", model_id);

    let mut config = load_openclaw_config()?;
    let (provider_id, short_model_id) = split_model_id(&model_id)?;

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
    rebuild_model_registry_and_fallbacks(&mut config)?;

    save_openclaw_config(&config)?;
    update_tuzi_env_for_primary_model(&format!("{}/{}", provider_id, short_model_id))?;
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

        if channel_id == "discord" {
            if !config_map.contains_key("botToken") {
                if let Some(token) = config_map.get("token").cloned() {
                    config_map.insert("botToken".to_string(), token);
                }
            }
        }
        
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
            if channel.id == "discord" && key == "botToken" {
                channel_obj["botToken"] = value.clone();
                channel_obj["token"] = value.clone();
            } else {
                channel_obj[key] = value.clone();
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_tuzi_models_payload_filters_empty_and_duplicates() {
        let payload = json!({
            "data": [
                { "id": "gpt-5.4" },
                { "id": "gpt-5.4" },
                { "id": " claude-sonnet-4-6 " },
                { "name": "missing-id" },
                { "id": "" }
            ]
        });

        let models = parse_tuzi_models_payload(&payload).expect("should parse");
        assert_eq!(models, vec!["gpt-5.4".to_string(), "claude-sonnet-4-6".to_string()]);
    }

    #[test]
    fn extract_tuzi_error_message_reads_nested_error_message() {
        let payload = json!({
            "error": {
                "message": "invalid api key"
            }
        });

        assert_eq!(
            extract_tuzi_error_message(&payload),
            Some("invalid api key".to_string())
        );
    }

    #[test]
    fn tuzi_model_cache_roundtrip_works() {
        let temp_home = std::env::temp_dir().join(format!(
            "openclaw-manager-tests-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("valid time")
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_home).expect("create temp home");

        let previous_home = std::env::var("HOME").ok();
        std::env::set_var("HOME", &temp_home);

        let models = vec!["gpt-5.4".to_string(), "gpt-5.3-codex".to_string()];
        write_tuzi_model_cache(&TuziGroup::Codex, &models).expect("write cache");
        let (cached_models, timestamp) = read_tuzi_model_cache(&TuziGroup::Codex).expect("read cache");

        assert_eq!(cached_models, models);
        assert!(timestamp.is_some());

        if let Some(home) = previous_home {
            std::env::set_var("HOME", home);
        } else {
            std::env::remove_var("HOME");
        }
        let _ = std::fs::remove_dir_all(temp_home);
    }

    #[test]
    fn rebuild_model_registry_and_fallbacks_collects_all_provider_models() {
        let mut config = json!({
            "models": {
                "providers": {
                    "openai": {
                        "models": [
                            { "id": "gpt-5" },
                            { "id": "gpt-4.1" }
                        ]
                    },
                    "anthropic": {
                        "models": [
                            { "id": "claude-sonnet-4-5" }
                        ]
                    }
                }
            },
            "agents": {
                "defaults": {
                    "model": {
                        "primary": "openai/gpt-5"
                    }
                }
            }
        });

        let changed = rebuild_model_registry_and_fallbacks(&mut config).expect("rebuild should succeed");
        assert!(changed);
        assert_eq!(
            build_available_models_from_config(&config),
            vec![
                "openai/gpt-5".to_string(),
                "openai/gpt-4.1".to_string(),
                "anthropic/claude-sonnet-4-5".to_string()
            ]
        );
        assert_eq!(
            config["agents"]["defaults"]["model"]["fallbacks"],
            json!(["openai/gpt-4.1", "anthropic/claude-sonnet-4-5"])
        );
    }

    #[test]
    fn rebuild_model_registry_and_fallbacks_handles_missing_primary() {
        let mut config = json!({
            "models": {
                "providers": {
                    "openai": {
                        "models": [
                            { "id": "gpt-5" }
                        ]
                    },
                    "anthropic": {
                        "models": [
                            { "id": "claude-sonnet-4-5" }
                        ]
                    }
                }
            },
            "agents": {
                "defaults": {
                    "model": {
                        "primary": "missing/provider"
                    }
                }
            }
        });

        rebuild_model_registry_and_fallbacks(&mut config).expect("rebuild should succeed");
        assert_eq!(
            config["agents"]["defaults"]["model"]["fallbacks"],
            json!(["anthropic/claude-sonnet-4-5", "openai/gpt-5"])
        );
        assert_eq!(
            build_available_models_from_config(&config),
            vec![
                "anthropic/claude-sonnet-4-5".to_string(),
                "openai/gpt-5".to_string()
            ]
        );
    }
}
