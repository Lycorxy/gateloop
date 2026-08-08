/**
 * code-metrics — 循环依赖 + 热点模块（图遍历类，模型做不了）
 *
 * 【floor-ceiling 哲学】发散型（只回灌事实，不 fail）
 *   - 循环依赖：DFS 图遍历，模型做不了
 *   - 热点模块：统计引用数，模型容易算错
 *
 * 删减说明（v2）：
 *   - 文件 >360 行 → fileSize 已校验，删除
 *
 * 用法：nut ads metric code --dir src/
 */

import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { glob } from 'glob'
import type { MetricResult, MetricFact } from './types'

interface CodeInput {
    dir: string
}

interface FileInfo {
    path: string
    imports: string[]
}

export function metricCode(input: CodeInput): MetricResult {
    const cwd = process.cwd()
    const targetDir = input.dir
    const facts: MetricFact[] = []

    // 1. 扫描所有 TS/TSX 文件
    const tsPattern = join(targetDir, '**/*.{ts,tsx}').replace(/\\/g, '/')
    const files = glob.sync(tsPattern, { cwd, absolute: true, ignore: ['**/node_modules/**', '**/dist/**'] })

    if (files.length === 0) {
        return {
            passed: true,
            type: 'code',
            metrics: { files: 0 },
            facts: [{ fact: `目录 ${targetDir} 下未找到 .ts/.tsx 文件`, severity: 'info' }],
            summary: 'code-metrics: 跳过（无 TS 文件）'
        }
    }

    // 2. 解析每个文件的 import
    const fileInfos: FileInfo[] = []
    for (const file of files) {
        const rel = relative(cwd, file).replace(/\\/g, '/')
        const content = safeRead(file)
        fileInfos.push({
            path: rel,
            imports: extractImports(content, rel)
        })
    }

    // 3. 循环依赖检测（DFS 图遍历，模型做不了）
    const importGraph = buildImportGraph(fileInfos)
    const cycles = detectCycles(importGraph)

    for (const cycle of cycles) {
        facts.push({
            fact: `循环依赖: ${cycle.join(' → ')} → ${cycle[0]}`,
            severity: 'warn'
        })
    }

    // 4. 热点模块（被引用 ≥5 次，模型容易算错）
    const refCount: Record<string, number> = {}
    for (const f of fileInfos) {
        for (const imp of f.imports) {
            refCount[imp] = (refCount[imp] || 0) + 1
        }
    }

    const hotModules = Object.entries(refCount)
        .filter(([, count]) => count >= 5)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([mod, count]) => `${mod} (${count} 引用)`)

    if (hotModules.length > 0) {
        facts.push({
            fact: `热点模块（被引用 ≥5 次）: ${hotModules.join(', ')}`,
            severity: 'info'
        })
    }

    // 5. 客观事实汇总
    facts.push({
        fact: `${fileInfos.length} 文件 / ${cycles.length} 循环依赖 / ${hotModules.length} 热点模块`,
        severity: 'info'
    })

    const summary = `code-metrics: ${fileInfos.length} 文件 / ${cycles.length} 循环依赖 / ${hotModules.length} 热点模块`

    return {
        passed: true, // 发散型永远 true，只回灌事实
        type: 'code',
        metrics: {
            files: fileInfos.length,
            cycles: cycles.length,
            hotModules: hotModules.length
        },
        facts,
        summary
    }
}

function safeRead(path: string): string {
    try {
        return readFileSync(path, 'utf-8')
    } catch {
        return ''
    }
}

/** 从源码提取 import 路径（仅相对路径和 @/ 别名） */
function extractImports(content: string, currentFile: string): string[] {
    const imports: string[] = []
    const regex = /(?:import|export\s+(?:\*|\{[^}]+\})\s+from)\s+['"]([^'"]+)['"]/g
    let match
    while ((match = regex.exec(content)) !== null) {
        const target = match[1]
        if (target.startsWith('.') || target.startsWith('@/')) {
            imports.push(resolveImportPath(target, currentFile))
        }
    }
    return imports
}

/**
 * 把 import 路径解析成与文件路径对齐的模块标识
 *   import "@/utils/helpers" → "src/utils/helpers"
 *   import "./helpers" from "src/utils/index.ts" → "src/utils/helpers"
 */
function resolveImportPath(importPath: string, currentFile: string): string {
    const normalized = importPath.replace(/\\/g, '/')

    if (normalized.startsWith('@/')) {
        return 'src/' + normalized.slice(2).replace(/\.(ts|tsx|js|jsx|scss|css)$/, '')
    }

    const dir = currentFile.split('/').slice(0, -1).join('/')
    const resolved = join(dir, normalized).replace(/\\/g, '/')
    return resolved.replace(/\.(ts|tsx|js|jsx|scss|css)$/, '')
}

function buildImportGraph(files: FileInfo[]): Map<string, string[]> {
    const graph = new Map<string, string[]>()
    for (const f of files) {
        const key = f.path.replace(/\.(ts|tsx|js|jsx)$/, '')
        const normalizedImports = f.imports.map(imp => imp.replace(/\.(ts|tsx|js|jsx|scss|css)$/, ''))
        graph.set(key, normalizedImports)
    }
    return graph
}

/** DFS 检测循环依赖 */
function detectCycles(graph: Map<string, string[]>): string[][] {
    const cycles: string[][] = []
    const visited = new Set<string>()
    const stack: string[] = []
    const onStack = new Set<string>()

    function dfs(node: string): void {
        if (onStack.has(node)) {
            const startIdx = stack.indexOf(node)
            if (startIdx !== -1) {
                cycles.push([...stack.slice(startIdx), node])
            }
            return
        }
        if (visited.has(node)) return

        visited.add(node)
        onStack.add(node)
        stack.push(node)

        const neighbors = graph.get(node) || []
        for (const next of neighbors) {
            dfs(next)
        }

        stack.pop()
        onStack.delete(node)
    }

    for (const node of graph.keys()) {
        if (!visited.has(node)) dfs(node)
    }

    return cycles
}
