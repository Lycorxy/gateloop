/**
 * architecture-metrics — 架构质量度量器（脚本粗筛，模型精判）
 *
 * 【floor-ceiling 哲学】度量回灌型（发散型）：
 *   - 只输出候选问题清单（facts），不判定好坏
 *   - passed 永远 true（仅 plan 读取失败时 false）
 *   - 模型拿到候选清单后，按 architecture-metrics-checklist.md 逐条精判
 *
 * 【保留原则】只保留模型做不了的：
 *   1. 模块同构性（统计目录频率） ✅
 *   2. 模块规模均衡（数函数算方差） ✅
 *   3. 边界对齐（声明 vs 实际对比） ✅
 *   4. 跨模块共享（交叉比对） ✅
 *   5. 依赖方向（遍历 import） ✅
 *   6. God module（扇入扇出统计） ✅
 *   7. Store 字段过载定位（扫源码找 create()） ✅
 *
 * 【删除项】模型做得更好的：
 *   - 状态分布比例 → 模型一眼能看
 *   - 派生误存（猜 name 关键词） → 模型理解语义更准
 *   - 弹窗在 Store（猜 name 关键词） → 模型理解语义更准
 *   - 共享比例 >50% → 模型一眼能看
 *
 * 用法：nut ads metric architecture --input .specflow/context/current.json [--dir src/]
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, basename, dirname, relative } from 'node:path'
import { glob } from 'glob'
import type { MetricResult, MetricFact } from './types'

interface ArchInput {
    input: string
    dir?: string
}

type JsonData = Record<string, unknown>

// ==================== 主入口 ====================

export function metricArchitecture(input: ArchInput): MetricResult {
    const facts: MetricFact[] = []
    const metrics: Record<string, unknown> = {}

    const plan = readPlan(input.input)
    if (!plan) {
        return failResult(`无法读取 plan: ${input.input}`)
    }

    const moduleBoundary = (plan.moduleBoundary as JsonData[]) || []
    const functionOwnership = (plan.functionOwnership as JsonData[]) || []

    // A. 目录结构合理性（统计类，模型做不了）
    facts.push(...checkModuleStructure(moduleBoundary))
    facts.push(...checkModuleScaleBalance(moduleBoundary, functionOwnership))
    facts.push(...checkBoundaryOwnershipAlignment(moduleBoundary, functionOwnership))

    metrics.moduleCount = moduleBoundary.length

    // B. 耦合性（图遍历类，模型做不了）
    facts.push(...checkCrossModuleSharing(moduleBoundary, functionOwnership))

    let hasSrc = false
    if (input.dir && existsSync(input.dir)) {
        hasSrc = true
        facts.push(...checkImportDirection(input.dir))
        facts.push(...checkFanInOut(input.dir))
        facts.push(...checkStoreFields(input.dir))
    }

    // C. 全局状态合理性 — 删除（模型做得更好）
    // 派生误存/弹窗在Store/状态分布/共享比例 全部交给模型精判

    metrics.srcVerified = hasSrc

    const warnCount = facts.filter((f) => f.severity === 'warn').length
    const summary =
        warnCount === 0
            ? `architecture: ${moduleBoundary.length} 模块，无架构风险信号`
            : `architecture: ${moduleBoundary.length} 模块，${warnCount} 项架构风险信号（度量回灌，模型自评）`

    return {
        passed: true,
        type: 'architecture',
        metrics,
        facts,
        summary
    }
}

// ==================== A. 目录结构合理性 ====================

/** A1. 模块同构性 — 统计目录文件类型频率，找偏离标准结构的模块 */
function checkModuleStructure(moduleBoundary: JsonData[]): MetricFact[] {
    if (moduleBoundary.length < 2) return []

    const moduleFileTypes: Map<string, Set<string>> = new Map()
    for (const mod of moduleBoundary) {
        const file = String(mod.file || '')
        if (!file) continue
        const dir = dirname(file)
        const fileBase = basename(file).replace(/\.(ts|tsx|scss)$/, '')
        if (!moduleFileTypes.has(dir)) {
            moduleFileTypes.set(dir, new Set())
        }
        moduleFileTypes.get(dir)!.add(fileBase)
    }

    const moduleCount = moduleFileTypes.size
    if (moduleCount < 2) return []

    const typeFreq: Record<string, number> = {}
    for (const types of moduleFileTypes.values()) {
        for (const t of types) {
            typeFreq[t] = (typeFreq[t] || 0) + 1
        }
    }

    const standardTypes = Object.entries(typeFreq)
        .filter(([, count]) => count >= moduleCount / 2)
        .map(([t]) => t)
        .sort()

    const deviatingModules: string[] = []
    for (const [dir, types] of moduleFileTypes) {
        const missing = standardTypes.filter((t) => !types.has(t))
        if (missing.length > 0) {
            deviatingModules.push(`${dir}（缺 ${missing.join('/')}）`)
        }
    }

    if (deviatingModules.length > 0) {
        return [
            {
                fact: `模块同构性: ${moduleCount - deviatingModules.length}/${moduleCount} 模块遵循 [${standardTypes.join('+')}] 标准结构，偏离: ${deviatingModules.slice(0, 3).join(', ')}${deviatingModules.length > 3 ? '...' : ''}`,
                severity: 'warn'
            }
        ]
    }
    return [
        {
            fact: `模块同构性: 全部 ${moduleCount} 模块遵循 [${standardTypes.join('+')}] 标准结构`,
            severity: 'info'
        }
    ]
}

