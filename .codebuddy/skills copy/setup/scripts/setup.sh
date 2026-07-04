#!/bin/bash
# ==============================================================================
# Specflow 项目一键初始化脚本 v2.0
# 用法：bash .codebuddy/skills/setup/scripts/setup.sh
# 修复：pnpm store 冲突 / mcp.json BOM 问题 / 并行安装 wait bug
# ==============================================================================

set -uo pipefail

TENCENT_REGISTRY="https://mirrors.tencent.com/npm/"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"

echo "========================================"
echo "  Specflow 项目初始化 v2.0"
echo "  项目路径: ${PROJECT_ROOT}"
echo "========================================"
echo ""

# ==============================================================================
# Step 1：环境检测
# ==============================================================================
echo "[CHECK] 检测环境..."

# Node.js（必须）
if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    echo "  ✅ Node.js: ${NODE_VER}"
else
    echo "  ❌ Node.js 未安装，请先安装 Node.js >= 18"
    exit 1
fi

# pnpm（自动安装）
if command -v pnpm &>/dev/null; then
    PNPM_VER=$(pnpm --version)
    echo "  ✅ pnpm: ${PNPM_VER}"
else
    echo "  ⚠️  pnpm 未安装，正在通过 npm 安装..."
    npm install -g pnpm --registry="${TENCENT_REGISTRY}" || npm install -g pnpm
    if command -v pnpm &>/dev/null; then
        echo "  ✅ pnpm 安装完成: $(pnpm --version)"
    else
        echo "  ❌ pnpm 安装失败，请手动执行: npm install -g pnpm"
        exit 1
    fi
fi

# Go（可选）
if command -v go &>/dev/null; then
    GO_VER=$(go version | awk '{print $3}')
    echo "  ✅ Go: ${GO_VER}"
else
    echo "  ℹ️  Go 未安装（仅后端开发需要）"
fi

echo ""

# ==============================================================================
# Step 2：修复 pnpm store 冲突（关键！）
# ==============================================================================
echo "[PNPM] 检查 pnpm store 配置..."

# 检测 pnpm 全局 node_modules 实际指向的 store
PNPM_GLOBAL_DIR=$(pnpm root -g 2>/dev/null | head -1 || echo "")
PNPM_STORE_DIR=$(pnpm config get store-dir 2>/dev/null | head -1 || echo "")

echo "  全局包目录: ${PNPM_GLOBAL_DIR}"
echo "  当前 store: ${PNPM_STORE_DIR}"

# 检测 store 冲突（通过尝试 pnpm list -g 是否报 ERR_PNPM_UNEXPECTED_STORE）
STORE_CHECK=$(pnpm list -g --depth=0 2>&1 | head -3 || true)
if echo "${STORE_CHECK}" | grep -q "ERR_PNPM_UNEXPECTED_STORE"; then
    echo "  ⚠️  检测到 pnpm store 冲突，自动修复..."
    # 获取 node_modules 实际链接的 store 路径
    ACTUAL_STORE=$(echo "${STORE_CHECK}" | grep "linked from the store at" | sed 's/.*linked from the store at "\(.*\)".*/\1/' || echo "")
    if [ -n "${ACTUAL_STORE}" ]; then
        echo "  → 恢复 store 路径为: ${ACTUAL_STORE}"
        pnpm config set store-dir "${ACTUAL_STORE}" --global
        echo "  ✅ pnpm store 冲突已修复"
    else
        # 无法自动检测，使用默认路径
        DEFAULT_STORE="${HOME}/.local/share/pnpm/store/v3"
        if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || -n "${APPDATA:-}" ]]; then
            DEFAULT_STORE="${LOCALAPPDATA:-$HOME/AppData/Local}/pnpm/store/v3"
        fi
        echo "  → 无法自动检测旧 store，重置为默认: ${DEFAULT_STORE}"
        pnpm config set store-dir "${DEFAULT_STORE}" --global
        echo "  ✅ pnpm store 已重置"
    fi
else
    echo "  ✅ pnpm store 配置正常"
fi

echo ""

# ==============================================================================
# Step 3：安装全局 MCP
# ==============================================================================
echo "[MCP] 安装全局 @tencent/specflow-mcp..."

# 检查是否已安装
ALREADY_INSTALLED=$(pnpm list -g @tencent/specflow-mcp --depth=0 2>/dev/null | grep "specflow-mcp" || true)
if [ -n "${ALREADY_INSTALLED}" ]; then
    echo "  ℹ️  已安装，检查是否需要更新..."
fi

# 安装/更新（使用 pnpm，避免 npm 与 pnpm 混用）
if pnpm add -g @tencent/specflow-mcp \
    --registry="${TENCENT_REGISTRY}" \
    2>&1 | tail -3; then
    echo "  ✅ @tencent/specflow-mcp 安装/更新成功"
else
    echo "  ⚠️  pnpm 安装失败，尝试 npm..."
    npm install -g @tencent/specflow-mcp \
        --registry="${TENCENT_REGISTRY}" \
        --@tencent:registry="${TENCENT_REGISTRY}" \
        2>&1 | tail -3 || echo "  ❌ npm 安装也失败，请检查网络或 npm 源"
fi

# 验证 5 个 MCP 命令可用性
echo ""
echo "  验证 MCP 命令..."
MCP_CMDS=("specflow-mcp-orchestrator" "specflow-mcp-graph" "specflow-mcp-code" "specflow-mcp-knowledge" "specflow-mcp-memory")
MCP_ALL_OK=1
for cmd in "${MCP_CMDS[@]}"; do
    if command -v "${cmd}" &>/dev/null; then
        echo "  ✅ ${cmd}"
    else
        echo "  ⚠️  ${cmd} 不可用（请检查 PATH 是否包含 pnpm 全局 bin 目录）"
        MCP_ALL_OK=0
    fi
