# OpenClaw Gateway API 实现 Chat 对话分析

## Gateway 架构概览

OpenClaw Gateway 是一个 WebSocket 服务，提供：
- Agent 对话管理
- 会话（Session）管理
- 多渠道消息路由
- 认证和授权
- 健康检查和监控

## Gateway 配置

### 配置文件位置
`~/.openclaw/openclaw.json`

### 配置结构
```json
{
  "gateway": {
    "mode": "local",           // local 或 cloud
    "host": "127.0.0.1",       // 绑定地址
    "port": 18789,             // 默认端口
    "auth": {
      "mode": "token",         // none/token/password/trusted-proxy
      "token": "your-token"    // 认证令牌
    }
  }
}
```

## Gateway 启动方式

### 1. 前台运行
```bash
openclaw gateway run
```

### 2. 后台服务
```bash
# 启动服务
openclaw gateway start

# 停止服务
openclaw gateway stop

# 查看状态
openclaw gateway status

# 重启服务
openclaw gateway restart
```

### 3. 开发模式
```bash
openclaw gateway run --dev --port 18789
```

## Gateway API 调用方式

### 方式 1: 通过 CLI 命令（推荐用于测试）

```bash
# 健康检查
openclaw gateway call health --json

# 调用 agent
openclaw agent --agent main --message "你好" --json

# 使用本地模式（不通过 Gateway）
openclaw agent --local --agent main --message "你好"
```

### 方式 2: 通过 WebSocket 连接（推荐用于应用集成）

#### WebSocket 端点
```
ws://localhost:18789
```

#### 连接参数
```json
{
  "auth": {
    "token": "your-gateway-token"
  }
}
```

#### 消息格式（推测）
```json
{
  "method": "agent.run",
  "params": {
    "agent": "main",
    "message": "你好，这是一个测试",
    "sessionId": "optional-session-id"
  },
  "id": "request-id"
}
```

### 方式 3: 通过 HTTP API（如果支持）

Gateway 主要是 WebSocket，但可能支持某些 HTTP 端点：
```bash
curl http://localhost:18789/health
```

## 在 Tauri 应用中实现 Chat

### 架构选择

有三种实现方式：

#### 选项 1: 直接调用 CLI（当前实现）
```rust
// src-tauri/src/commands/chat.rs
pub async fn send_chat_message(message: String) -> Result<String, String> {
    shell::run_openclaw(&["agent", "--local", "--agent", "main", "--message", &message])
}
```

优点：
- 简单直接
- 不需要管理 WebSocket 连接
- 适合简单的请求-响应模式

缺点：
- 每次都启动新进程
- 无法获取流式响应
- 性能较低

#### 选项 2: 通过 Gateway WebSocket（推荐）
```rust
// src-tauri/src/commands/chat.rs
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub async fn send_chat_message(message: String) -> Result<String, String> {
    // 1. 获取 Gateway Token
    let token = get_or_create_gateway_token().await?;
    
    // 2. 连接 WebSocket
    let url = format!("ws://localhost:18789?token={}", token);
    let (ws_stream, _) = connect_async(url).await
        .map_err(|e| format!("连接 Gateway 失败: {}", e))?;
    
    // 3. 发送消息
    let request = json!({
        "method": "agent.run",
        "params": {
            "agent": "main",
            "message": message
        },
        "id": uuid::Uuid::new_v4().to_string()
    });
    
    ws_stream.send(Message::Text(request.to_string())).await?;
    
    // 4. 接收响应
    let response = ws_stream.next().await
        .ok_or("未收到响应")??;
    
    // 5. 解析响应
    // ...
}
```

优点：
- 持久连接，性能好
- 支持流式响应
- 可以接收实时更新

缺点：
- 实现复杂
- 需要管理连接状态
- 需要处理重连逻辑

