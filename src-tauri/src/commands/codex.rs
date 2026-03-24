use crate::utils::{file, platform, shell};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use tauri::command;

const CODEX_OPENAI_PACKAGE: &str = "@openai/codex";
const CODEX_GAC_INSTALL_URL: &str = "https://gaccode.com/codex/install";
const CODEX_REFERENCE_SCRIPT_PATH: &str = "/Users/shuidiyu06/tu/sh.tu-zi.com/sh/setup_codex/install_codex.sh";
const DEFAULT_MODEL: &str = "gpt-5.4";
const DEFAULT_REASONING: &str = "medium";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexModelSettings {
    pub model: String,
    pub model_reasoning_effort: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexRoute {
    pub name: String,
    pub base_url: Option<String>,
    pub has_key: bool,
    pub is_current: bool,
    pub api_key_masked: Option<String>,
    pub model_settings: CodexModelSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexEnvSummary {
    pub codex_api_key_masked: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub install_type: Option<String>,
    pub current_route: Option<String>,
    pub state_file_exists: bool,
    pub config_file_exists: bool,
    pub routes: Vec<CodexRoute>,
    pub env_summary: CodexEnvSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexReferenceDocs {
    pub script_markdown: String,
    pub updated_at: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexActionResult {
    pub success: bool,
    pub message: String,
    pub error: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub restart_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexRoutesResponse {
    pub current_route: Option<String>,
    pub routes: Vec<CodexRoute>,
}

#[derive(Debug, Clone)]
struct InstallState {
    install_type: Option<String>,
    route: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct ConfigRouteEntry {
    base_url: Option<String>,
    model: Option<String>,
    model_reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct ParsedCodexConfig {
    profile: Option<String>,
    routes: BTreeMap<String, ConfigRouteEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConfigSection {
    None,
    ModelProvider,
    Profile,
}

fn success_result(message: &str, stdout: String, restart_required: bool) -> CodexActionResult {
    CodexActionResult {
        success: true,
        message: message.to_string(),
        error: None,
        stdout,
        stderr: String::new(),
        restart_required,
    }
}

fn error_result(message: &str, error: String, stdout: String) -> CodexActionResult {
    CodexActionResult {
        success: false,
        message: message.to_string(),
        error: Some(error.clone()),
        stdout,
        stderr: error,
        restart_required: false,
    }
}

fn get_codex_dir() -> String {
    if let Some(home) = dirs::home_dir() {
        if platform::is_windows() {
            format!("{}\\.codex", home.display())
        } else {
            format!("{}/.codex", home.display())
        }
    } else if platform::is_windows() {
        "%USERPROFILE%\\.codex".to_string()
    } else {
        "~/.codex".to_string()
    }
}

fn get_codex_config_file_path() -> String {
    if platform::is_windows() {
        format!("{}\\config.toml", get_codex_dir())
    } else {
        format!("{}/config.toml", get_codex_dir())
    }
}

fn get_codex_state_file_path() -> String {
    if platform::is_windows() {
        format!("{}\\install_state", get_codex_dir())
    } else {
        format!("{}/install_state", get_codex_dir())
    }
}

fn normalize_install_type(value: &str) -> Option<String> {
    let lower = value.trim().to_lowercase();
    match lower.as_str() {
        "openai" | "gac" => Some(lower),
        _ => None,
    }
}

fn normalize_route(value: &str) -> Option<String> {
    let lower = value.trim().to_lowercase();
    match lower.as_str() {
        "gac" | "tuzi" => Some(lower),
        "none" | "" => None,
        _ => None,
    }
}

fn route_base_url(route: &str) -> Option<&'static str> {
    match route {
        "gac" => Some("https://gaccode.com/codex/v1"),
        "tuzi" => Some("https://api.tu-zi.com/v1"),
        _ => None,
    }
}

fn mask_key(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    if value.len() <= 8 {
        return "****".to_string();
    }
    let head = &value[0..4];
    let tail = &value[value.len() - 4..];
    format!("{}****{}", head, tail)
}

fn parse_install_state(content: &str) -> InstallState {
    let mut install_type: Option<String> = None;
    let mut route: Option<String> = None;

    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if let Some(value) = line.strip_prefix("INSTALL_TYPE=") {
            install_type = normalize_install_type(value);
            continue;
        }

        if let Some(value) = line.strip_prefix("ROUTE=") {
            route = normalize_route(value);
        }
    }

    InstallState { install_type, route }
}

fn load_install_state() -> InstallState {
    let path = get_codex_state_file_path();
    let content = file::read_file(&path).unwrap_or_default();
    parse_install_state(&content)
}

fn save_install_state(install_type: &str, route: Option<&str>) -> Result<(), String> {
    let install_type = normalize_install_type(install_type)
        .ok_or_else(|| format!("非法安装类型: {}", install_type))?;
    let route_value = route
        .and_then(normalize_route)
        .unwrap_or_else(|| "none".to_string());

    let content = format!(
        "INSTALL_TYPE={}\nROUTE={}\nMANAGED_BY=sh.tu-zi.com\n",
        install_type, route_value
    );

    file::write_file(&get_codex_state_file_path(), &content)
        .map_err(|e| format!("写入安装状态失败: {}", e))
}

fn clear_install_state() {
    let path = get_codex_state_file_path();
    if Path::new(&path).exists() {
        let _ = std::fs::remove_file(path);
    }
}

fn parse_codex_config(content: &str) -> ParsedCodexConfig {
    let mut parsed = ParsedCodexConfig::default();
    let mut section = ConfigSection::None;
    let mut section_route: Option<String> = None;

    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if line.starts_with('[') && line.ends_with(']') {
            section = ConfigSection::None;
            section_route = None;

            let section_name = line.trim_start_matches('[').trim_end_matches(']');
            if let Some(route) = section_name.strip_prefix("model_providers.") {
                if let Some(valid_route) = normalize_route(route) {
                    section = ConfigSection::ModelProvider;
                    section_route = Some(valid_route.clone());
                    parsed.routes.entry(valid_route).or_default();
                }
            } else if let Some(route) = section_name.strip_prefix("profiles.") {
                if let Some(valid_route) = normalize_route(route) {
                    section = ConfigSection::Profile;
                    section_route = Some(valid_route.clone());
                    parsed.routes.entry(valid_route).or_default();
                }
            }
            continue;
        }

        if let Some((key, value_raw)) = line.split_once('=') {
            let key = key.trim();
            let value = value_raw.trim().trim_matches('"').to_string();

            if key == "profile" {
                parsed.profile = normalize_route(&value);
                continue;
            }

            let Some(route) = &section_route else {
                continue;
            };

            let entry = parsed.routes.entry(route.clone()).or_default();
            match section {
                ConfigSection::ModelProvider => {
                    if key == "base_url" && !value.is_empty() {
                        entry.base_url = Some(value);
                    }
                }
                ConfigSection::Profile => {
                    if key == "model" && !value.is_empty() {
                        entry.model = Some(value);
                    } else if key == "model_reasoning_effort" && !value.is_empty() {
                        entry.model_reasoning_effort = Some(value);
                    }
                }
                ConfigSection::None => {}
            }
        }
    }

    parsed
}

fn filter_codex_config(existing_content: &str) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut skipping_codex_sections = false;

    for raw in existing_content.lines() {
        let trimmed = raw.trim();

        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            let section = trimmed.trim_start_matches('[').trim_end_matches(']');
            let should_skip = matches!(
                section,
                "model_providers.gac"
                    | "model_providers.tuzi"
                    | "profiles.gac"
                    | "profiles.tuzi"
            );
            skipping_codex_sections = should_skip;
            if should_skip {
                continue;
            }
        }

        if skipping_codex_sections {
            continue;
        }

        if trimmed.starts_with("profile") && trimmed.contains('=') {
            continue;
        }

        lines.push(raw.to_string());
    }

    lines.join("\n").trim().to_string()
}

fn write_codex_config(route: &str, model: &str, model_reasoning_effort: &str) -> Result<(), String> {
    let base_url = route_base_url(route).ok_or_else(|| format!("未知 route: {}", route))?;
    let config_path = get_codex_config_file_path();
    let existing = file::read_file(&config_path).unwrap_or_default();
    let filtered = filter_codex_config(&existing);

    let mut output = format!("profile = \"{}\"\n\n", route);
    if !filtered.is_empty() {
        output.push_str(filtered.as_str());
        output.push_str("\n\n");
    }

    output.push_str(format!(
        "[model_providers.{route}]\nname = \"{route}\"\nbase_url = \"{base_url}\"\nwire_api = \"responses\"\nenv_key = \"CODEX_API_KEY\"\n\n[profiles.{route}]\nmodel_provider = \"{route}\"\nmodel = \"{model}\"\nmodel_reasoning_effort = \"{reasoning}\"\napproval_policy = \"on-request\"\n",
        route = route,
        base_url = base_url,
        model = model,
        reasoning = model_reasoning_effort,
    ).as_str());

    file::write_file(&config_path, &output).map_err(|e| format!("写入 config.toml 失败: {}", e))
}

fn get_shell_rc_candidates() -> Vec<String> {
    if platform::is_windows() {
        return Vec::new();
    }

    let mut paths = Vec::new();
    if let Some(home) = dirs::home_dir() {
        paths.push(format!("{}/.zshrc", home.display()));
        paths.push(format!("{}/.bashrc", home.display()));
    }
    paths
}

fn apply_env_to_rc(api_key: &str) -> Result<Vec<String>, String> {
    if platform::is_windows() {
        return Ok(Vec::new());
    }

    let rc_paths = get_shell_rc_candidates();
    if rc_paths.is_empty() {
        return Err("无法定位 shell 配置文件".to_string());
    }

    let mut updated = Vec::new();
    for rc_path in rc_paths {
        let content = file::read_file(&rc_path).unwrap_or_default();
        let filtered_lines: Vec<String> = content
            .lines()
            .filter(|line| {
                let trimmed = line.trim_start();
                !trimmed.starts_with("export CODEX_API_KEY=")
            })
            .map(|line| line.to_string())
            .collect();

        let mut lines = filtered_lines;
        lines.push(format!("export CODEX_API_KEY=\"{}\"", api_key));

        file::write_file(&rc_path, &lines.join("\n"))
            .map_err(|e| format!("写入 {} 失败: {}", rc_path, e))?;
        updated.push(rc_path);
    }

    Ok(updated)
}

fn clear_env_in_rc() -> Result<Vec<String>, String> {
    if platform::is_windows() {
        return Ok(Vec::new());
    }

    let rc_paths = get_shell_rc_candidates();
    if rc_paths.is_empty() {
        return Err("无法定位 shell 配置文件".to_string());
    }

    let mut updated = Vec::new();
    for rc_path in rc_paths {
        let content = file::read_file(&rc_path).unwrap_or_default();
        let filtered_lines: Vec<String> = content
            .lines()
            .filter(|line| {
                let trimmed = line.trim_start();
                !trimmed.starts_with("export CODEX_API_KEY=")
            })
            .map(|line| line.to_string())
            .collect();

        file::write_file(&rc_path, &filtered_lines.join("\n"))
            .map_err(|e| format!("清理 {} 中的 CODEX_API_KEY 失败: {}", rc_path, e))?;
        updated.push(rc_path);
    }

    Ok(updated)
}

fn run_npm_global(command: &str) -> Result<String, String> {
    shell::run_script_output(command)
}

fn resolve_model_settings(
    model: Option<String>,
    model_reasoning_effort: Option<String>,
    fallback_model: Option<&str>,
    fallback_reasoning: Option<&str>,
) -> CodexModelSettings {
    let final_model = model
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| fallback_model.map(|v| v.to_string()))
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());

    let final_reasoning = model_reasoning_effort
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| fallback_reasoning.map(|v| v.to_string()))
        .unwrap_or_else(|| DEFAULT_REASONING.to_string());

    CodexModelSettings {
        model: final_model,
        model_reasoning_effort: final_reasoning,
    }
}

