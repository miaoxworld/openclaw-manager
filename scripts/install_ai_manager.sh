#!/usr/bin/env bash
# 从 GitHub Releases 下载并安装 AI Manager（Tauri）最新或指定版本。
# macOS：挂载 DMG 并将 .app 安装到 /Applications
# Linux x86_64：优先 .deb（需 dpkg），否则 AppImage 安装到 ~/.local/bin
#
# 用法见 README。环境变量：
#   AI_MANAGER_GITHUB_REPO  默认 tuziapi/openclaw-manager（与 GitHub 重定向兼容）
#   AI_MANAGER_TAG          可选，如 v0.0.15 或 0.0.15；不设则使用 latest
#   GITHUB_TOKEN            可选，降低 api.github.com 未认证速率限制风险

set -euo pipefail

REPO="${AI_MANAGER_GITHUB_REPO:-tuziapi/openclaw-manager}"
TAG="${AI_MANAGER_TAG:-}"
DRY_RUN=0
NO_OPEN=0
PREFER_APPIMAGE=0

usage() {
  cat <<'EOF'
用法: install_ai_manager.sh [选项]

  --dry-run        只打印将下载的 URL 与安装步骤，不执行安装
  --no-open        macOS 安装完成后不自动打开应用
  --repo OWNER/REPO  覆盖 GitHub 仓库（默认 tuziapi/openclaw-manager）
  --tag VERSION    安装指定版本（如 v0.0.15）；默认最新已发布 Release
  --appimage       Linux 下强制使用 AppImage，不用 .deb
  -h, --help       显示本说明

环境变量 AI_MANAGER_TAG、AI_MANAGER_GITHUB_REPO 与上述选项作用相同（命令行优先）。

注意：GitHub 上「草稿」Release 不会出现在 latest；需发布 Release 后脚本才能装到该版本。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --no-open) NO_OPEN=1; shift ;;
    --repo)
      REPO="${2:?missing value for --repo}"
      shift 2
      ;;
    --tag)
      TAG="${2:?missing value for --tag}"
      shift 2
      ;;
    --appimage) PREFER_APPIMAGE=1; shift ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

command -v curl >/dev/null 2>&1 || {
  echo "需要 curl" >&2
  exit 1
}
command -v python3 >/dev/null 2>&1 || {
  echo "需要 python3（用于解析 GitHub API JSON）" >&2
  exit 1
}

if [[ -n "${TAG}" ]]; then
  TAG_NORM="${TAG#v}"
  TAG_NORM="v${TAG_NORM}"
  API_URL="https://api.github.com/repos/${REPO}/releases/tags/${TAG_NORM}"
else
  API_URL="https://api.github.com/repos/${REPO}/releases/latest"
fi

CURL_HEADERS=(-H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  CURL_HEADERS+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

log() {
  printf '%s\n' "$*"
}

fetch_release_json() {
  curl -fsSL "${CURL_HEADERS[@]}" "$API_URL"
}

OS=$(uname -s)
ARCH=$(uname -m)
case "${OS}-${ARCH}" in
  Darwin-arm64 | Darwin-aarch64) PLATFORM="darwin-arm64" ;;
  Darwin-x86_64) PLATFORM="darwin-x64" ;;
  Linux-x86_64 | Linux-amd64) PLATFORM="linux-amd64" ;;
  Linux-aarch64 | Linux-arm64)
    echo "当前脚本未实现 Linux ARM 自动选型；请从 Releases 手动下载对应包。" >&2
    exit 1
    ;;
  *)
    echo "不支持的平台: ${OS} ${ARCH}。Windows 请从 Releases 下载 .msi / .exe。" >&2
    exit 1
    ;;
esac

RELEASE_JSON=$(fetch_release_json)
TMP=$(mktemp -d)
trap 'rm -rf "${TMP}"' EXIT

REL_JSON="${TMP}/release.json"
printf '%s' "$RELEASE_JSON" > "${REL_JSON}"

