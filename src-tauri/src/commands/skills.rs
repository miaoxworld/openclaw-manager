use crate::utils::shell;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::command;

const TUZI_SKILLS_REPO: &str = "tuziapi/tuzi-skills";
const TUZI_SKILLS_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/tuziapi/tuzi-skills/main/.claude-plugin/marketplace.json";
const TUZI_SKILLS_AGENT: &str = "openclaw";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziSkillsPluginGroup {
    pub name: String,
    pub description: String,
    pub skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziSkillsManifest {
    pub marketplace_name: String,
    pub version: String,
    pub plugins: Vec<TuziSkillsPluginGroup>,
    pub stale: bool,
    pub source: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziSkillsGroupStatus {
    pub group_name: String,
    pub installed_count: usize,
    pub total_count: usize,
    pub fully_installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziSkillsStatus {
    pub cli_available: bool,
    pub installed_skills: Vec<String>,
    pub group_status: Vec<TuziSkillsGroupStatus>,
    pub last_checked_at: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziSkillsCheckResult {
    pub all_up_to_date: bool,
    pub checked_count: usize,
    pub failed_count: usize,
    pub raw_output: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziSkillInstallResult {
    pub running: bool,
    pub success: bool,
    pub message: String,
    pub error: Option<String>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuziSkillsRefreshResult {
    pub manifest: TuziSkillsManifest,
    pub status: TuziSkillsStatus,
    pub requirements: TuziSkillsCheckResult,
}

#[derive(Debug, Deserialize)]
struct MarketplaceManifestRaw {
    name: String,
    metadata: MarketplaceMetadataRaw,
    plugins: Vec<MarketplacePluginRaw>,
}

#[derive(Debug, Deserialize)]
struct MarketplaceMetadataRaw {
    version: String,
}

#[derive(Debug, Deserialize)]
struct MarketplacePluginRaw {
    name: String,
    description: String,
    skills: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct InstalledSkillRaw {
    name: String,
}

#[command]
pub async fn get_tuzi_skills_manifest() -> Result<TuziSkillsManifest, String> {
    Ok(load_manifest_with_fallback().await)
}

#[command]
pub async fn get_tuzi_skills_status() -> Result<TuziSkillsStatus, String> {
    let manifest = load_manifest_with_fallback().await;
    Ok(load_status_for_manifest(&manifest).await)
}

#[command]
pub async fn install_tuzi_skills_group(
    group_name: String,
) -> Result<TuziSkillInstallResult, String> {
    let manifest = load_manifest_with_fallback().await;
    let group = manifest
        .plugins
        .iter()
        .find(|item| item.name == group_name)
        .ok_or_else(|| format!("未找到技能分组: {}", group_name))?;

    let mut args = vec![
        "add",
        TUZI_SKILLS_REPO,
        "-g",
        "--agent",
        TUZI_SKILLS_AGENT,
        "--yes",
        "--skill",
    ];
    for skill in &group.skills {
        args.push(skill.as_str());
    }

    run_install_command(
        &args,
        format!("已同步分组 {}", group.name),
        format!("同步分组 {} 失败", group.name),
    )
    .await
}

#[command]
pub async fn install_all_tuzi_skills() -> Result<TuziSkillInstallResult, String> {
    let manifest = load_manifest_with_fallback().await;
    let mut args = vec![
        "add",
        TUZI_SKILLS_REPO,
        "-g",
        "--agent",
        TUZI_SKILLS_AGENT,
        "--yes",
        "--skill",
    ];

    for group in &manifest.plugins {
        for skill in &group.skills {
            args.push(skill.as_str());
        }
    }

    run_install_command(
        &args,
        "已同步全部 tuzi-skills".to_string(),
        "同步全部 tuzi-skills 失败".to_string(),
    )
    .await
}

#[command]
pub async fn remove_tuzi_skills_group(
    group_name: String,
) -> Result<TuziSkillInstallResult, String> {
    let manifest = load_manifest_with_fallback().await;
    let group = manifest
        .plugins
        .iter()
        .find(|item| item.name == group_name)
        .ok_or_else(|| format!("未找到技能分组: {}", group_name))?;

    let mut args = vec![
        "remove",
        "-g",
        "--agent",
        TUZI_SKILLS_AGENT,
        "--yes",
        "--skill",
    ];
    for skill in &group.skills {
        args.push(skill.as_str());
    }

    run_install_command(
        &args,
        format!("已移除分组 {}", group.name),
        format!("移除分组 {} 失败", group.name),
    )
    .await
}

#[command]
pub async fn check_tuzi_skills_requirements() -> Result<TuziSkillsCheckResult, String> {
    Ok(run_check_command().await)
}

#[command]
pub async fn refresh_tuzi_skills() -> Result<TuziSkillsRefreshResult, String> {
    let manifest = load_manifest_with_fallback().await;
    let status = load_status_for_manifest(&manifest).await;
    let requirements = run_check_command().await;

    Ok(TuziSkillsRefreshResult {
        manifest,
        status,
        requirements,
    })
}

async fn fetch_remote_manifest() -> Result<TuziSkillsManifest, String> {
    info!("[Skills] 获取 tuzi-skills manifest...");
    let response = reqwest::get(TUZI_SKILLS_MANIFEST_URL)
        .await
        .map_err(|e| format!("拉取远端 manifest 失败: {}", e))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("拉取远端 manifest 失败: HTTP {}", status));
    }

    let raw = response
        .json::<MarketplaceManifestRaw>()
        .await
        .map_err(|e| format!("解析远端 manifest 失败: {}", e))?;

    Ok(parse_manifest_raw(raw, false, "remote".to_string(), None))
}

async fn load_manifest_with_fallback() -> TuziSkillsManifest {
    match fetch_remote_manifest().await {
        Ok(manifest) => manifest,
        Err(e) => {
            warn!("[Skills] 使用内置 fallback manifest: {}", e);
            let raw = fallback_manifest_raw();
            parse_manifest_raw(raw, true, "fallback".to_string(), Some(e))
        }
    }
}

fn parse_manifest_raw(
    raw: MarketplaceManifestRaw,
    stale: bool,
    source: String,
    error: Option<String>,
) -> TuziSkillsManifest {
    let plugins = raw
        .plugins
        .into_iter()
        .map(|plugin| TuziSkillsPluginGroup {
            name: plugin.name,
            description: plugin.description,
            skills: plugin
                .skills
                .into_iter()
                .map(normalize_skill_name)
                .collect(),
        })
        .collect();

    TuziSkillsManifest {
        marketplace_name: raw.name,
        version: raw.metadata.version,
        plugins,
        stale,
        source,
        error,
    }
}

fn fallback_manifest_raw() -> MarketplaceManifestRaw {
    MarketplaceManifestRaw {
        name: "tuzi-skills".to_string(),
        metadata: MarketplaceMetadataRaw {
            version: "fallback".to_string(),
        },
        plugins: vec![
            MarketplacePluginRaw {
                name: "content-skills".to_string(),
                description: "内容生成与发布技能".to_string(),
                skills: vec![
                    "tuzi-xhs-images",
                    "tuzi-post-to-x",
                    "tuzi-post-to-wechat",
                    "tuzi-article-illustrator",
                    "tuzi-cover-image",
                    "tuzi-slide-deck",
                    "tuzi-comic",
                    "tuzi-infographic",
                    "tuzi-short-video",
                    "tuzi-copy-polish",
                ]
                .into_iter()
                .map(str::to_string)
                .collect(),
            },
            MarketplacePluginRaw {
                name: "ai-generation-skills".to_string(),
                description: "AI 生成后端".to_string(),
                skills: vec!["tuzi-danger-gemini-web", "tuzi-image-gen", "tuzi-video-gen"]
                    .into_iter()
                    .map(str::to_string)
                    .collect(),
            },
            MarketplacePluginRaw {
                name: "utility-skills".to_string(),
                description: "内容处理工具".to_string(),
                skills: vec![
                    "tuzi-danger-x-to-markdown",
                    "tuzi-compress-image",
                    "tuzi-url-to-markdown",
                    "tuzi-format-markdown",
                    "tuzi-markdown-to-html",
                    "tuzi-update-claude-md",
                ]
                .into_iter()
                .map(str::to_string)
                .collect(),
            },
        ],
    }
}

async fn load_status_for_manifest(manifest: &TuziSkillsManifest) -> TuziSkillsStatus {
    let last_checked_at = chrono::Utc::now().to_rfc3339();

    let cli_check = shell::run_npx_skills(&["--version"]).await;
    if let Err(e) = cli_check {
        return TuziSkillsStatus {
            cli_available: false,
            installed_skills: vec![],
            group_status: build_group_status(&manifest.plugins, &HashSet::new()),
            last_checked_at,
            error: Some(format!("skills CLI 不可用: {}", e)),
        };
    }

    match shell::run_npx_skills(&["list", "-g", "--json"]).await {
        Ok(output) if output.success => {
            let installed = match serde_json::from_str::<Vec<InstalledSkillRaw>>(&output.stdout) {
                Ok(items) => items
                    .into_iter()
                    .map(|item| item.name)
                    .collect::<HashSet<_>>(),
                Err(e) => {
                    return TuziSkillsStatus {
                        cli_available: true,
                        installed_skills: vec![],
                        group_status: build_group_status(&manifest.plugins, &HashSet::new()),
                        last_checked_at,
                        error: Some(format!("解析已安装 skills 失败: {}", e)),
                    };
                }
            };

            let tuzi_installed = collect_tuzi_installed_skills(&manifest.plugins, &installed);
            let group_status = build_group_status(&manifest.plugins, &tuzi_installed);

            TuziSkillsStatus {
                cli_available: true,
                installed_skills: sort_set(tuzi_installed),
                group_status,
                last_checked_at,
                error: None,
            }
        }
        Ok(output) => TuziSkillsStatus {
            cli_available: true,
            installed_skills: vec![],
            group_status: build_group_status(&manifest.plugins, &HashSet::new()),
            last_checked_at,
            error: Some(format!(
                "读取已安装 skills 失败: {}",
                combine_output(&output.stdout, &output.stderr)
            )),
        },
        Err(e) => TuziSkillsStatus {
            cli_available: true,
            installed_skills: vec![],
            group_status: build_group_status(&manifest.plugins, &HashSet::new()),
            last_checked_at,
            error: Some(format!("读取已安装 skills 失败: {}", e)),
        },
    }
}

async fn run_install_command(
    args: &[&str],
    success_message: String,
    failure_message: String,
) -> Result<TuziSkillInstallResult, String> {
    info!("[Skills] 执行 npx skills {:?}", args);
    match shell::run_npx_skills(args).await {
        Ok(output) if output.success => Ok(TuziSkillInstallResult {
            running: false,
            success: true,
            message: success_message,
            error: None,
            stdout: output.stdout,
            stderr: output.stderr,
        }),
        Ok(output) => Ok(TuziSkillInstallResult {
            running: false,
            success: false,
            message: failure_message,
            error: Some(match output.exit_code {
                Some(code) => format!("命令退出码 {}", code),
                None => "命令执行失败".to_string(),
            }),
            stdout: output.stdout,
            stderr: output.stderr,
        }),
        Err(e) => {
            error!("[Skills] 命令执行失败: {}", e);
            Ok(TuziSkillInstallResult {
                running: false,
                success: false,
                message: failure_message,
                error: Some(e),
                stdout: String::new(),
                stderr: String::new(),
            })
        }
    }
}

async fn run_check_command() -> TuziSkillsCheckResult {
    match shell::run_npx_skills(&["check"]).await {
        Ok(output) => {
            let raw_output = combine_output(&output.stdout, &output.stderr);
            let (checked_count, failed_count) = parse_check_summary(&raw_output);
            let lowercase = raw_output.to_lowercase();
            let all_up_to_date = lowercase.contains("all skills are up to date")
                || lowercase.contains("all skills up to date");

            TuziSkillsCheckResult {
                all_up_to_date,
                checked_count,
                failed_count,
                raw_output,
                error: if output.success {
                    None
                } else {
                    Some("skills check 执行失败".to_string())
                },
            }
        }
        Err(e) => TuziSkillsCheckResult {
            all_up_to_date: false,
            checked_count: 0,
            failed_count: 0,
            raw_output: String::new(),
            error: Some(format!("skills check 执行失败: {}", e)),
        },
    }
}

fn normalize_skill_name(skill: String) -> String {
    skill
        .trim()
        .trim_start_matches("./skills/")
        .trim_start_matches("./")
        .trim_end_matches('/')
        .to_string()
}

fn collect_tuzi_installed_skills(
    groups: &[TuziSkillsPluginGroup],
    installed: &HashSet<String>,
) -> HashSet<String> {
    let tuzi_skill_names = groups
        .iter()
        .flat_map(|group| group.skills.iter().cloned())
        .collect::<HashSet<_>>();

    installed
        .iter()
        .filter(|item| tuzi_skill_names.contains(*item))
        .cloned()
        .collect()
}

fn build_group_status(
    groups: &[TuziSkillsPluginGroup],
    installed: &HashSet<String>,
) -> Vec<TuziSkillsGroupStatus> {
    groups
        .iter()
        .map(|group| {
            let installed_count = group
                .skills
                .iter()
                .filter(|skill| installed.contains(*skill))
                .count();

            TuziSkillsGroupStatus {
                group_name: group.name.clone(),
                installed_count,
                total_count: group.skills.len(),
                fully_installed: installed_count == group.skills.len() && !group.skills.is_empty(),
            }
        })
        .collect()
}

fn sort_set(set: HashSet<String>) -> Vec<String> {
    let mut items = set.into_iter().collect::<Vec<_>>();
    items.sort();
    items
}

fn combine_output(stdout: &str, stderr: &str) -> String {
    match (stdout.trim(), stderr.trim()) {
        ("", "") => String::new(),
        ("", stderr) => stderr.to_string(),
        (stdout, "") => stdout.to_string(),
        (stdout, stderr) => format!("{}\n{}", stdout, stderr),
    }
}

fn parse_check_summary(raw_output: &str) -> (usize, usize) {
    let mut checked_count = 0;
    let mut failed_count = 0;

    for line in raw_output.lines() {
        let normalized = strip_ansi_codes(line).to_lowercase();
        if normalized.contains("checking") && normalized.contains("skill(s)") {
            checked_count = extract_first_number(&normalized).unwrap_or(checked_count);
        }
        if normalized.contains("could not check") && normalized.contains("skill(s)") {
            failed_count = extract_first_number(&normalized).unwrap_or(failed_count);
        }
    }

    (checked_count, failed_count)
}

fn strip_ansi_codes(input: &str) -> String {
    let mut result = String::new();
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if matches!(chars.peek(), Some('[')) {
                chars.next();
                while let Some(next) = chars.next() {
                    if ('@'..='~').contains(&next) {
                        break;
                    }
                }
            }
            continue;
        }
        result.push(ch);
    }

    result
}

fn extract_first_number(input: &str) -> Option<usize> {
    let digits = input
        .chars()
        .skip_while(|ch| !ch.is_ascii_digit())
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>();

    if digits.is_empty() {
        None
    } else {
        digits.parse::<usize>().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_manifest_normalizes_skill_paths() {
        let manifest = parse_manifest_raw(
            MarketplaceManifestRaw {
                name: "tuzi-skills".to_string(),
                metadata: MarketplaceMetadataRaw {
                    version: "1.0.0".to_string(),
                },
                plugins: vec![MarketplacePluginRaw {
                    name: "ai-generation-skills".to_string(),
                    description: "AI".to_string(),
                    skills: vec![
                        "./skills/tuzi-image-gen".to_string(),
                        "./skills/tuzi-video-gen".to_string(),
                    ],
                }],
            },
            false,
            "remote".to_string(),
            None,
        );

        assert_eq!(manifest.plugins.len(), 1);
        assert_eq!(
            manifest.plugins[0].skills,
            vec!["tuzi-image-gen", "tuzi-video-gen"]
        );
    }

    #[test]
    fn collect_installed_skills_filters_non_tuzi_entries() {
        let groups = vec![TuziSkillsPluginGroup {
            name: "content-skills".to_string(),
            description: "content".to_string(),
            skills: vec![
                "tuzi-xhs-images".to_string(),
                "tuzi-copy-polish".to_string(),
            ],
        }];
        let installed = HashSet::from([
            "tuzi-xhs-images".to_string(),
            "search".to_string(),
            "agent-reach".to_string(),
        ]);

        let filtered = collect_tuzi_installed_skills(&groups, &installed);
        assert_eq!(filtered, HashSet::from(["tuzi-xhs-images".to_string()]));
    }

    #[test]
    fn build_group_status_counts_installation_progress() {
        let groups = vec![
            TuziSkillsPluginGroup {
                name: "content-skills".to_string(),
                description: "content".to_string(),
                skills: vec!["a".to_string(), "b".to_string()],
            },
            TuziSkillsPluginGroup {
                name: "utility-skills".to_string(),
                description: "utility".to_string(),
                skills: vec!["c".to_string()],
            },
        ];
        let installed = HashSet::from(["a".to_string(), "c".to_string()]);

        let status = build_group_status(&groups, &installed);
        assert_eq!(status[0].installed_count, 1);
        assert!(!status[0].fully_installed);
        assert_eq!(status[1].installed_count, 1);
        assert!(status[1].fully_installed);
    }

    #[test]
    fn parse_check_summary_handles_success_and_partial_failure() {
        let raw = "\u{1b}[38;5;102mChecking 20 skill(s) for updates...\u{1b}[0m\n\u{1b}[38;5;145m✓ All skills are up to date\u{1b}[0m\n\u{1b}[38;5;102mCould not check 2 skill(s) (may need reinstall)\u{1b}[0m";
        let (checked_count, failed_count) = parse_check_summary(raw);

        assert_eq!(checked_count, 20);
        assert_eq!(failed_count, 2);
    }
}