fn configure_openai_route(
    route: &str,
    api_key: &str,
    model: Option<String>,
    model_reasoning_effort: Option<String>,
) -> Result<Vec<String>, String> {
    let normalized_route = normalize_route(route)
        .ok_or_else(|| format!("非法路线: {}（仅支持 gac / tuzi）", route))?;
    if api_key.trim().is_empty() {
        return Err("切换路线需要提供 API Key".to_string());
    }

    let current_config = parse_codex_config(&file::read_file(&get_codex_config_file_path()).unwrap_or_default());
    let existing_entry = current_config.routes.get(&normalized_route);
    let settings = resolve_model_settings(
        model,
        model_reasoning_effort,
        existing_entry.and_then(|v| v.model.as_deref()),
        existing_entry.and_then(|v| v.model_reasoning_effort.as_deref()),
    );

    write_codex_config(
        &normalized_route,
        &settings.model,
        &settings.model_reasoning_effort,
    )?;
    let rc_paths = apply_env_to_rc(api_key.trim())?;
    save_install_state("openai", Some(&normalized_route))?;

    let mut logs = vec![
        format!("已写入配置: {}", get_codex_config_file_path()),
        format!("已写入状态: {}", get_codex_state_file_path()),
        format!(
            "路线={} model={} reasoning={}",
            normalized_route, settings.model, settings.model_reasoning_effort
        ),
    ];
    for path in rc_paths {
        logs.push(format!("已更新环境变量: {}", path));
    }

    Ok(logs)
}

