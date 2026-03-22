---
description: 发布新版本到 GitHub（提交代码、创建 tag、触发 CI 构建发布安装包）
---

# 发布新版本流程

## 前置准备

1. 确认所有代码修改已完成并通过编译检查（`cargo check` + `npx tsc --noEmit`）
2. 确认 git remote origin 指向用户自己的仓库（`VillageMoonlight/openclaw-manager`），**不是** upstream（`miaoxworld/openclaw-manager`）
   ```bash
   git remote -v
   # 如果不对，执行：
   git remote set-url origin https://github.com/VillageMoonlight/openclaw-manager.git
   ```

## 步骤 1：确定新版本号

// turbo
```bash
git tag --sort=-v:refname | Select-Object -First 1
```

新版本号 = 当前最大 tag 版本 +1（例如 v0.0.9 → v0.0.10）

## 步骤 2：同步升级三处版本号

必须同时修改以下三个文件中的 version 字段，保持一致：
- `package.json` → `"version": "x.x.x"`
- `src-tauri/tauri.conf.json` → `"version": "x.x.x"`
- `src-tauri/Cargo.toml` → `version = "x.x.x"`

## 步骤 3：提交代码

```bash
git add -A
git commit -m "feat: vX.X.X - 简要功能描述

变更详情:
1. 功能一描述
2. 功能二描述

版本号: X.X.X"
```

## 步骤 4：推送代码到远程（不带 tag）

> [!IMPORTANT]
> **必须先单独推送代码，再单独推送 tag。**
> 如果用 `git push origin main --tags` 一起推送，GitHub Actions 只会触发一次 CI（以 `main` push 事件），
> release job 的 `if: startsWith(github.ref, 'refs/tags/v')` 条件不满足，导致只有源码包没有安装包。

```bash
git push origin main
```

## 步骤 5：创建并单独推送 tag

> [!CAUTION]
> **tag 必须在代码推送成功后，单独推送。** 这样才能触发一个独立的 tag push 事件，让 release job 正确执行。

```bash
git tag -a vX.X.X -m "vX.X.X: 功能描述"
git push origin vX.X.X
```

## 步骤 6：验证 CI 构建和 Release

// turbo
```bash
gh run list --repo VillageMoonlight/openclaw-manager --limit 3
```

确认有一个新的 CI run 正在执行，等待完成后检查 Release：

// turbo
```bash
gh release view vX.X.X --repo VillageMoonlight/openclaw-manager
```

Release 应包含 DMG/MSI/EXE/DEB/AppImage 等安装包文件，而不只是源码。

---

## 常见问题

### ❌ git push 报 403 Permission denied
- 检查 `git remote -v` 是否指向正确的仓库
- 运行 `gh auth status` 确认登录的 GitHub 账号是仓库拥有者
- 如果 Windows 凭据管理器缓存了旧凭据：`cmdkey /delete:git:https://github.com`
- 重新配置：`gh auth setup-git`

### ❌ Release 只有源码包，没有安装包
- 原因：代码和 tag 一起推送导致 CI 只触发了 main push 事件
- 修复：删除远程 tag 后重新单独推送
  ```bash
  git push origin :refs/tags/vX.X.X   # 删除远程 tag
  git push origin vX.X.X              # 重新推送 tag
  ```

### ❌ 已存在的旧 tag 导致 push --tags 失败
- 只推送新 tag：`git push origin vX.X.X`，不要用 `--tags`