/** A2. 模块规模均衡 — 数函数数算方差，找过载模块 */
function checkModuleScaleBalance(
    moduleBoundary: JsonData[],
    functionOwnership: JsonData[]
): MetricFact[] {
    const moduleFns: Record<string, number> = {}
    for (const mod of moduleBoundary) {
        const moduleName = String(mod.responsibility || mod.file || 'unknown')
        moduleFns[moduleName] = 0
    }

    for (const fn of functionOwnership) {
        const fnFile = String(fn.file || '')
        for (const mod of moduleBoundary) {
            const modFile = String(mod.file || '')
            const modDir = dirname(modFile)
            if (fnFile.startsWith(modDir) || fnFile === modFile) {
                const moduleName = String(mod.responsibility || mod.file || 'unknown')
                moduleFns[moduleName] = (moduleFns[moduleName] || 0) + 1
                break
            }
        }
    }

    const counts = Object.values(moduleFns)
    if (counts.length === 0) return []

    const max = Math.max(...counts)
    const min = Math.min(...counts)
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length

    const overloaded = Object.entries(moduleFns)
        .filter(([, count]) => count > avg * 2 && count >= 8)
        .map(([name, count]) => `${name}: ${count} 函数`)

    if (overloaded.length > 0) {
        return [
            {
                fact: `模块规模不均: 最小 ${min} / 最大 ${max} / 平均 ${avg.toFixed(1)}，过载模块: ${overloaded.join(', ')}（>平均2倍且≥8，疑似职责过多）`,
                severity: 'warn'
            }
        ]
    }
    return [
        {
            fact: `模块规模分布: 最小 ${min} / 最大 ${max} / 平均 ${avg.toFixed(1)}`,
            severity: 'info'
        }
    ]
}

/** A3. 模块边界对齐 — moduleBoundary 声明 vs functionOwnership 实际对比 */
function checkBoundaryOwnershipAlignment(
    moduleBoundary: JsonData[],
    functionOwnership: JsonData[]
): MetricFact[] {
    const facts: MetricFact[] = []

    const declaredFiles = new Set(moduleBoundary.map((m) => String(m.file || '')).filter(Boolean))
    const actualFiles = new Set(functionOwnership.map((f) => String(f.file || '')).filter(Boolean))

    const emptyModules = moduleBoundary
        .filter((m) => {
            const file = String(m.file || '')
            return !functionOwnership.some(
                (f) =>
                    String(f.file || '') === file || String(f.file || '').startsWith(dirname(file))
            )
        })
        .map((m) => String(m.file || m.responsibility || 'unknown'))

    if (emptyModules.length > 0) {
        facts.push({
            fact: `空壳模块（声明了文件但无函数归属）: ${emptyModules.slice(0, 3).join(', ')}${emptyModules.length > 3 ? '...' : ''}`,
            severity: 'warn'
        })
    }

    const undeclaredFiles = [...actualFiles].filter((f) => {
        return !moduleBoundary.some((m) => {
            const modDir = dirname(String(m.file || ''))
            return f === String(m.file || '') || f.startsWith(modDir)
        })
    })

    if (undeclaredFiles.length > 0) {
        facts.push({
            fact: `越界文件（有函数归属但 moduleBoundary 未声明）: ${undeclaredFiles.slice(0, 3).join(', ')}${undeclaredFiles.length > 3 ? '...' : ''}`,
            severity: 'warn'
        })
    }

    if (emptyModules.length === 0 && undeclaredFiles.length === 0) {
        facts.push({
            fact: `模块边界对齐: ${declaredFiles.size} 声明文件 = ${actualFiles.size} 实际文件，完全对齐`,
            severity: 'info'
        })
    }

    return facts
}