fn derive_current_route(state: &InstallState, config: &ParsedCodexConfig) -> Option<String> {
    if let Some(route) = &state.route {
        return Some(route.clone());
    }
    config.profile.clone()
}

fn build_routes(
    current_route: Option<&str>,
    config: &ParsedCodexConfig,
    env_api_key: &str,
) -> Vec<CodexRoute> {
    ["gac", "tuzi"]
        .iter()
        .map(|route_name| {
            let config_entry = config.routes.get(*route_name);
            let settings = resolve_model_settings(
                None,
                None,
                config_entry.and_then(|v| v.model.as_deref()),
                config_entry.and_then(|v| v.model_reasoning_effort.as_deref()),
            );
            let is_current = current_route == Some(*route_name);
            CodexRoute {
                name: (*route_name).to_string(),
                base_url: config_entry
                    .and_then(|v| v.base_url.clone())
                    .or_else(|| route_base_url(route_name).map(|v| v.to_string())),
                has_key: is_current && !env_api_key.trim().is_empty(),
                is_current,
                api_key_masked: if is_current && !env_api_key.trim().is_empty() {
                    Some(mask_key(env_api_key.trim()))
                } else {
                    None
                },
                model_settings: settings,
            }
        })
        .collect()
}

#[command]
pub async fn get_codex_status() -> Result<CodexStatus, String> {
    let installed = shell::command_exists("codex");
    let version = if installed {
        shell::run_command_output("codex", &["--version"]).ok()
    } else {
        None
    };

    let state_path = get_codex_state_file_path();
    let config_path = get_codex_config_file_path();
    let state_file_exists = Path::new(&state_path).exists();
    let config_file_exists = Path::new(&config_path).exists();

    let state = load_install_state();
    let config = parse_codex_config(&file::read_file(&config_path).unwrap_or_default());
    let current_route = derive_current_route(&state, &config);
    let env_api_key = std::env::var("CODEX_API_KEY").ok().unwrap_or_default();
    let routes = build_routes(current_route.as_deref(), &config, &env_api_key);

    let install_type = state.install_type.or_else(|| {
        if installed {
            Some("unknown".to_string())
        } else {
            None
        }
    });

    Ok(CodexStatus {
        installed,
        version,
        install_type,
        current_route,
        state_file_exists,
        config_file_exists,
        routes,
        env_summary: CodexEnvSummary {
            codex_api_key_masked: if env_api_key.trim().is_empty() {
                None
            } else {
                Some(mask_key(env_api_key.trim()))
            },
        },
    })
}

