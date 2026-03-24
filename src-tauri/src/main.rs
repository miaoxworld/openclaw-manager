// 防止 Windows 系统显示控制台窗口
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod models;
mod utils;

use commands::{claudecode, codex, config, diagnostics, installer, process, service, skills};

fn main() {
    // 初始化日志 - 默认显示 info 级别日志
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    log::info!("🦞 OpenClaw Manager 启动");

    if let Err(err) = config::sync_model_registry_on_startup() {
        log::warn!("启动时同步模型 registry 与 fallbacks 失败: {}", err);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            // 服务管理
            service::get_service_status,
            service::start_service,
            service::stop_service,
            service::restart_service,
            service::get_logs,
            // 进程管理
            process::check_openclaw_installed,
            process::get_openclaw_version,
            process::get_module_statuses,
            process::check_port_in_use,
            // 配置管理
            config::get_config,
            config::save_config,
            config::get_env_value,
            config::save_env_value,
            config::get_ai_providers,
            config::get_channels_config,
            config::save_channel_config,
            config::clear_channel_config,
            // Gateway Token
            config::get_or_create_gateway_token,
            config::get_dashboard_url,
            // AI 配置管理
            config::get_official_providers,
            config::fetch_tuzi_models,
            config::get_tuzi_templates,
            config::get_tuzi_config,
            config::get_ai_config,
            config::save_provider,
            config::save_tuzi_config,
            config::delete_provider,
            config::set_primary_model,
            config::add_available_model,
            config::remove_available_model,
            // 飞书插件管理
            config::check_feishu_plugin,
            config::install_feishu_plugin,
            // 诊断测试
            diagnostics::run_doctor,
            diagnostics::test_ai_connection,
            diagnostics::test_model_connection,
            diagnostics::test_channel,
            diagnostics::get_system_info,
            diagnostics::start_channel_login,
            // 安装器
            installer::check_environment,
            installer::install_nodejs,
            installer::install_openclaw,
            installer::init_openclaw_config,
            installer::open_install_terminal,
            installer::uninstall_openclaw,
            // 版本更新
            installer::check_openclaw_update,
            installer::update_openclaw,
            // Skills 管理
            skills::get_tuzi_skills_manifest,
            skills::get_tuzi_skills_status,
            skills::install_tuzi_skills_group,
            skills::install_all_tuzi_skills,
            skills::remove_tuzi_skills_group,
            skills::check_tuzi_skills_requirements,
            skills::refresh_tuzi_skills,
            // ClaudeCode 管理
            claudecode::get_claudecode_status,
            claudecode::get_claude_install_reference,
            claudecode::install_claudecode,
            claudecode::upgrade_claudecode,
            claudecode::uninstall_claudecode,
            claudecode::list_claude_routes,
            claudecode::switch_claude_route,
            claudecode::add_claude_route,
            claudecode::update_claude_route_key,
            // Codex 管理
            codex::get_codex_status,
            codex::get_codex_install_reference,
            codex::install_codex,
            codex::upgrade_codex,
            codex::uninstall_codex,
            codex::reinstall_codex,
            codex::list_codex_routes,
            codex::switch_codex_route,
            codex::set_codex_route_model,
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时发生错误");
}