// ==================== B. 耦合性 ====================

/** B1. 跨模块共享函数 — 一个文件被多个模块引用 */
function checkCrossModuleSharing(
    moduleBoundary: JsonData[],
    functionOwnership: JsonData[]
): MetricFact[] {
    const fileModules: Record<string, Set<string>> = {}
    for (const fn of functionOwnership) {
        const file = String(fn.file || '')
        if (!file) continue
        if (!fileModules[file]) fileModules[file] = new Set()
        for (const mod of moduleBoundary) {
            const modDir = dirname(String(mod.file || ''))
            if (file === String(mod.file || '') || file.startsWith(modDir)) {
                fileModules[file].add(String(mod.responsibility || mod.file || 'unknown'))
                break
            }
        }
    }

    const sharedFiles = Object.entries(fileModules)
        .filter(([, modules]) => modules.size >= 3)
        .map(([file, modules]) => `${file}（${modules.size} 模块共享）`)

    if (sharedFiles.length > 0) {
        return [
            {
                fact: `跨模块共享文件（≥3 模块引用）: ${sharedFiles.join(', ')}——可能是公共工具或耦合点`,
                severity: 'warn'
            }
        ]
    }
    return []
}

/** B2. 依赖方向 — 扫 src 实际 import，检测反向依赖 */
function checkImportDirection(dir: string): MetricFact[] {
    const cwd = process.cwd()

    const layers = [
        { name: 'utils', segments: ['utils'] },
        { name: 'api', segments: ['api', 'services'] },
        { name: 'types', segments: ['types'] },
        { name: 'hooks', segments: ['hooks'] },
        { name: 'components', segments: ['components'] },
        { name: 'pages', segments: ['pages', 'views'] },
        { name: 'app', segments: ['app'] }
    ]

    const tsFiles = glob.sync(join(dir, '**/*.{ts,tsx}').replace(/\\/g, '/'), {
        cwd,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**']
    })

    function findLayerIndex(pathStr: string): number {
        const normalized = pathStr.replace(/\\/g, '/')
        for (let i = 0; i < layers.length; i++) {
            for (const seg of layers[i].segments) {
                if (normalized.includes(`/${seg}/`)) return i
            }
        }
        return -1
    }

    const violations: string[] = []
    for (const file of tsFiles) {
        const relFile = relative(cwd, file).replace(/\\/g, '/')
        const content = safeRead(file)
        const imports = extractImports(content)
        const currentLayerIdx = findLayerIndex(relFile)
        if (currentLayerIdx === -1) continue

        for (const imp of imports) {
            const targetLayerIdx = findLayerIndex(imp)
            if (targetLayerIdx === -1) continue
            if (targetLayerIdx > currentLayerIdx) {
                violations.push(
                    `${layers[currentLayerIdx].name} → ${layers[targetLayerIdx].name}: ${relFile} import ${imp}`
                )
            }
        }
    }

    if (violations.length > 0) {
        return [
            {
                fact: `反向依赖（${violations.length} 处）: ${violations.slice(0, 3).join('; ')}${violations.length > 3 ? '...' : ''}`,
                severity: 'warn'
            }
        ]
    }
    return [
        {
            fact: '依赖方向: 全部正向（utils → hooks → components → pages）',
            severity: 'info'
        }
    ]
}