#[command]
pub async fn get_codex_install_reference() -> Result<CodexReferenceDocs, String> {
    let script_markdown = match file::read_file(CODEX_REFERENCE_SCRIPT_PATH) {
        Ok(content) => content,
        Err(e) => {
            return Ok(CodexReferenceDocs {
                script_markdown: String::new(),
                updated_at: None,
                error: Some(format!("读取 install_codex.sh 失败: {}", e)),
            })
        }
    };

    let updated_at = std::fs::metadata(CODEX_REFERENCE_SCRIPT_PATH)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .map(|time| {
            let datetime: chrono::DateTime<chrono::Utc> = time.into();
            datetime.to_rfc3339()
        });

    Ok(CodexReferenceDocs {
        script_markdown,
        updated_at,
        error: None,
    })
}

#[command]
pub async fn list_codex_routes() -> Result<CodexRoutesResponse, String> {
    let status = get_codex_status().await?;
    Ok(CodexRoutesResponse {
        current_route: status.current_route,
        routes: status.routes,
    })
}

#[command]
pub async fn install_codex(
    variant: String,
    route: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    model_reasoning_effort: Option<String>,
) -> Result<CodexActionResult, String> {
    let normalized_variant = variant.trim().to_lowercase();
    if normalized_variant != "openai" && normalized_variant != "gac" {
        return Ok(error_result(
            "Codex 安装失败",
            format!("未知安装类型: {}", variant),
            String::new(),
        ));
    }

    if normalized_variant == "gac" {
        let command = format!("npm install -g {}", CODEX_GAC_INSTALL_URL);
        match run_npm_global(&command) {
            Ok(output) => {
                save_install_state("gac", None)?;
                return Ok(success_result(
                    "gac 改版 Codex 安装成功",
                    format!("$ {}\n{}", command, output),
                    true,
                ));
            }
            Err(e) => {
                return Ok(error_result("Codex 安装失败", e, String::new()));
            }
        }
    }

    let install_command = format!("npm install -g {}", CODEX_OPENAI_PACKAGE);
    let install_output = match run_npm_global(&install_command) {
        Ok(value) => value,
        Err(e) => return Ok(error_result("Codex 安装失败", e, String::new())),
    };

    let mut logs = vec![format!("$ {}", install_command), install_output];

    if let Some(selected_route) = route {
        let key = api_key.unwrap_or_default();
        match configure_openai_route(&selected_route, &key, model, model_reasoning_effort) {
            Ok(route_logs) => {
                logs.extend(route_logs);
                return Ok(success_result(
                    "原版 Codex 安装并配置成功，请重开终端后执行 codex",
                    logs.join("\n"),
                    true,
                ));
            }
            Err(e) => {
                return Ok(error_result(
                    "Codex 安装成功，但路线配置失败",
                    e,
                    logs.join("\n"),
                ));
            }
        }
    }

    save_install_state("openai", None)?;
    logs.push(format!("已写入状态: {}", get_codex_state_file_path()));

    Ok(success_result(
        "原版 Codex 安装成功",
        logs.join("\n"),
        false,
    ))
}

