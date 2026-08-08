/**
 * 文件规模验证器 — 独立于 ESLint，直接检查文件行数/函数行数/圈复杂度
 *
 * 即使 ESLint 没配 max-lines / max-lines-per-function / complexity 规则，
 * 此验证器仍能独立检查。接入 ADS verify 后，nut ads next 强制执行。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { glob } from 'glob'

// ==================== 类型定义 ====================

export interface FileSizeConfig {
    /** 单文件最大行数，默认 360 */
    maxFileLines?: number
    /** 单函数最大行数，默认 25 */
    maxFunctionLines?: number
    /** 最大圈复杂度，默认 10 */
    maxComplexity?: number
}

export interface FileSizeViolation {
    file: string
    type: 'file-lines' | 'function-lines' | 'complexity'
    line: number
    actual: number
    limit: number
    message: string
}

export interface FileSizeResult {
    passed: boolean
    violations: FileSizeViolation[]
    checkedFiles: number
}

// ==================== 默认配置 ====================

const DEFAULTS: Required<FileSizeConfig> = {
    maxFileLines: 360,
    maxFunctionLines: 25,
    maxComplexity: 10
}

// ==================== 主入口 ====================

/**
 * 检查文件规模
 *
 * @param patterns glob 模式
 * @param cwd 工作目录
 * @param config 规模限制配置
 */
export function checkFileSize(
    patterns: string | string[],
    cwd: string = process.cwd(),
    config?: FileSizeConfig
): FileSizeResult {
    const limits = { ...DEFAULTS, ...config }
    const patternArray = Array.isArray(patterns) ? patterns : [patterns]
    const violations: FileSizeViolation[] = []
    let checkedFiles = 0

    for (const pattern of patternArray) {
        const files = glob.sync(pattern, { cwd, absolute: true })
        for (const filePath of files) {
            checkedFiles++
            const ext = filePath.split('.').pop()
            if (!ext || !['ts', 'tsx', 'js', 'jsx', 'scss', 'css'].includes(ext)) continue

            try {
                const content = readFileSync(filePath, 'utf-8')
                const relPath = filePath.replace(cwd + join('', ''), '').replace(/\\/g, '/')
                const fileViolations = analyzeFile(content, relPath, limits)
                violations.push(...fileViolations)
            } catch {
                // 读取失败跳过
            }
        }
    }

    return {
        passed: violations.length === 0,
        violations,
        checkedFiles
    }
}

// ==================== 文件分析 ====================

/**
 * 分析单个文件：文件行数 + 函数行数 + 圈复杂度
 */
function analyzeFile(
    content: string,
    relPath: string,
    limits: Required<FileSizeConfig>
): FileSizeViolation[] {
    const violations: FileSizeViolation[] = []
    const lines = content.split('\n')

    // 1. 文件总行数
    const fileLines = lines.length
    if (fileLines > limits.maxFileLines) {
        violations.push({
            file: relPath,
            type: 'file-lines',
            line: fileLines,
            actual: fileLines,
            limit: limits.maxFileLines,
            message: `${relPath}: ${fileLines} 行超过上限 ${limits.maxFileLines} 行`
        })
    }

    // 2. 函数行数 + 圈复杂度
    const functions = extractFunctions(content)
    for (const fn of functions) {
        const fnLines = fn.endLine - fn.startLine + 1
        if (fnLines > limits.maxFunctionLines) {
            violations.push({
                file: relPath,
                type: 'function-lines',
                line: fn.startLine,
                actual: fnLines,
                limit: limits.maxFunctionLines,
                message: `${relPath}:${fn.startLine} 函数 ${fn.name || '(anon)'} ${fnLines} 行超过上限 ${limits.maxFunctionLines} 行`
            })
        }

        const complexity = calculateComplexity(fn.body)
        if (complexity > limits.maxComplexity) {
            violations.push({
                file: relPath,
                type: 'complexity',
                line: fn.startLine,
                actual: complexity,
                limit: limits.maxComplexity,
                message: `${relPath}:${fn.startLine} 函数 ${fn.name || '(anon)'} 圈复杂度 ${complexity} 超过上限 ${limits.maxComplexity}`
            })
        }
    }

    return violations
}

// ==================== 函数提取 ====================

interface ExtractedFunction {
    name: string
    startLine: number
    endLine: number
    body: string
}

/**
 * 提取文件中所有函数（简化实现：正则 + 大括号匹配）
 */