done

if [ ${MCP_ALL_OK} -eq 0 ]; then
    # 提示 pnpm 全局 bin 路径
    PNPM_BIN=$(pnpm bin -g 2>/dev/null || echo "未知")
    echo ""
    echo "  ⚠️  部分命令不可用，请将以下路径加入 PATH："
    echo "     ${PNPM_BIN}"
    echo "  Windows PowerShell: \$env:PATH += ';${PNPM_BIN}'"
    echo "  Linux/macOS: export PATH=\"\$PATH:${PNPM_BIN}\""
fi

echo ""

# ==============================================================================
# Step 4：配置 IDE MCP（写入 mcp.json，使用 Node.js 避免 BOM 问题）
# ==============================================================================
echo "[CONFIG] 配置 IDE MCP..."

# 自动检测 mcp.json 路径（支持多种 IDE）
MCP_CONFIG_PATHS=()

# CodeBuddy / 工蜂
if [ -d "${HOME}/.gongfeng-copilot" ]; then
    MCP_CONFIG_PATHS+=("${HOME}/.gongfeng-copilot/mcp.json")
fi
# Windows CodeBuddy（APPDATA 路径）
if [ -n "${APPDATA:-}" ] && [ -d "${APPDATA}/.gongfeng-copilot" ]; then
    MCP_CONFIG_PATHS+=("${APPDATA}/.gongfeng-copilot/mcp.json")
fi
# Cursor
if [ -d "${HOME}/.cursor" ]; then
    MCP_CONFIG_PATHS+=("${HOME}/.cursor/mcp.json")
fi
# Claude Desktop（macOS）
if [ -d "${HOME}/Library/Application Support/Claude" ]; then
    MCP_CONFIG_PATHS+=("${HOME}/Library/Application Support/Claude/claude_desktop_config.json")
fi

# MCP 配置内容（5 个独立 server）
MCP_JSON_CONTENT='{
  "mcpServers": {
    "specflow-orchestrator": {
      "command": "specflow-mcp-orchestrator",
      "args": []
    },
    "specflow-graph": {
      "command": "specflow-mcp-graph",
      "args": []
    },
    "specflow-code": {
      "command": "specflow-mcp-code",
      "args": []
    },
    "specflow-knowledge": {
      "command": "specflow-mcp-knowledge",
      "args": []
    },
    "specflow-memory": {
      "command": "specflow-mcp-memory",
      "args": []
    }
  }
}'

if [ ${#MCP_CONFIG_PATHS[@]} -eq 0 ]; then
    echo "  ℹ️  未检测到已知 IDE 配置目录，跳过自动配置"
    echo "  请手动将以下内容写入 IDE 的 mcp.json："
    echo "${MCP_JSON_CONTENT}"
else
    for config_path in "${MCP_CONFIG_PATHS[@]}"; do
        config_dir=$(dirname "${config_path}")
        mkdir -p "${config_dir}" 2>/dev/null || true

        # ⚠️ 关键：使用 Node.js 写入，避免 PowerShell Set-Content 产生 BOM
        # BOM（U+FEFF）会导致 JSON 解析失败：Unexpected token '﻿'
        if node -e "
const fs = require('fs');
const content = JSON.stringify(JSON.parse(\`${MCP_JSON_CONTENT}\`), null, 2);
fs.writeFileSync('${config_path}', content, { encoding: 'utf8' });
// 验证无 BOM
const raw = fs.readFileSync('${config_path}');
if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
  throw new Error('BOM detected!');
}
console.log('OK');
" 2>/dev/null | grep -q "OK"; then
            echo "  ✅ 已写入: ${config_path}"
        else
            echo "  ⚠️  写入失败: ${config_path}（请手动配置）"
        fi
    done
fi

echo ""

# ==============================================================================
# Step 5：安装项目依赖（并行，修复 wait 顺序 bug）
# ==============================================================================
echo "[DEPS] 安装项目依赖..."

PIDS=()
LABELS=()
RESULTS=()

# 根目录
if [ -f "${PROJECT_ROOT}/package.json" ]; then
    echo "  → 安装根目录依赖..."
    (cd "${PROJECT_ROOT}" && pnpm install 2>&1) &
    PIDS+=($!)
    LABELS+=("根目录")
fi

# 前端
if [ -f "${PROJECT_ROOT}/client/package.json" ]; then
    echo "  → 安装前端依赖 (client/)..."
    (cd "${PROJECT_ROOT}/client" && pnpm install 2>&1) &
    PIDS+=($!)
    LABELS+=("前端(client)")
fi

# 文档站（可选）
if [ -f "${PROJECT_ROOT}/dockit/package.json" ]; then
    echo "  → 安装文档站依赖 (dockit/)..."
    (cd "${PROJECT_ROOT}/dockit" && pnpm install 2>&1) &
    PIDS+=($!)
    LABELS+=("文档站(dockit)")
fi

# 等待所有并行任务，收集结果（修复：先记录 PID 再 wait，避免顺序错乱）
for i in "${!PIDS[@]}"; do
    if wait "${PIDS[$i]}"; then
        echo "  ✅ ${LABELS[$i]} 安装完成"
    else
        echo "  ❌ ${LABELS[$i]} 安装失败（可尝试手动执行 pnpm install --no-frozen-lockfile）"
    fi
done

echo ""

# ==============================================================================
# 完成
# ==============================================================================
echo "========================================"
echo "  ✅ 依赖安装完成！"
echo "========================================"
echo ""
echo "  下一步："
echo "  1. 重启 IDE 使 MCP 配置生效"
echo "  2. 在 AI 对话中执行 /setup 完成知识库初始化"
echo "  3. 执行 pnpm dev 启动开发服务"
echo ""
