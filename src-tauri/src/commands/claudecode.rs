use crate::utils::{file, platform, shell};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;
use tauri::command;

const CLAUDE_REFERENCE_DIR: &str = "/Users/shuidiyu06/tu/sh.tu-zi.com/sh/install_claude";
const CLAUDE_MODIFIED_INSTALL_URL: &str = "https://gaccode.com/claudecode/install";
const CLAUDE_ORIGINAL_PACKAGE: &str = "@anthropic-ai/claude-code";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeRoute {
    pub name: String,
    pub base_url: Option<String>,
    pub has_key: bool,
    pub is_current: bool,
    pub api_key_masked: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeEnvSummary {
    pub anthropic_api_key_masked: Option<String>,
    pub anthropic_base_url: Option<String>,
    pub anthropic_api_token_set: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeCodeStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub current_route: Option<String>,
    pub route_file_exists: bool,
    pub routes: Vec<ClaudeRoute>,
    pub env_summary: ClaudeEnvSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeReferenceDocs {
    pub readme_markdown: String,
    pub flow_markdown: String,
    pub updated_at: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeActionResult {
    pub success: bool,
    pub message: String,
    pub error: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub restart_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeRoutesResponse {
    pub current_route: Option<String>,
    pub routes: Vec<ClaudeRoute>,
}

#[derive(Debug, Clone)]
struct RouteEntry {
    api_key: Option<String>,
    base_url: Option<String>,
    api_token: Option<String>,
}

#[derive(Debug, Clone)]
struct RouteFileData {
    current_route: Option<String>,
    routes: BTreeMap<String, RouteEntry>,
}

fn success_result(message: &str, stdout: String, restart_required: bool) -> ClaudeActionResult {
    ClaudeActionResult {
        success: true,
        message: message.to_string(),
        error: None,
        stdout,
        stderr: String::new(),
        restart_required,
    }
}

fn error_result(message: &str, error: String, stdout: String) -> ClaudeActionResult {
    ClaudeActionResult {
        success: false,
        message: message.to_string(),
        error: Some(error.clone()),
        stdout,
        stderr: error,
        restart_required: false,
    }
}

fn get_claude_route_file_path() -> String {
    if let Some(home) = dirs::home_dir() {
        if platform::is_windows() {
            format!("{}\\.config\\tuzi\\claude_route_status.txt", home.display())
        } else {
            format!("{}/.config/tuzi/claude_route_status.txt", home.display())
        }
    } else if platform::is_windows() {
        String::from("%USERPROFILE%\\.config\\tuzi\\claude_route_status.txt")
    } else {
        String::from("~/.config/tuzi/claude_route_status.txt")
    }
}

fn get_shell_rc_candidates() -> Vec<String> {
    if platform::is_windows() {
        return Vec::new();
    }
    let mut result = Vec::new();
    if let Some(home) = dirs::home_dir() {
        result.push(format!("{}/.zshrc", home.display()));
        result.push(format!("{}/.bashrc", home.display()));
    }
    result
}

fn parse_route_file(content: &str) -> RouteFileData {
    let mut current_route: Option<String> = None;
    let mut routes: BTreeMap<String, RouteEntry> = BTreeMap::new();
    let mut active_section: Option<String> = None;

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if let Some(value) = line.strip_prefix("current_route=") {
            let route = value.trim().to_string();
            if !route.is_empty() {
                current_route = Some(route);
            }
            continue;
        }

        if line.starts_with('[') && line.ends_with(']') {
            let section = line.trim_start_matches('[').trim_end_matches(']').trim().to_string();
            if section.is_empty() {
                active_section = None;
            } else {
                routes.entry(section.clone()).or_insert(RouteEntry {
                    api_key: None,
                    base_url: None,
                    api_token: None,
                });
                active_section = Some(section);
            }
            continue;
        }

        let section_name = match &active_section {
            Some(value) => value,
            None => continue,
        };

        if let Some((key, value)) = line.split_once('=') {
            let entry = routes.entry(section_name.clone()).or_insert(RouteEntry {
                api_key: None,
                base_url: None,
                api_token: None,
            });
            let parsed_value = value.trim().to_string();
            match key.trim() {
                "ANTHROPIC_API_KEY" => entry.api_key = if parsed_value.is_empty() { None } else { Some(parsed_value) },
                "ANTHROPIC_BASE_URL" => entry.base_url = if parsed_value.is_empty() { None } else { Some(parsed_value) },
                "ANTHROPIC_API_TOKEN" => entry.api_token = if parsed_value.is_empty() { None } else { Some(parsed_value) },
                _ => {}
            }
        }
    }

    RouteFileData {
        current_route,
        routes,
    }
}

fn route_file_to_string(data: &RouteFileData) -> String {
    let mut lines: Vec<String> = Vec::new();
    if let Some(current) = &data.current_route {
        lines.push(format!("current_route={}", current));
        lines.push(String::new());
    }

    for (name, route) in &data.routes {
        lines.push(format!("[{}]", name));
        lines.push(format!(
            "ANTHROPIC_API_TOKEN={}",
            route.api_token.clone().unwrap_or_default()
        ));
        lines.push(format!(
            "ANTHROPIC_API_KEY={}",
            route.api_key.clone().unwrap_or_default()
        ));
        lines.push(format!(
            "ANTHROPIC_BASE_URL={}",
            route.base_url.clone().unwrap_or_default()
        ));
        lines.push(String::new());
    }

    lines.join("\n").trim().to_string() + "\n"
}

fn read_route_file() -> RouteFileData {
    let path = get_claude_route_file_path();
    let content = file::read_file(&path).unwrap_or_default();
    parse_route_file(&content)
}

fn write_route_file(data: &RouteFileData) -> Result<(), String> {
    let path = get_claude_route_file_path();
    let content = route_file_to_string(data);
    file::write_file(&path, &content).map_err(|e| format!("写入路线配置失败: {}", e))
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

fn apply_env_to_rc(api_key: &str, base_url: &str, api_token: &str) -> Result<Vec<String>, String> {
    if platform::is_windows() {
        return Ok(Vec::new());
    }

    let rc_paths = get_shell_rc_candidates();
    if rc_paths.is_empty() {
        return Err("无法定位 shell 配置文件".to_string());
    }

    let mut updated: Vec<String> = Vec::new();
    for rc_path in rc_paths {
        let content = file::read_file(&rc_path).unwrap_or_default();
        let filtered_lines: Vec<String> = content
            .lines()
            .filter(|line| {
                let trimmed = line.trim_start();
                !(trimmed.starts_with("export ANTHROPIC_API_TOKEN=")
                    || trimmed.starts_with("export ANTHROPIC_API_KEY=")
                    || trimmed.starts_with("export ANTHROPIC_BASE_URL="))
            })
            .map(|line| line.to_string())
            .collect();

        let mut lines = filtered_lines;
        lines.push(format!("export ANTHROPIC_API_TOKEN=\"{}\"", api_token));
        lines.push(format!("export ANTHROPIC_API_KEY=\"{}\"", api_key));
        lines.push(format!("export ANTHROPIC_BASE_URL=\"{}\"", base_url));

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

    let mut updated: Vec<String> = Vec::new();
    for rc_path in rc_paths {
        let content = file::read_file(&rc_path).unwrap_or_default();
        let filtered_lines: Vec<String> = content
            .lines()
            .filter(|line| {
                let trimmed = line.trim_start();
                !(trimmed.starts_with("export ANTHROPIC_API_TOKEN=")
                    || trimmed.starts_with("export ANTHROPIC_API_KEY=")
                    || trimmed.starts_with("export ANTHROPIC_BASE_URL="))
            })
            .map(|line| line.to_string())
            .collect();

        file::write_file(&rc_path, &filtered_lines.join("\n"))
            .map_err(|e| format!("清理 {} 中的 ANTHROPIC 变量失败: {}", rc_path, e))?;
        updated.push(rc_path);
    }
    Ok(updated)
}

fn ensure_claude_json_onboarding() -> Result<(), String> {
    let home = dirs::home_dir().ok_or_else(|| "无法定位用户目录".to_string())?;
    let claude_json_path = if platform::is_windows() {
        format!("{}\\.claude.json", home.display())
    } else {
        format!("{}/.claude.json", home.display())
    };

    let existing = file::read_file(&claude_json_path).unwrap_or_else(|_| "{}".to_string());
    let mut parsed: Value = serde_json::from_str(&existing).unwrap_or_else(|_| json!({}));
    if !parsed.is_object() {
        parsed = json!({});
    }
    parsed["hasCompletedOnboarding"] = Value::Bool(true);
    let serialized = serde_json::to_string_pretty(&parsed)
        .map_err(|e| format!("序列化 ~/.claude.json 失败: {}", e))?;
    file::write_file(&claude_json_path, &serialized)
        .map_err(|e| format!("写入 ~/.claude.json 失败: {}", e))
}

fn run_npm_global(command: &str) -> Result<String, String> {
    shell::run_script_output(command)
}

fn resolve_install_api_key(route_data: &RouteFileData, route_name: &str, provided: Option<String>) -> Option<String> {
    if let Some(value) = provided {
        let trimmed = value.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }

    if let Some(route) = route_data.routes.get(route_name) {
        if let Some(value) = &route.api_key {
            if !value.trim().is_empty() {
                return Some(value.trim().to_string());
            }
        }
    }

    if let Ok(value) = std::env::var("ANTHROPIC_API_KEY") {
        let trimmed = value.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }

    None
}

fn build_routes_response(data: &RouteFileData) -> ClaudeRoutesResponse {
    let routes = data
        .routes
        .iter()
        .map(|(name, route)| {
            let api_key = route.api_key.clone().unwrap_or_default();
            ClaudeRoute {
                name: name.clone(),
                base_url: route.base_url.clone(),
                has_key: !api_key.trim().is_empty(),
                is_current: data.current_route.as_deref() == Some(name.as_str()),
                api_key_masked: if api_key.trim().is_empty() {
                    None
                } else {
                    Some(mask_key(&api_key))
                },
            }
        })
        .collect::<Vec<_>>();

    ClaudeRoutesResponse {
        current_route: data.current_route.clone(),
        routes,
    }
}

#[command]
pub async fn get_claudecode_status() -> Result<ClaudeCodeStatus, String> {
    let installed = shell::command_exists("claude");
    let version = if installed {
        shell::run_command_output("claude", &["--version"]).ok()
    } else {
        None
    };

    let route_file_path = get_claude_route_file_path();
    let route_file_exists = Path::new(&route_file_path).exists();
    let route_data = read_route_file();
    let routes_response = build_routes_response(&route_data);

    let env_api_key = std::env::var("ANTHROPIC_API_KEY").ok().unwrap_or_default();
    let env_base_url = std::env::var("ANTHROPIC_BASE_URL").ok().unwrap_or_default();
    let env_api_token = std::env::var("ANTHROPIC_API_TOKEN").ok().unwrap_or_default();

    Ok(ClaudeCodeStatus {
        installed,
        version,
        current_route: routes_response.current_route,
        route_file_exists,
        routes: routes_response.routes,
        env_summary: ClaudeEnvSummary {
            anthropic_api_key_masked: if env_api_key.trim().is_empty() {
                None
            } else {
                Some(mask_key(env_api_key.trim()))
            },
            anthropic_base_url: if env_base_url.trim().is_empty() {
                None
            } else {
                Some(env_base_url)
            },
            anthropic_api_token_set: !env_api_token.trim().is_empty(),
        },
    })
}

#[command]
pub async fn get_claude_install_reference() -> Result<ClaudeReferenceDocs, String> {
    let readme_path = format!("{}/README_INSTALL_CLAUDE.md", CLAUDE_REFERENCE_DIR);
    let flow_path = format!("{}/install_claude_flow.md", CLAUDE_REFERENCE_DIR);

    let mut errors: Vec<String> = Vec::new();
    let readme_markdown = match file::read_file(&readme_path) {
        Ok(content) => content,
        Err(e) => {
            errors.push(format!("读取 README 失败: {}", e));
            String::new()
        }
    };
    let flow_markdown = match file::read_file(&flow_path) {
        Ok(content) => content,
        Err(e) => {
            errors.push(format!("读取流程文档失败: {}", e));
            String::new()
        }
    };

    let updated_at = std::fs::metadata(&flow_path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .map(|time| {
            let datetime: chrono::DateTime<chrono::Utc> = time.into();
            datetime.to_rfc3339()
        });

    Ok(ClaudeReferenceDocs {
        readme_markdown,
        flow_markdown,
        updated_at,
        error: if errors.is_empty() {
            None
        } else {
            Some(errors.join("；"))
        },
    })
}

#[command]
pub async fn list_claude_routes() -> Result<ClaudeRoutesResponse, String> {
    let data = read_route_file();
    Ok(build_routes_response(&data))
}

#[command]
pub async fn switch_claude_route(route_name: String) -> Result<ClaudeActionResult, String> {
    let route_name = route_name.trim().to_string();
    if route_name.is_empty() {
        return Ok(error_result(
            "路线切换失败",
            "路线名称不能为空".to_string(),
            String::new(),
        ));
    }

    let mut data = read_route_file();
    let route = match data.routes.get(&route_name) {
        Some(value) => value.clone(),
        None => {
            return Ok(error_result(
                "路线切换失败",
                format!("路线不存在: {}", route_name),
                String::new(),
            ))
        }
    };

    data.current_route = Some(route_name.clone());
    write_route_file(&data)?;

    let mut op_logs = vec![format!("switch_claude_route route={}", route_name)];
    op_logs.push(format!("已写入路线配置: {}", get_claude_route_file_path()));
    if route_name != "改版" {
        let key = route.api_key.clone().unwrap_or_default();
        let base_url = route.base_url.clone().unwrap_or_default();
        let token = route.api_token.clone().unwrap_or_default();
        if !key.is_empty() && !base_url.is_empty() {
            let rc_paths = apply_env_to_rc(&key, &base_url, &token)?;
            for path in rc_paths {
                op_logs.push(format!("已更新环境变量: {}", path));
            }
            ensure_claude_json_onboarding()?;
            op_logs.push("已更新 ~/.claude.json".to_string());
        }
    }

    Ok(success_result(
        "路线切换成功，请重新打开终端后执行 claude",
        op_logs.join("\n"),
        true,
    ))
}

#[command]
pub async fn add_claude_route(
    route_name: String,
    base_url: String,
    api_key: String,
) -> Result<ClaudeActionResult, String> {
    let route_name = route_name.trim().to_string();
    let base_url = base_url.trim().to_string();
    let api_key = api_key.trim().to_string();

    if route_name.is_empty() || base_url.is_empty() || api_key.is_empty() {
        return Ok(error_result(
            "添加路线失败",
            "路线名、Base URL、API Key 不能为空".to_string(),
            String::new(),
        ));
    }

    if route_name == "改版" {
        return Ok(error_result(
            "添加路线失败",
            "路线名不能为“改版”".to_string(),
            String::new(),
        ));
    }

    let mut data = read_route_file();
    if data.routes.contains_key(&route_name) {
        return Ok(error_result(
            "添加路线失败",
            format!("路线已存在: {}", route_name),
            String::new(),
        ));
    }

    data.routes.insert(
        route_name.clone(),
        RouteEntry {
            api_key: Some(api_key.clone()),
            base_url: Some(base_url.clone()),
            api_token: Some(String::new()),
        },
    );
    data.current_route = Some(route_name.clone());
    write_route_file(&data)?;
    let rc_paths = apply_env_to_rc(&api_key, &base_url, "")?;
    ensure_claude_json_onboarding()?;
    let mut logs = vec![
        format!("add_claude_route route={}", route_name),
        format!("已写入路线配置: {}", get_claude_route_file_path()),
        "已更新 ~/.claude.json".to_string(),
    ];
    for path in rc_paths {
        logs.push(format!("已更新环境变量: {}", path));
    }

    Ok(success_result(
        "路线已添加并切换，请重新打开终端生效",
        logs.join("\n"),
        true,
    ))
}

#[command]
pub async fn update_claude_route_key(
    route_name: String,
    api_key: String,
) -> Result<ClaudeActionResult, String> {
    let route_name = route_name.trim().to_string();
    let api_key = api_key.trim().to_string();
    if route_name.is_empty() || api_key.is_empty() {
        return Ok(error_result(
            "更新 API Key 失败",
            "路线名和 API Key 不能为空".to_string(),
            String::new(),
        ));
    }

    let mut data = read_route_file();
    let (base_url_for_env, token_for_env) = match data.routes.get_mut(&route_name) {
        Some(value) => {
            value.api_key = Some(api_key.clone());
            (
                value.base_url.clone().unwrap_or_default(),
                value.api_token.clone().unwrap_or_default(),
            )
        }
        None => {
            return Ok(error_result(
                "更新 API Key 失败",
                format!("路线不存在: {}", route_name),
                String::new(),
            ))
        }
    };

    if route_name == "改版" {
        return Ok(error_result(
            "更新 API Key 失败",
            "改版路线不支持设置 API Key".to_string(),
            String::new(),
        ));
    }

    write_route_file(&data)?;

    if data.current_route.as_deref() == Some(route_name.as_str()) {
        let rc_paths = apply_env_to_rc(&api_key, &base_url_for_env, &token_for_env)?;
        let mut logs = vec![
            format!("update_claude_route_key route={}", route_name),
            format!("已写入路线配置: {}", get_claude_route_file_path()),
        ];
        for path in rc_paths {
            logs.push(format!("已更新环境变量: {}", path));
        }
        return Ok(success_result(
            "API Key 更新成功，请重新打开终端生效",
            logs.join("\n"),
            true,
        ));
    }

    Ok(success_result(
        "API Key 更新成功，请重新打开终端生效",
        format!(
            "update_claude_route_key route={}\n已写入路线配置: {}",
            route_name,
            get_claude_route_file_path()
        ),
        true,
    ))
}

#[command]
pub async fn install_claudecode(
    scheme: String,
    api_key: Option<String>,
) -> Result<ClaudeActionResult, String> {
    let normalized = scheme.trim().to_uppercase();
    let mut data = read_route_file();

    if normalized == "A" {
        let command = format!("npm install -g {}", CLAUDE_MODIFIED_INSTALL_URL);
        let output = match run_npm_global(&command) {
            Ok(value) => value,
            Err(e) => return Ok(error_result("ClaudeCode 安装失败", e, String::new())),
        };

        data.routes.insert(
            "改版".to_string(),
            RouteEntry {
                api_key: None,
                base_url: None,
                api_token: None,
            },
        );
        data.current_route = Some("改版".to_string());
        write_route_file(&data)?;
        let logs = vec![
            format!("$ {}", command),
            output,
            format!("已写入路线配置: {}", get_claude_route_file_path()),
        ];
        return Ok(success_result(
            "改版 ClaudeCode 安装成功",
            logs.join("\n"),
            false,
        ));
    }

    if normalized != "B" && normalized != "C" {
        return Ok(error_result(
            "ClaudeCode 安装失败",
            format!("未知安装方案: {}", scheme),
            String::new(),
        ));
    }

    let route_name = if normalized == "B" { "gaccode" } else { "tu-zi" };
    let base_url = if normalized == "B" {
        "https://gaccode.com/claudecode"
    } else {
        "https://api.tu-zi.com"
    };
    let final_key = match resolve_install_api_key(&data, route_name, api_key) {
        Some(value) => value,
        None => {
            return Ok(error_result(
                "ClaudeCode 安装失败",
                "该方案需要 API Key，请在页面输入后重试".to_string(),
                String::new(),
            ))
        }
    };

    let command = format!("npm install -g {}", CLAUDE_ORIGINAL_PACKAGE);
    let output = match run_npm_global(&command) {
        Ok(value) => value,
        Err(e) => return Ok(error_result("ClaudeCode 安装失败", e, String::new())),
    };

    data.routes.insert(
        route_name.to_string(),
        RouteEntry {
            api_key: Some(final_key.clone()),
            base_url: Some(base_url.to_string()),
            api_token: Some(String::new()),
        },
    );
    data.current_route = Some(route_name.to_string());
    write_route_file(&data)?;
    let rc_paths = apply_env_to_rc(&final_key, base_url, "")?;
    ensure_claude_json_onboarding()?;
    let mut logs = vec![
        format!("$ {}", command),
        output,
        format!("已写入路线配置: {}", get_claude_route_file_path()),
        "已更新 ~/.claude.json".to_string(),
    ];
    for path in rc_paths {
        logs.push(format!("已更新环境变量: {}", path));
    }

    Ok(success_result(
        format!("方案 {} 安装成功，请重开终端后运行 claude", normalized).as_str(),
        logs.join("\n"),
        true,
    ))
}

#[command]
pub async fn upgrade_claudecode(target_variant: Option<String>) -> Result<ClaudeActionResult, String> {
    let variant = if let Some(value) = target_variant {
        value.trim().to_lowercase()
    } else {
        let route_data = read_route_file();
        let current_route = route_data.current_route.unwrap_or_default();
        if current_route == "改版" {
            "modified".to_string()
        } else {
            "original".to_string()
        }
    };

    let command = if variant == "modified" || variant == "a" || variant == "改版" {
        format!("npm install -g {}", CLAUDE_MODIFIED_INSTALL_URL)
    } else {
        format!("npm install -g {}@latest", CLAUDE_ORIGINAL_PACKAGE)
    };

    let message = if variant == "modified" || variant == "a" || variant == "改版" {
        "ClaudeCode 改版升级成功"
    } else {
        "ClaudeCode 原版升级成功"
    };

    match run_npm_global(&command) {
        Ok(output) => Ok(success_result(
            message,
            format!("$ {}\n{}", command, output),
            false,
        )),
        Err(e) => Ok(error_result("ClaudeCode 升级失败", e, String::new())),
    }
}

#[command]
pub async fn uninstall_claudecode(clear_config: bool) -> Result<ClaudeActionResult, String> {
    let command = format!("npm uninstall -g {}", CLAUDE_ORIGINAL_PACKAGE);
    let output = match run_npm_global(&command) {
        Ok(value) => value,
        Err(e) => return Ok(error_result("ClaudeCode 卸载失败", e, String::new())),
    };

    if clear_config {
        let route_file_path = get_claude_route_file_path();
        if Path::new(&route_file_path).exists() {
            let _ = std::fs::remove_file(&route_file_path);
        }
        let _ = clear_env_in_rc();
    }

    let mut logs = vec![format!("$ {}", command), output];
    if clear_config {
        logs.push(format!("已删除路线配置: {}", get_claude_route_file_path()));
    }

    Ok(success_result(
        if clear_config {
            "ClaudeCode 已卸载，配置已清理"
        } else {
            "ClaudeCode 已卸载，配置已保留"
        },
        logs.join("\n"),
        false,
    ))
}
