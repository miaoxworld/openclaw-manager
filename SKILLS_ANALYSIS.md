# Skills 技能管理实现分析

## 架构概览

Skills 技能管理采用 **预设定义 + 动态配置** 的混合架构。

## 前端实现 (`src/components/Skills/index.tsx`)

### 核心数据结构

```typescript
interface SkillDefinition {
    id: string;                    // 技能唯一标识
    name: string;                  // 显示名称
    description: string;           // 描述
    icon: string;                  // 图标 emoji
    source: string;                // 来源: builtin/official/community/custom
    version: string | null;        // 版本号
    author: string | null;         // 作者
    package_name: string | null;   // npm 包名
    clawhub_slug: string | null;   // ClawHub slug
    installed: boolean;            // 是否已安装
    enabled: boolean;              // 是否已启用
    config_fields: SkillConfigField[];  // 配置字段定义
    config_values: Record<string, unknown>; // 配置值
    docs_url: string | null;       // 文档链接
    category: string | null;       // 分类
}

interface SkillConfigField {
    key: string;                   // 配置键
    label: string;                 // 显示标签
    field_type: string;            // 字段类型: text/password/select
    placeholder: string | null;    // 占位符
    options: SkillSelectOption[] | null;  // 选项（select 类型）
    required: boolean;             // 是否必填
    default_value: string | null;  // 默认值
    help_text: string | null;      // 帮助文本
}
```

### 主要功能

1. **技能列表展示**
   - 按来源分类（内置/官方/社区/自定义）
   - 显示安装和启用状态
   - 支持搜索和过滤

2. **技能安装**
   - 通过 npm 包名安装
   - 通过 ClawHub slug 安装
   - 支持本地路径安装（自定义）

3. **技能配置**
   - 动态表单生成（基于 config_fields）
   - 支持文本、密码、选择框等字段类型
   - 配置保存到 `~/.openclaw/openclaw.json`

4. **技能启用/禁用**
   - 切换技能启用状态
   - 更新到配置文件

## 后端实现 (`src-tauri/src/commands/config.rs`)

### 核心函数

#### 1. `get_preset_skills()` - 获取预设技能清单

硬编码的技能定义列表，包含：

**内置工具 (builtin)**
- Brave Search - 搜索引擎
- Perplexity Sonar - AI 搜索
- Web Tools - 网页工具
- PDF Tool - PDF 处理
- Firecrawl - 网页爬取

**官方插件 (official)**
- Voice Call - 语音通话
- Microsoft Teams - Teams 集成
- Matrix - Matrix 协议
- Nostr - Nostr 协议

**社区技能 (community)**
- GitHub - GitHub 集成
- Coding Agent - 编程助手
- Google Workspace (GOG) - Google 工作区
- Linear - 项目管理
- Obsidian - 笔记管理
- Playwright Scraper - 网页抓取

#### 2. `get_skills_list()` - 获取技能列表

```rust
pub async fn get_skills_list() -> Result<Vec<SkillDefinition>, String>
```

工作流程：
1. 加载 `openclaw.json` 配置文件
2. 读取 `plugins.entries` 和 `plugins.allow`
3. 执行 `openclaw plugins list` 获取已安装插件
4. 合并预设定义和配置状态
5. 返回完整的技能列表

#### 3. `install_skill()` - 安装技能

```rust
pub async fn install_skill(
    skill_id: String,
    package_name: Option<String>,
    clawhub_slug: Option<String>
) -> Result<String, String>
```

安装方式：
- **npm 包**: `openclaw plugins install <package_name>`
- **ClawHub**: `npx clawhub@latest install <slug>`

安装后自动更新配置文件。

#### 4. `uninstall_skill()` - 卸载技能

```rust
pub async fn uninstall_skill(
    skill_id: String,
    package_name: Option<String>
) -> Result<String, String>
```

执行 `openclaw plugins uninstall` 并更新配置。

#### 5. `save_skill_config()` - 保存技能配置

```rust
pub async fn save_skill_config(
    skill_id: String,
    config: HashMap<String, serde_json::Value>
) -> Result<String, String>
```

将配置保存到 `plugins.entries[skill_id]`。

#### 6. `install_custom_skill()` - 安装自定义技能

支持本地路径或自定义 npm 包。

### 配置文件结构

```json
{
  "plugins": {
    "allow": ["brave-search", "github"],
    "entries": {
      "brave-search": {
        "enabled": true,
        "apiKey": "BSA..."
      },
      "github": {
        "enabled": true,
        "token": "ghp_..."
      }
    },
    "installs": {
      "@openclaw/plugin-github": "^1.0.0"
    }
  }
}
```

## 与 OpenClaw CLI 的集成

Skills 管理完全依赖 OpenClaw CLI：

1. **查询已安装插件**: `openclaw plugins list`
2. **安装插件**: `openclaw plugins install <package>`
3. **卸载插件**: `openclaw plugins uninstall <package>`

配置通过修改 `~/.openclaw/openclaw.json` 实现。

---

# Chat 功能实现方式分析

## 当前状态

❌ **PR-32 中没有独立的 Chat 对话功能**

## 可能的实现方式

基于 Skills 的实现模式，Chat 功能可以采用类似的架构：

### 方式 1: 作为独立页面（推荐）

类似我们之前实现的方式：

```
前端: src/components/Chat/index.tsx
后端: src-tauri/src/commands/chat.rs
调用: openclaw agent --local --message "..."
```

优点：
- 独立功能，易于维护
- 直接调用 OpenClaw CLI
- 用户体验好

### 方式 2: 集成到 Agents 管理

在 Agents 页面添加"测试对话"功能：

```typescript
// 在 Agents 组件中添加
const testAgent = async (agentId: string, message: string) => {
    await invoke('test_agent_chat', { agentId, message });
};
```

后端调用：
```bash
openclaw agent --agent <agentId> --message "..."
```

优点：
- 与 Agent 管理紧密集成
- 可以测试不同 Agent 配置

### 方式 3: 作为 Skill

将 Chat 作为一个内置技能：

```rust
SkillDefinition {
    id: "chat-interface".into(),
    name: "Chat Interface".into(),
    source: "builtin",
    // ...
}
```

缺点：
- Chat 不是插件，是核心功能
- 架构不匹配

## 推荐实现方案

采用 **方式 1**，参考 Skills 的实现模式：

### 前端 (`src/components/Chat/index.tsx`)

```typescript
export function Chat() {
    const [messages, setMessages] = useState<Message[]>([]);
    
    const sendMessage = async (content: string) => {
        const response = await invoke<string>('send_chat_message', {
            message: content
        });
        // 处理响应
    };
}
```

### 后端 (`src-tauri/src/commands/chat.rs`)

```rust
#[command]
pub async fn send_chat_message(message: String) -> Result<String, String> {
    // 调用 openclaw agent --local --message
    shell::run_openclaw(&["agent", "--local", "--message", &message])
}
```

### 注册命令 (`src-tauri/src/main.rs`)

```rust
.invoke_handler(tauri::generate_handler![
    // ... 其他命令
    chat::send_chat_message,
])
```

### 添加路由 (`src/App.tsx`)

```typescript
export type PageType = 'dashboard' | 'ai' | 'agents' | 'channels' | 
                       'skills' | 'chat' | 'testing' | 'logs' | 'security' | 'settings';
```

## 总结

Skills 使用了 **预设定义 + CLI 集成 + 配置管理** 的模式。Chat 功能应该采用类似但更简单的方式，直接调用 `openclaw agent` 命令，不需要复杂的配置管理。