/** B3. God module — 扇入扇出双高 */
function checkFanInOut(dir: string): MetricFact[] {
    const facts: MetricFact[] = []
    const cwd = process.cwd()

    const tsFiles = glob.sync(join(dir, '**/*.{ts,tsx}').replace(/\\/g, '/'), {
        cwd,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**']
    })

    const moduleImports: Record<string, Set<string>> = {}
    const moduleImportedBy: Record<string, Set<string>> = {}

    for (const file of tsFiles) {
        const relFile = relative(cwd, file).replace(/\\/g, '/')
        const module = dirname(relFile)
        if (!moduleImports[module]) {
            moduleImports[module] = new Set()
            moduleImportedBy[module] = new Set()
        }

        const content = safeRead(file)
        const imports = extractImports(content)
        for (const imp of imports) {
            const targetModule = dirname(imp)
            if (targetModule && targetModule !== module) {
                moduleImports[module].add(targetModule)
                if (!moduleImportedBy[targetModule]) {
                    moduleImportedBy[targetModule] = new Set()
                }
                moduleImportedBy[targetModule].add(module)
            }
        }
    }

    const godModules = Object.keys(moduleImports)
        .filter((m) => (moduleImports[m]?.size || 0) >= 3 && (moduleImportedBy[m]?.size || 0) >= 3)
        .map((m) => `${m}（扇出 ${moduleImports[m].size} / 扇入 ${moduleImportedBy[m].size}）`)

    if (godModules.length > 0) {
        facts.push({
            fact: `God module（扇入≥3 且 扇出≥3）: ${godModules.join(', ')}——可能是耦合中心，考虑拆分`,
            severity: 'warn'
        })
    }

    const highFanOut = Object.entries(moduleImports)
        .filter(([, targets]) => targets.size >= 5)
        .map(([m, targets]) => `${m}（扇出 ${targets.size}）`)
    if (highFanOut.length > 0) {
        facts.push({
            fact: `扇出过高模块（≥5 依赖）: ${highFanOut.join(', ')}`,
            severity: 'warn'
        })
    }

    return facts
}

/** C5. Store 字段过载 — 扫 src 找 Zustand store 定义，统计字段数 */
function checkStoreFields(dir: string): MetricFact[] {
    const facts: MetricFact[] = []
    const cwd = process.cwd()

    const tsFiles = glob.sync(join(dir, '**/*.{ts,tsx}').replace(/\\/g, '/'), {
        cwd,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**']
    })

    for (const file of tsFiles) {
        const content = safeRead(file)
        if (!content.match(/create\s*(?:<[^>]*>)?\s*\(/)) continue

        const relFile = relative(cwd, file).replace(/\\/g, '/')
        const createIdx = content.search(/create\s*(?:<[^>]*>)?\s*\(\s*\(\s*\)\s*=>\s*/)
        if (createIdx === -1) continue

        const afterCreate = content.slice(createIdx)
        const storeBody = extractObjectLiteral(afterCreate)
        if (!storeBody) continue

        const fields = storeBody.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=(]/gm) || []
        const fieldCount = fields.length

        if (fieldCount > 10) {
            facts.push({
                fact: `${relFile} Store 含 ${fieldCount} 个字段（>10 过载）——考虑按领域拆分 store`,
                severity: 'warn',
                location: relFile
            })
        } else if (fieldCount > 0) {
            facts.push({
                fact: `${relFile} Store 含 ${fieldCount} 个字段`,
                severity: 'info',
                location: relFile
            })
        }
    }

    return facts
}

/** 从字符串中提取第一个完整的对象字面量 { ... }（平衡括号匹配） */
function extractObjectLiteral(source: string): string | null {
    let depth = 0
    let startIdx = -1
    for (let i = 0; i < source.length; i++) {
        if (source[i] === '{') {
            if (depth === 0) startIdx = i
            depth++
        } else if (source[i] === '}') {
            depth--
            if (depth === 0 && startIdx !== -1) {
                return source.slice(startIdx + 1, i)
            }
        }
    }
    return null
}

// ==================== 工具函数 ====================

function readPlan(path: string): JsonData | null {
    if (!existsSync(path)) return null
    try {
        const raw = JSON.parse(readFileSync(path, 'utf-8'))
        return (raw.frontendPlan || raw) as JsonData
    } catch {
        return null
    }
}

function safeRead(path: string): string {
    try {
        return readFileSync(path, 'utf-8')
    } catch {
        return ''
    }
}

function extractImports(content: string): string[] {
    const imports: string[] = []
    const regex = /(?:import|export\s+(?:\*|\{[^}]+\})\s+from)\s+['"]([^'"]+)['"]/g
    let match
    while ((match = regex.exec(content)) !== null) {
        const target = match[1]
        if (target.startsWith('.') || target.startsWith('@/')) {
            imports.push(target)
        }
    }
    return imports
}

function failResult(message: string): MetricResult {
    return {
        passed: false,
        type: 'architecture',
        metrics: {},
        facts: [{ fact: message, severity: 'fail' }],
        summary: message
    }
}