#### 选项 3: 混合模式（最佳实践）
```rust
// 使用 Gateway 如果可用，否则回退到 CLI
pub async fn send_chat_message(message: String) -> Result<String, String> {
    // 检查 Gateway 是否运行
    if is_gateway_running().await {
        send_via_gateway(message).await
    } else {
        send_via_cli(message).await
    }
}

async fn is_gateway_running() -> bool {
    shell::run_openclaw(&["gateway", "call", "health", "--timeout", "1000"]).is_ok()
}
```

## 实现步骤

### 步骤 1: 确保 Gateway 运行

```rust
// src-tauri/src/commands/chat.rs
async fn ensure_gateway_running() -> Result<(), String> {
    // 检查 Gateway 是否运行
    if shell::run_openclaw(&["health", "--timeout", "2000"]).is_ok() {
        return Ok(());
    }
    
    // 启动 Gateway
    info!("[Chat] Gateway 未运行，正在启动...");
    shell::spawn_openclaw_gateway()
        .map_err(|e| format!("启动 Gateway 失败: {}", e))?;
    
    // 等待 Gateway 就绪
    for _ in 0..10 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if shell::run_openclaw(&["health", "--timeout", "1000"]).is_ok() {
            info!("[Chat] ✓ Gateway 已就绪");
            return Ok(());
        }
    }
    
    Err("Gateway 启动超时".to_string())
}
```

### 步骤 2: 获取 Gateway Token

```rust
// 已在 config.rs 中实现
pub async fn get_or_create_gateway_token() -> Result<String, String>
```

### 步骤 3: 实现 WebSocket 客户端

需要添加依赖到 `Cargo.toml`:
```toml
[dependencies]
tokio-tungstenite = "0.21"
uuid = { version = "1.0", features = ["v4"] }
```

### 步骤 4: 实现流式响应（可选）

```rust
#[command]
pub async fn send_chat_message_stream(
    message: String,
    window: tauri::Window
) -> Result<(), String> {
    // 连接 WebSocket
    // ...
    
    // 接收流式响应
    while let Some(msg) = ws_stream.next().await {
        let text = msg?.to_text()?;
        
        // 发送事件到前端
        window.emit("chat-stream", text)
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}
```

前端监听：
```typescript
import { listen } from '@tauri-apps/api/event';

listen('chat-stream', (event) => {
    const chunk = event.payload;
    // 更新 UI
});
```

## 当前项目中的 Gateway 集成

### 已实现的功能

1. **Gateway Token 管理** (`config.rs`)
   - `get_or_create_gateway_token()` - 获取或创建 token
   - `get_dashboard_url()` - 获取 Dashboard URL

2. **Gateway 服务管理** (`service.rs`)
   - `spawn_openclaw_gateway()` - 启动 Gateway
   - 日志文件路径: `~/.openclaw/logs/gateway.log`

3. **健康检查** (`process.rs`)
   - `check_port_in_use()` - 检查端口占用

### 需要实现的功能

1. **WebSocket 客户端**
   - 连接管理
   - 消息发送/接收
   - 错误处理和重连

2. **会话管理**
   - Session ID 管理
   - 对话历史持久化

3. **流式响应**
   - 实时显示 AI 回复
   - 进度指示

## 推荐实现方案

### 短期方案（快速实现）
继续使用 CLI 方式，但优化：
```rust
pub async fn send_chat_message(message: String) -> Result<String, String> {
    // 确保 Gateway 运行（用于其他功能）
    let _ = ensure_gateway_running().await;
    
    // 使用 CLI 调用（简单可靠）
    shell::run_openclaw(&[
        "agent",
        "--local",
        "--agent", "main",
        "--message", &message
    ])
}
```

### 长期方案（完整功能）
实现 WebSocket 客户端：
1. 添加 WebSocket 依赖
2. 实现连接池管理
3. 支持流式响应
4. 实现会话管理
5. 添加错误重试机制

## 参考资源

- OpenClaw CLI 文档: `openclaw agent --help`
- Gateway 文档: `openclaw gateway --help`
- 健康检查: `openclaw gateway call health --json`
- 配置文件: `~/.openclaw/openclaw.json`