#[command]
pub async fn switch_codex_route(
    route_name: String,
    api_key: String,
    model: Option<String>,
    model_reasoning_effort: Option<String>,
) -> Result<CodexActionResult, String> {
    let state = load_install_state();
    if state.install_type.as_deref() == Some("gac") {
        return Ok(error_result(
            "路线切换失败",
            "只有原版 Codex 才支持路线切换".to_string(),
            String::new(),
        ));
    }

    match configure_openai_route(
        route_name.trim(),
        api_key.trim(),
        model,
        model_reasoning_effort,
    ) {
        Ok(logs) => Ok(success_result(
            "路线切换成功，请重开终端后执行 codex",
            logs.join("\n"),
            true,
        )),
        Err(e) => Ok(error_result("路线切换失败", e, String::new())),
    }
}

#[command]
pub async fn set_codex_route_model(
    route_name: String,
    model: String,
    model_reasoning_effort: Option<String>,
) -> Result<CodexActionResult, String> {
    let state = load_install_state();
    if state.install_type.as_deref() == Some("gac") {
        return Ok(error_result(
            "模型参数更新失败",
            "只有原版 Codex 才支持路线模型设置".to_string(),
            String::new(),
        ));
    }

    let normalized_route = match normalize_route(route_name.trim()) {
        Some(v) => v,
        None => {
            return Ok(error_result(
                "模型参数更新失败",
                "仅支持 gac 或 tuzi 路线".to_string(),
                String::new(),
            ))
        }
    };

    let config = parse_codex_config(&file::read_file(&get_codex_config_file_path()).unwrap_or_default());
    let existing = config.routes.get(&normalized_route);
    let settings = resolve_model_settings(
        Some(model),
        model_reasoning_effort,
        existing.and_then(|v| v.model.as_deref()),
        existing.and_then(|v| v.model_reasoning_effort.as_deref()),
    );

    if settings.model.trim().is_empty() {
        return Ok(error_result(
            "模型参数更新失败",
            "model 不能为空".to_string(),
            String::new(),
        ));
    }

    if let Err(e) = write_codex_config(
        &normalized_route,
        &settings.model,
        &settings.model_reasoning_effort,
    ) {
        return Ok(error_result("模型参数更新失败", e, String::new()));
    }

    save_install_state("openai", Some(&normalized_route))?;

    Ok(success_result(
        "模型参数更新成功",
        format!(
            "route={} model={} reasoning={}\n已写入: {}",
            normalized_route,
            settings.model,
            settings.model_reasoning_effort,
            get_codex_config_file_path()
        ),
        false,
    ))
}

