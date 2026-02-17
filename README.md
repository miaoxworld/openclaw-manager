# 🦞 OpenClaw Manager

高性能跨平台 AI 助手管理工具，基于 **Tauri 2.0 + React + TypeScript + Rust** 构建。

![Platform](https://img.shields.io/badge/platform-macOS%20|%20Windows%20|%20Linux-blue)
![Tauri](https://img.shields.io/badge/Tauri-2.0-orange)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Rust](https://img.shields.io/badge/Rust-1.70+-red)

## 📸 界面预览

### 📊 仪表盘概览

实时监控服务状态，一键管理 AI 助手服务。

![仪表盘](pic/dashboard.png)

- 服务状态实时监控（端口、进程 ID、内存、运行时间）
- 快捷操作：启动 / 停止 / 重启 / 诊断
- 实时日志查看，支持自动刷新

---

### 🤖 AI 模型配置

灵活配置多个 AI 提供商，支持自定义 API 地址。

![AI 配置](pic/ai.png)

- 支持 14+ AI 提供商（Anthropic、OpenAI、DeepSeek、Moonshot、Gemini 等）
- 自定义 API 端点，兼容 OpenAI 格式的第三方服务
- 一键设置主模型，快速切换

---

### 📱 消息渠道配置

连接多种即时通讯平台，打造全渠道 AI 助手。

<table>
  <tr>
    <td width="50%">
      <img src="pic/telegram.png" alt="Telegram 配置">
      <p align="center"><b>Telegram Bot</b></p>
    </td>
    <td width="50%">
      <img src="pic/feishu.png" alt="飞书配置">
      <p align="center"><b>飞书机器人</b></p>
    </td>
  </tr>
</table>

- **Telegram** - Bot Token 配置、私聊/群组策略
- **飞书** - App ID/Secret、WebSocket 连接、多部署区域
- **更多渠道** - Discord、Slack、WhatsApp、iMessage、微信、钉钉

---

## ✨ 功能特性

| 模块 | 功能 |
|------|------|
| 📊 **仪表盘** | 实时服务状态监控、进程内存统计、一键启动/停止/重启 |
| 🤖 **AI 配置** | 14+ AI 提供商、自定义 API 地址、模型快速切换 |
| 📱 **消息渠道** | Telegram、Discord、Slack、飞书、微信、iMessage、钉钉 |
| ⚡ **服务管理** | 后台服务控制、实时日志、开机自启 |
| 🧪 **测试诊断** | 系统环境检查、AI 连接测试、渠道连通性测试 |

## 🍎 macOS 常见问题

### "已损坏，无法打开" 错误

macOS 的 Gatekeeper 安全机制可能会阻止运行未签名的应用。解决方法：

**方法一：移除隔离属性（推荐）**

```bash
# 对 .app 文件执行
xattr -cr /Applications/OpenClaw\ Manager.app

# 或者对 .dmg 文件执行（安装前）
xattr -cr ~/Downloads/OpenClaw-Manager.dmg
```

**方法二：通过系统偏好设置允许**

1. 打开 **系统偏好设置** > **隐私与安全性**
2. 在 "安全性" 部分找到被阻止的应用
3. 点击 **仍要打开**

**方法三：临时禁用 Gatekeeper（不推荐）**

```bash
# 禁用（需要管理员密码）
sudo spctl --master-disable

# 安装完成后重新启用
sudo spctl --master-enable
```

### 权限问题

如果应用无法正常访问文件或执行操作：

**授予完全磁盘访问权限**

1. 打开 **系统偏好设置** > **隐私与安全性** > **完全磁盘访问权限**
2. 点击锁图标解锁，添加 **OpenClaw Manager**

**重置权限**

如果权限设置出现异常，可以尝试重置：

```bash
# 重置辅助功能权限数据库
sudo tccutil reset Accessibility

# 重置完全磁盘访问权限
sudo tccutil reset SystemPolicyAllFiles
```

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18.0
- **Rust** >= 1.70
- **pnpm** (推荐) 或 npm

### macOS 额外依赖

```bash
xcode-select --install
```

### Windows 额外依赖

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### Linux 额外依赖

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libxdo-devel
```

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/miaoxworld/openclaw-manager.git
cd openclaw-manager

# 安装依赖
npm install

# 开发模式运行
npm run tauri:dev

# 构建发布版本
npm run tauri:build
```

## 📁 项目结构

```
openclaw-manager/
├── src-tauri/                 # Rust 后端
│   ├── src/
│   │   ├── main.rs            # 入口
│   │   ├── commands/          # Tauri Commands
│   │   │   ├── service.rs     # 服务管理
│   │   │   ├── config.rs      # 配置管理
│   │   │   ├── process.rs     # 进程管理
│   │   │   └── diagnostics.rs # 诊断功能
│   │   ├── models/            # 数据模型
│   │   └── utils/             # 工具函数
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                       # React 前端
│   ├── App.tsx
│   ├── components/
│   │   ├── Layout/            # 布局组件
│   │   ├── Dashboard/         # 仪表盘
│   │   ├── AIConfig/          # AI 配置
│   │   ├── Channels/          # 渠道配置
│   │   ├── Service/           # 服务管理
│   │   ├── Testing/           # 测试诊断
│   │   └── Settings/          # 设置
│   └── styles/
│       └── globals.css
│
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React 18 | 用户界面 |
| 状态管理 | Zustand | 轻量级状态管理 |
| 样式 | TailwindCSS | 原子化 CSS |
| 动画 | Framer Motion | 流畅动画 |
| 图标 | Lucide React | 精美图标 |
| 后端 | Rust | 高性能系统调用 |
| 跨平台 | Tauri 2.0 | 原生应用封装 |

## 📦 构建产物

运行 `npm run tauri:build` 后，会在 `src-tauri/target/release/bundle/` 生成：

| 平台 | 格式 |
|------|------|
| macOS | `.dmg`, `.app` |
| Windows | `.msi`, `.exe` |
| Linux | `.deb`, `.AppImage` |

## 🎨 设计理念

- **暗色主题**：护眼舒适，适合长时间使用
- **现代 UI**：毛玻璃效果、流畅动画
- **响应式**：适配不同屏幕尺寸
- **高性能**：Rust 后端，极低内存占用

## 🔧 开发命令

```bash
# 开发模式（热重载）
npm run tauri:dev

# 仅运行前端
npm run dev

# 构建前端
npm run build

# 构建完整应用
npm run tauri:build

# 检查 Rust 代码
cd src-tauri && cargo check

# 运行 Rust 测试
cd src-tauri && cargo test
```

## 📝 配置说明

### Tauri 配置 (tauri.conf.json)

- `app.windows` - 窗口配置
- `bundle` - 打包配置
- `plugins.shell.scope` - Shell 命令白名单
- `plugins.fs.scope` - 文件访问白名单

### 环境变量

应用会读取 `~/.openclaw/env` 中的环境变量配置。

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

## 🔗 相关链接

- [OpenClaw Manager](https://github.com/miaoxworld/openclaw-manager) - 图形界面版本（本项目）
- [OpenClawInstaller](https://github.com/miaoxworld/OpenClawInstaller) - 命令行版本
- [Tauri 官方文档](https://tauri.app/)
- [React 官方文档](https://react.dev/)

---

**Made with ❤️ by OpenClaw Team**

---

# 🦞 OpenClaw Manager (English)

A high-performance cross-platform AI assistant management tool, built with **Tauri 2.0 + React + TypeScript + Rust**.

![Platform](https://img.shields.io/badge/platform-macOS%20|%20Windows%20|%20Linux-blue)
![Tauri](https://img.shields.io/badge/Tauri-2.0-orange)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Rust](https://img.shields.io/badge/Rust-1.70+-red)

## 📸 Screenshots

### 📊 Dashboard Overview

Real-time service status monitoring with one-click AI assistant service management.

![Dashboard](pic/dashboard.png)

- Real-time service status monitoring (port, process ID, memory, uptime)
- Quick actions: Start / Stop / Restart / Diagnose
- Live log viewer with auto-refresh support

---

### 🤖 AI Model Configuration

Flexibly configure multiple AI providers with custom API endpoint support.

![AI Config](pic/ai.png)

- 14+ AI providers supported (Anthropic, OpenAI, DeepSeek, Moonshot, Gemini, etc.)
- Custom API endpoints, compatible with OpenAI-format third-party services
- One-click primary model selection with quick switching

---

### 📱 Message Channel Configuration

Connect to multiple messaging platforms to build an omni-channel AI assistant.

<table>
  <tr>
    <td width="50%">
      <img src="pic/telegram.png" alt="Telegram Config">
      <p align="center"><b>Telegram Bot</b></p>
    </td>
    <td width="50%">
      <img src="pic/feishu.png" alt="Feishu Config">
      <p align="center"><b>Feishu Bot</b></p>
    </td>
  </tr>
</table>

- **Telegram** - Bot Token setup, DM/group policies
- **Feishu** - App ID/Secret, WebSocket connection, multi-region deployment
- **More Channels** - Discord, Slack, WhatsApp, iMessage, WeChat, DingTalk

---

## ✨ Features

| Module | Features |
|--------|----------|
| 📊 **Dashboard** | Real-time service status monitoring, process & memory stats, one-click start/stop/restart |
| 🤖 **AI Config** | 14+ AI providers, custom API endpoints, quick model switching |
| 📱 **Channels** | Telegram, Discord, Slack, Feishu, WeChat, iMessage, DingTalk |
| ⚡ **Service Management** | Background service control, live logs, auto-start on boot |
| 🧪 **Testing & Diagnostics** | System environment checks, AI connection tests, channel connectivity tests |

## 🍎 macOS Troubleshooting

### "Damaged and can't be opened" Error

macOS Gatekeeper may block unsigned applications. Solutions:

**Method 1: Remove quarantine attribute (Recommended)**

```bash
# For .app files
xattr -cr /Applications/OpenClaw\ Manager.app

# Or for .dmg files (before installation)
xattr -cr ~/Downloads/OpenClaw-Manager.dmg
```

**Method 2: Allow through System Preferences**

1. Open **System Preferences** > **Privacy & Security**
2. Find the blocked app in the "Security" section
3. Click **Open Anyway**

**Method 3: Temporarily disable Gatekeeper (Not recommended)**

```bash
# Disable (requires admin password)
sudo spctl --master-disable

# Re-enable after installation
sudo spctl --master-enable
```

### Permission Issues

If the app cannot access files or perform operations:

**Grant Full Disk Access**

1. Open **System Preferences** > **Privacy & Security** > **Full Disk Access**
2. Click the lock icon to unlock, then add **OpenClaw Manager**

**Reset Permissions**

If permissions are misconfigured, try resetting:

```bash
# Reset accessibility permissions database
sudo tccutil reset Accessibility

# Reset full disk access permissions
sudo tccutil reset SystemPolicyAllFiles
```

## 🚀 Quick Start

### Requirements

- **Node.js** >= 18.0
- **Rust** >= 1.70
- **pnpm** (recommended) or npm

### macOS Additional Dependencies

```bash
xcode-select --install
```

### Windows Additional Dependencies

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### Linux Additional Dependencies

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libxdo-devel
```

### Installation & Running

```bash
# Clone the project
git clone https://github.com/miaoxworld/openclaw-manager.git
cd openclaw-manager

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build release version
npm run tauri:build
```

## 📁 Project Structure

```
openclaw-manager/
├── src-tauri/                 # Rust Backend
│   ├── src/
│   │   ├── main.rs            # Entry point
│   │   ├── commands/          # Tauri Commands
│   │   │   ├── service.rs     # Service management
│   │   │   ├── config.rs      # Configuration management
│   │   │   ├── process.rs     # Process management
│   │   │   └── diagnostics.rs # Diagnostics
│   │   ├── models/            # Data models
│   │   └── utils/             # Utilities
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── src/                       # React Frontend
│   ├── App.tsx
│   ├── components/
│   │   ├── Layout/            # Layout components
│   │   ├── Dashboard/         # Dashboard
│   │   ├── AIConfig/          # AI configuration
│   │   ├── Channels/          # Channel configuration
│   │   ├── Service/           # Service management
│   │   ├── Testing/           # Testing & diagnostics
│   │   └── Settings/          # Settings
│   └── styles/
│       └── globals.css
│
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## 🛠️ Tech Stack

| Layer | Technology | Description |
|-------|-----------|-------------|
| Frontend Framework | React 18 | User interface |
| State Management | Zustand | Lightweight state management |
| Styling | TailwindCSS | Atomic CSS |
| Animation | Framer Motion | Smooth animations |
| Icons | Lucide React | Beautiful icons |
| Backend | Rust | High-performance system calls |
| Cross-platform | Tauri 2.0 | Native app wrapper |

## 📦 Build Artifacts

After running `npm run tauri:build`, artifacts are generated in `src-tauri/target/release/bundle/`:

| Platform | Format |
|----------|--------|
| macOS | `.dmg`, `.app` |
| Windows | `.msi`, `.exe` |
| Linux | `.deb`, `.AppImage` |

## 🎨 Design Philosophy

- **Dark Theme**: Easy on the eyes, suitable for extended use
- **Modern UI**: Frosted glass effects, smooth animations
- **Responsive**: Adapts to different screen sizes
- **High Performance**: Rust backend with minimal memory footprint

## 🔧 Development Commands

```bash
# Development mode (hot reload)
npm run tauri:dev

# Run frontend only
npm run dev

# Build frontend
npm run build

# Build full application
npm run tauri:build

# Check Rust code
cd src-tauri && cargo check

# Run Rust tests
cd src-tauri && cargo test
```

## 📝 Configuration Notes

### Tauri Configuration (tauri.conf.json)

- `app.windows` - Window configuration
- `bundle` - Bundling configuration
- `plugins.shell.scope` - Shell command allowlist
- `plugins.fs.scope` - File access allowlist

### Environment Variables

The app reads environment variable configuration from `~/.openclaw/env`.

## 🤝 Contributing

1. Fork the project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

## 📄 License

MIT License - See [LICENSE](LICENSE) for details

## 🔗 Links

- [OpenClaw Manager](https://github.com/miaoxworld/openclaw-manager) - GUI version (this project)
- [OpenClawInstaller](https://github.com/miaoxworld/OpenClawInstaller) - CLI version
- [Tauri Documentation](https://tauri.app/)
- [React Documentation](https://react.dev/)

---

**Made with ❤️ by OpenClaw Team**
