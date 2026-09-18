#!/usr/bin/env node
/**
 * inventory.mjs — 系统性文件清单（客观输入先行）
 *
 * 扫描指定目录的源文件，按类型判定行数违规，产出机器可验证的 inventory.json。
 * 由 GateLoop verify.produceScripts 调用，模型不参与判断。
 *
 * 用法：
 *   node inventory.mjs --output .specflow/context/inventory.json [--root src] [--ext .ts,.tsx]
 *
 * 违规判定规则（与 frontend-codegen SKILL.md 行数规范对齐）：
 *   .tsx（组件）   → maxLines 120
 *   hooks/use*.ts  → maxLines 150
 *   其他 .ts       → maxLines 360
 *
 * 违规存在也 exit 0（这是清单，不是校验）。
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, extname, relative, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// ==================== 规则 ====================

const RULES = {
    component: { maxLines: 120, test: (p) => p.endsWith('.tsx') },
    hook: {
        maxLines: 150,
        test: (p) => p.endsWith('.ts') && /(^|\/)(hooks\/|use[A-Z])/.test(p)
    },
    util: { maxLines: 360, test: () => true }
}

const IGNORE = ['node_modules', 'dist', '.next', '.specflow', '.codebuddy']

/** 分类文件，返回类型与行数上限（顺序敏感：hook 优先于 util） */
function classify(relPath) {
    if (RULES.hook.test(relPath)) return { type: 'hook', limit: RULES.hook.maxLines }
    if (RULES.component.test(relPath)) return { type: 'component', limit: RULES.component.maxLines }
    return { type: 'util', limit: RULES.util.maxLines }
}

// ==================== 扫描（导出，供 verify-completion 复用） ====================

/**
 * 扫描 root 目录下指定扩展名的文件，返回带违规标记的文件清单
 * @param {string} root 扫描根目录（相对 cwd）
 * @param {string[]} extensions 扩展名列表
 * @returns {Array<{path,lines,type,limit,violated}>} 按行数降序
 */
export function scanInventory(root, extensions = ['.ts', '.tsx']) {
    const files = []

    function walk(dir) {
        let entries
        try {
            entries = readdirSync(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            if (IGNORE.some((ig) => entry.name === ig || entry.name.includes(ig))) continue
            const full = join(dir, entry.name)
            if (entry.isDirectory()) {
                walk(full)
                continue
            }
            if (!extensions.includes(extname(entry.name))) continue
            let content = ''
            try {
                content = readFileSync(full, 'utf8')
            } catch {
                continue
            }
            const lines = content.split('\n').length
            const rel = relative(process.cwd(), full).replace(/\\/g, '/')
            const { type, limit } = classify(rel)
            files.push({ path: rel, lines, type, limit, violated: lines > limit })
        }
    }

    if (existsSync(root)) walk(root)
    return files.sort((a, b) => b.lines - a.lines)
}

// ==================== 产出 inventory.json ====================

function buildPayload(root, files) {
    const violations = files.filter((f) => f.violated).map((f) => f.path)
    const payload = {
        $schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        generatedBy: 'inventory.mjs',
        root,
        totalFiles: files.length,
        rules: {
            component: { maxLines: RULES.component.maxLines },
            hook: { maxLines: RULES.hook.maxLines },
            util: { maxLines: RULES.util.maxLines }
        },
        files,
        violations
    }
    // hash 排除 generatedAt（时间戳不影响内容指纹）
    const hashInput = JSON.stringify({ ...payload, generatedAt: undefined })
    payload.hash = 'sha256:' + createHash('sha256').update(hashInput).digest('hex')
    return payload
}

function parseArgs(argv) {
    const args = { output: '', root: 'src', ext: '.ts,.tsx' }
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--output') args.output = argv[++i]
        else if (a === '--root') args.root = argv[++i]
        else if (a === '--ext') args.ext = argv[++i]
    }
    return args
}

function main() {
    const args = parseArgs(process.argv)
    if (!args.output) {
        console.error('[inventory] 缺少 --output 参数')
        process.exit(1)
    }
    const extensions = args.ext.split(',').map((e) => e.trim())
    const files = scanInventory(args.root, extensions)
    const payload = buildPayload(args.root, files)

    // 确保输出目录存在（.specflow/context 可能尚未创建）
    mkdirSync(dirname(args.output), { recursive: true })
    writeFileSync(args.output, JSON.stringify(payload, null, 2), 'utf8')

    console.log(
        `[inventory] root=${args.root} total=${files.length} violations=${payload.violations.length}`
    )
    console.log(`[inventory] hash=${payload.hash}`)
    console.log(`[inventory] output=${args.output}`)
    process.exit(0)
}

// 仅作为命令行直接执行时运行 main（被 import 时不运行）
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main()
}