#[command]
pub async fn upgrade_codex(target_variant: Option<String>) -> Result<CodexActionResult, String> {
    let variant = target_variant
        .map(|v| v.trim().to_lowercase())
        .filter(|v| !v.is_empty())
        .or_else(|| load_install_state().install_type)
        .unwrap_or_else(|| "openai".to_string());

    let command = if variant == "gac" {
        format!("npm install -g {}", CODEX_GAC_INSTALL_URL)
    } else {
        format!("npm install -g {}@latest", CODEX_OPENAI_PACKAGE)
    };

    match run_npm_global(&command) {
        Ok(output) => Ok(success_result(
            "Codex 升级成功",
            format!("$ {}\n{}", command, output),
            false,
        )),
        Err(e) => Ok(error_result("Codex 升级失败", e, String::new())),
    }
}

fn try_uninstall_codex() -> (bool, Vec<String>, Vec<String>) {
    let mut logs = Vec::new();
    let mut errors = Vec::new();

    let commands = [
        format!("npm uninstall -g {}", CODEX_OPENAI_PACKAGE),
        "npm uninstall -g codex".to_string(),
    ];

    for command in commands {
        match run_npm_global(&command) {
            Ok(output) => {
                logs.push(format!("$ {}\n{}", command, output));
                return (true, logs, errors);
            }
            Err(e) => {
                errors.push(format!("$ {}\n{}", command, e));
            }
        }
    }

    if !shell::command_exists("codex") {
        return (true, logs, errors);
    }

    (false, logs, errors)
}