DOWNLOAD_URL=$(
  python3 - "${REL_JSON}" "${PLATFORM}" "${PREFER_APPIMAGE}" <<'PY'
import json, sys

path, platform, prefer = sys.argv[1], sys.argv[2], sys.argv[3]
prefer_appimage = prefer == "1"
with open(path, encoding="utf-8") as f:
    data = json.load(f)

if data.get("draft"):
    print("错误: 该 Release 仍为草稿（draft），请先发布 Release。", file=sys.stderr)
    sys.exit(1)

assets = data.get("assets") or []
pairs = [(a["name"], a["browser_download_url"]) for a in assets if a.get("browser_download_url")]


def first(pred):
    for name, url in pairs:
        if pred(name):
            return url
    return None


def pick_darwin_arm64():
    u = first(lambda n: n.endswith("_universal.dmg"))
    if u:
        return u
    return first(lambda n: n.endswith("_aarch64.dmg"))


def pick_darwin_x64():
    u = first(lambda n: n.endswith("_universal.dmg"))
    if u:
        return u
    for suf in ("_x64.dmg", "_x86_64.dmg", "_amd64.dmg"):
        u = first(lambda n, s=suf: n.endswith(s))
        if u:
            return u
    return None


def pick_linux_amd64():
    if not prefer_appimage:
        u = first(lambda n: "amd64" in n and n.endswith(".deb"))
        if u:
            return u
    u = first(lambda n: "amd64" in n and n.endswith(".AppImage"))
    if u:
        return u
    return first(lambda n: n.endswith(".AppImage"))


if platform == "darwin-arm64":
    url = pick_darwin_arm64()
elif platform == "darwin-x64":
    url = pick_darwin_x64()
elif platform == "linux-amd64":
    url = pick_linux_amd64()
else:
    url = None

if not url:
    print("错误: 未在 Release 中找到适合当前平台的安装包。", file=sys.stderr)
    sys.exit(1)
print(url)
PY
)

FILENAME=$(basename "${DOWNLOAD_URL%%\?*}")

DEST="${TMP}/${FILENAME}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "[dry-run] API: ${API_URL}"
  log "[dry-run] 将下载: ${DOWNLOAD_URL}"
  log "[dry-run] 保存为: ${DEST}"
  log "[dry-run] 平台: ${PLATFORM}"
  exit 0
fi

log "下载: ${FILENAME}"
curl -fL --progress-bar -o "${DEST}" "${DOWNLOAD_URL}"

install_macos_dmg() {
  local dmg="$1"
  local mnt
  mnt=$(mktemp -d "${TMP}/mnt.XXXXXX")
  hdiutil attach -nobrowse -quiet -mountpoint "${mnt}" "${dmg}"
  trap 'hdiutil detach -quiet "${mnt}" 2>/dev/null || true; rm -rf "${TMP}"' EXIT

  local app_path
  app_path=$(find "${mnt}" -maxdepth 2 -name "*.app" -print | head -1)
  if [[ -z "${app_path}" ]]; then
    echo "错误: DMG 内未找到 .app" >&2
    exit 1
  fi
  local app_name
  app_name=$(basename "${app_path}")
  log "安装到 /Applications/${app_name}"
  rm -rf "/Applications/${app_name}"
  cp -R "${app_path}" /Applications/
  hdiutil detach -quiet "${mnt}"
  trap 'rm -rf "${TMP}"' EXIT
  if command -v xattr >/dev/null 2>&1; then
    xattr -cr "/Applications/${app_name}" 2>/dev/null || true
  fi
  log "安装完成: /Applications/${app_name}"
  if [[ "$NO_OPEN" -eq 0 ]]; then
    open "/Applications/${app_name}"
  fi
}

install_linux_deb() {
  local deb="$1"
  if [[ "$(id -u)" -eq 0 ]]; then
    dpkg -i "${deb}" || apt-get install -y -f
  else
    log "需要 root 权限安装 .deb，将使用 sudo"
    sudo dpkg -i "${deb}" || sudo apt-get install -y -f
  fi
  log ".deb 安装完成。请在应用程序菜单中启动 AI Manager（或 OpenClaw Manager）。"
}

install_linux_appimage() {
  local ai="$1"
  chmod +x "${ai}"
  local bin_dir="${HOME}/.local/bin"
  mkdir -p "${bin_dir}"
  local target="${bin_dir}/ai-manager.AppImage"
  cp -f "${ai}" "${target}"
  log "AppImage 已安装: ${target}"
  log "运行: ${target}"
  if [[ "$NO_OPEN" -ne 0 ]]; then
    return 0
  fi
  if [[ -z "${DISPLAY:-}" ]] && [[ -z "${WAYLAND_DISPLAY:-}" ]]; then
    log "（当前无图形会话，请在本机桌面终端中运行上述命令）"
  else
    nohup "${target}" >/dev/null 2>&1 &
    log "已在后台尝试启动（若失败请手动运行上述路径）。"
  fi
}

case "${FILENAME}" in
  *.dmg)
    install_macos_dmg "${DEST}"
    ;;
  *.deb)
    install_linux_deb "${DEST}"
    ;;
  *.AppImage)
    install_linux_appimage "${DEST}"
    ;;
  *)
    echo "错误: 不支持的文件类型: ${FILENAME}" >&2
    exit 1
    ;;
esac
