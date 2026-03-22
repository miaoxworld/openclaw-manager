// 防止 Windows 系统显示控制台窗口
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod models;
mod utils;

use commands::{config, diagnostics, installer, process, service};

fn main() {
    // 初始化日志 - 默认显示 info 级别日志
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("info")
    ).init();
    
    log::info!("🦞 OpenClaw Manager 启动");

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
            config::get_ai_config,
            config::save_provider,
            config::delete_provider,
            config::set_primary_model,
            config::add_available_model,
            config::remove_available_model,
            // 飞书插件管理
            config::check_feishu_plugin,
            config::install_feishu_plugin,
            // QQ Bot 插件管理
            config::check_qqbot_plugin,
            config::install_qqbot_plugin,
            // 诊断测试
            diagnostics::run_doctor,
            diagnostics::test_ai_connection,
            diagnostics::test_channel,
            diagnostics::get_system_info,
            diagnostics::start_channel_login,
            // 安全检测
            diagnostics::run_security_scan,
            diagnostics::fix_security_issues,
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
            // 技能库管理
            config::get_skills_list,
            config::install_skill,
            config::uninstall_skill,
            config::save_skill_config,
            config::install_custom_skill,
            // Agent 管理
            config::get_agents_list,
            config::save_agent,
            config::delete_agent,
            config::set_default_agent,
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时发生错误");
}