#[command]
pub async fn uninstall_codex(clear_config: bool) -> Result<CodexActionResult, String> {
    let (success, mut logs, errors) = try_uninstall_codex();

    if !errors.is_empty() {
        logs.extend(errors);
    }

    if !success {
        return Ok(error_result(
            "Codex 卸载失败",
            "执行 npm uninstall 后仍检测到 codex 命令".to_string(),
            logs.join("\n\n"),
        ));
    }

    clear_install_state();
    logs.push(format!("已删除状态: {}", get_codex_state_file_path()));

    if clear_config {
        let config_path = get_codex_config_file_path();
        if Path::new(&config_path).exists() {
            let _ = std::fs::remove_file(&config_path);
            logs.push(format!("已删除配置: {}", config_path));
        }

        match clear_env_in_rc() {
            Ok(paths) => {
                for path in paths {
                    logs.push(format!("已清理环境变量: {}", path));
                }
            }
            Err(e) => {
                logs.push(format!("清理环境变量失败: {}", e));
            }
        }
    }

    Ok(success_result(
        if clear_config {
            "Codex 已卸载，配置已清理"
        } else {
            "Codex 已卸载，配置已保留"
        },
        logs.join("\n\n"),
        clear_config,
    ))
}

#[command]
pub async fn reinstall_codex(
    variant: String,
    route: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    model_reasoning_effort: Option<String>,
    clear_config: Option<bool>,
) -> Result<CodexActionResult, String> {
    let clear = clear_config.unwrap_or(false);

    let uninstall = uninstall_codex(clear).await?;
    if !uninstall.success {
        return Ok(uninstall);
    }

    let install = install_codex(
        variant,
        route,
        api_key,
        model,
        model_reasoning_effort,
    )
    .await?;

    let combined_output = [uninstall.stdout, install.stdout]
        .into_iter()
        .filter(|v| !v.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    if install.success {
        Ok(success_result(
            "Codex 重装成功",
            combined_output,
            install.restart_required,
        ))
    } else {
        Ok(error_result(
            "Codex 重装失败",
            install
                .error
                .unwrap_or_else(|| "安装阶段发生未知错误".to_string()),
            combined_output,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::{filter_codex_config, normalize_route, parse_codex_config, parse_install_state};

    #[test]
    fn parse_install_state_works() {
        let state = parse_install_state(
            "INSTALL_TYPE=openai\nROUTE=gac\nMANAGED_BY=sh.tu-zi.com\n",
        );
        assert_eq!(state.install_type.as_deref(), Some("openai"));
        assert_eq!(state.route.as_deref(), Some("gac"));

        let unknown = parse_install_state("INSTALL_TYPE=other\nROUTE=xxx\n");
        assert!(unknown.install_type.is_none());
        assert!(unknown.route.is_none());
    }

    #[test]
    fn normalize_route_works() {
        assert_eq!(normalize_route("gac").as_deref(), Some("gac"));
        assert_eq!(normalize_route("tuzi").as_deref(), Some("tuzi"));
        assert!(normalize_route("abc").is_none());
    }

    #[test]
    fn filter_codex_sections_and_profile() {
        let raw = r#"profile = "gac"

[foo]
a = 1

[model_providers.gac]
name = "gac"
base_url = "https://gaccode.com/codex/v1"

[profiles.gac]
model_provider = "gac"

[bar]
b = 2
"#;
        let filtered = filter_codex_config(raw);
        assert!(filtered.contains("[foo]"));
        assert!(filtered.contains("[bar]"));
        assert!(!filtered.contains("[model_providers.gac]"));
        assert!(!filtered.contains("[profiles.gac]"));
        assert!(!filtered.contains("profile ="));
    }

    #[test]
    fn parse_codex_config_reads_sections() {
        let raw = r#"profile = "tuzi"

[model_providers.tuzi]
base_url = "https://api.tu-zi.com/v1"

[profiles.tuzi]
model = "gpt-5.5"
model_reasoning_effort = "high"
"#;

        let parsed = parse_codex_config(raw);
        assert_eq!(parsed.profile.as_deref(), Some("tuzi"));
        let route = parsed.routes.get("tuzi").expect("tuzi route missing");
        assert_eq!(
            route.base_url.as_deref(),
            Some("https://api.tu-zi.com/v1")
        );
        assert_eq!(route.model.as_deref(), Some("gpt-5.5"));
        assert_eq!(route.model_reasoning_effort.as_deref(), Some("high"));
    }
}