function extractFunctions(content: string): ExtractedFunction[] {
    const functions: ExtractedFunction[] = []

    // 匹配函数定义的起始位置
    // function name(...) {
    // const name = (...) => {
    // const name = function(...) {
    // const name = () => {
    // name(...) {
    // async function name(...) {
    const fnStartRegex =
        /(?:export\s+)?(?:async\s+)?(?:function\s+([a-zA-Z_$][\w$]*)|(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>|function\s*([a-zA-Z_$][\w$]*)\s*\([^)]*\)|(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?function)/g

    let match: RegExpExecArray | null
    while ((match = fnStartRegex.exec(content)) !== null) {
        const name = match[1] || match[2] || match[3] || match[4] || '(anon)'
        const startOffset = match.index

        // 找到第一个 `{` 作为函数体开始
        const braceIdx = content.indexOf('{', startOffset)
        if (braceIdx === -1) continue

        // 用大括号栈匹配函数体结束位置
        const endOffset = findMatchingBrace(content, braceIdx)
        if (endOffset === -1) continue

        const startLine = offsetToLine(content, startOffset)
        const endLine = offsetToLine(content, endOffset)
        const body = content.slice(braceIdx + 1, endOffset)

        functions.push({ name, startLine, endLine, body })
    }

    return functions
}

/**
 * 从指定 `{` 位置开始，找到匹配的 `}`
 */
function findMatchingBrace(content: string, startIdx: number): number {
    let depth = 0
    const state: SkipState = {
        inString: false,
        stringChar: '',
        inComment: false,
        inLineComment: false
    }

    for (let i = startIdx; i < content.length; i++) {
        const ch = content[i]
        const next = content[i + 1]
        const prev = content[i - 1]

        if (updateSkipState(state, ch, next, prev)) continue
        if (state.inString || state.inComment || state.inLineComment) continue

        if (ch === '{') depth++
        if (ch === '}' && --depth === 0) return i
    }

    return -1
}

/** 跳过状态 */
interface SkipState {
    inString: boolean
    stringChar: string
    inComment: boolean
    inLineComment: boolean
}

/** 更新跳过状态，返回该字符是否被消耗 */
function updateSkipState(state: SkipState, ch: string, next: string, prev: string): boolean {
    if (handleLineComment(state, ch, next)) return true
    if (state.inLineComment) {
        if (ch === '\n') state.inLineComment = false
        return true
    }
    if (handleBlockComment(state, ch, next)) return true
    if (state.inComment) return true
    if (handleString(state, ch, prev)) return true
    if (state.inString) return true
    return false
}

/** 行注释状态更新 */
function handleLineComment(state: SkipState, ch: string, next: string): boolean {
    if (state.inString || state.inComment || state.inLineComment) return false
    if (ch === '/' && next === '/') {
        state.inLineComment = true
        return true
    }
    return false
}

/** 块注释状态更新 */
function handleBlockComment(state: SkipState, ch: string, next: string): boolean {
    if (state.inString || state.inLineComment) return false
    if (state.inComment && ch === '*' && next === '/') {
        state.inComment = false
        return true
    }
    if (!state.inComment && ch === '/' && next === '*') {
        state.inComment = true
        return true
    }
    return false
}

/** 字符串状态更新 */
function handleString(state: SkipState, ch: string, prev: string): boolean {
    if (!isQuote(ch)) return false
    if (!state.inString) {
        state.inString = true
        state.stringChar = ch
        return true
    }
    if (ch === state.stringChar && prev !== '\\') {
        state.inString = false
        return true
    }
    return false
}

/** 判断是否为引号字符 */
function isQuote(ch: string): boolean {
    return ch === "'" || ch === '"' || ch === '`'
}

/**
 * 将字符偏移转换为行号
 */
function offsetToLine(content: string, offset: number): number {
    let line = 1
    for (let i = 0; i < offset && i < content.length; i++) {
        if (content[i] === '\n') line++
    }
    return line
}

// ==================== 圈复杂度计算 ====================

/**
 * 计算函数体圈复杂度（简化版）
 *
 * 复杂度 = 1 + 决策点数量
 * 决策点：if/else if/for/while/do-while/case/catch/&&/||/?:/=>/new Error/throw
 */
function calculateComplexity(body: string): number {
    let complexity = 1

    // 决策点正则（排除注释和字符串中的匹配）
    const cleanBody = stripCommentsAndStrings(body)

    // if / else if
    complexity += countMatches(cleanBody, /\bif\s*\(/g)
    // for / for...of / for...in
    complexity += countMatches(cleanBody, /\bfor\s*\(/g)
    // while
    complexity += countMatches(cleanBody, /\bwhile\s*\(/g)
    // do-while（do 本身不+1，while 已计入）
    // case
    complexity += countMatches(cleanBody, /\bcase\s+/g)
    // catch
    complexity += countMatches(cleanBody, /\bcatch\s*\(/g)
    // && / ||
    complexity += countMatches(cleanBody, /&&/g)
    complexity += countMatches(cleanBody, /\|\|/g)
    // 三元运算符
    complexity += countMatches(cleanBody, /\?\s*[^:]/g)

    return complexity
}

/**
 * 移除注释和字符串内容（保留结构）
 */
function stripCommentsAndStrings(code: string): string {
    return code
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

/**
 * 统计正则匹配次数
 */
function countMatches(str: string, regex: RegExp): number {
    return (str.match(regex) || []).length
}
