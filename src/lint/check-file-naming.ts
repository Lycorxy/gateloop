/**
 * 文件命名规范验证器 — 独立于 ESLint，直接检查文件名/组件命名约定
 *
 * 收敛型门禁（违反=错，无主观空间）：
 *   1. 文件名 kebab-case（约定例外：index/hook/types/constants/utils/use-xxx）
 *   2. 组件文件（.tsx）一个文件一个默认导出组件
 *   3. Hook 文件命名 use-xxx.ts
 *   4. PascalCase 组件名与文件名对应（UserList.tsx ↔ user-list.tsx）
 *
 * 接入 ADS verify custom 后，nut ads next 强制执行。
 * 用法：nut lint check-naming "src/**\/*.{ts,tsx}"
 *       或作为库导入：import { checkFileNaming } from './check-file-naming'
**/

import { readFileSync } from 'node:fs'
import { basename, extname, dirname } from 'node:path'
import { glob } from 'glob'

// ==================== 类型定义 ====================

export interface NamingConfig {
    /** 是否检查组件文件单一导出，默认 true */
    checkSingleExport?: boolean
    /** 是否检查 Hook 文件命名，默认 true */
    checkHookNaming?: boolean
    /** 是否检查 PascalCase 与文件名对应，默认 true */
    checkComponentFileMatch?: boolean
    /** 约定例外文件名（kebab-case 检查跳过），默认含 index/hook/types/constants/utils */
    allowExceptionNames?: string[]
}

export interface NamingViolation {
    file: string
    type:
        | 'file-name-case'
        | 'multi-export'
        | 'hook-naming'
        | 'component-file-mismatch'
    actual: string
    expected: string
    message: string
}

export interface NamingResult {
    passed: boolean
    violations: NamingViolation[]
    checkedFiles: number
}

// ==================== 默认配置 ====================

const DEFAULT_EXCEPTIONS = [
    'index',
    'hook',
    'types',
    'constants',
    'utils',
    'helpers',
    'config',
    'setup',
    'main',
    'app',
    'router',
    'store',
    'global',
    'theme',
    'variables',
    'mixins',
    'functions'
]

const DEFAULT_CONFIG: Required<NamingConfig> = {
    checkSingleExport: true,
    checkHookNaming: true,
    checkComponentFileMatch: true,
    allowExceptionNames: DEFAULT_EXCEPTIONS
}

// ==================== 主入口 ====================

/**
 * 检查文件命名规范
 *
 * @param patterns glob 模式
 * @param cwd 工作目录
 * @param config 命名检查配置
 */
export function checkFileNaming(
    patterns: string | string[],
    cwd: string = process.cwd(),
    config?: NamingConfig
): NamingResult {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const patternArray = Array.isArray(patterns) ? patterns : [patterns]
    const violations: NamingViolation[] = []
    let checkedFiles = 0

    for (const pattern of patternArray) {
        const files = glob.sync(pattern, { cwd, absolute: true })
        for (const filePath of files) {
            const ext = extname(filePath).slice(1)
            if (!['ts', 'tsx', 'js', 'jsx'].includes(ext)) continue

            checkedFiles++
            const relPath = filePath.replace(cwd, '').replace(/^[\\/]/, '').replace(/\\/g, '/')
            const fileName = basename(filePath, `.${ext}`)
            const dirName = basename(dirname(filePath))

            // 1. 文件名 kebab-case 检查
            const fileViolation = checkFileNameCase(fileName, relPath, cfg)
            if (fileViolation) violations.push(fileViolation)

            // 仅 .tsx/.jsx 检查组件相关
            if (ext === 'tsx' || ext === 'jsx') {
                let content = ''
                try {
                    content = readFileSync(filePath, 'utf-8')
                } catch {
                    continue
                }

                // 2. 一个文件一个导出组件
                if (cfg.checkSingleExport) {
                    const exportViolation = checkSingleExport(content, relPath)
                    if (exportViolation) violations.push(exportViolation)
                }

                // 3. PascalCase 组件名与文件名对应
                if (cfg.checkComponentFileMatch && !cfg.allowExceptionNames.includes(fileName)) {
                    const matchViolation = checkComponentFileMatch(content, fileName, relPath)
                    if (matchViolation) violations.push(matchViolation)
                }
            }

            // 4. Hook 文件命名 use-xxx.ts
            if (cfg.checkHookNaming && (ext === 'ts' || ext === 'tsx')) {
                let content = ''
                try {
                    content = readFileSync(filePath, 'utf-8')
                } catch {
                    continue
                }
                const hookViolation = checkHookFileNaming(content, fileName, relPath, dirName)
                if (hookViolation) violations.push(hookViolation)
            }
        }
    }

    return {
        passed: violations.length === 0,
        violations,
        checkedFiles
    }
}

// ==================== 检查逻辑 ====================

/**
 * 检查文件名是否 kebab-case
 * 例外：index / hook / types / constants / utils / use-xxx 等
 */
function checkFileNameCase(
    fileName: string,
    relPath: string,
    cfg: Required<NamingConfig>
): NamingViolation | null {
    // 跳过例外
    if (cfg.allowExceptionNames.includes(fileName)) return null

    // use-xxx 是合法的 Hook 文件名
    if (/^use-[a-z][a-z0-9-]*$/.test(fileName)) return null

    // kebab-case: 全小写 + 连字符
    if (/^[a-z][a-z0-9-]*$/.test(fileName)) return null

    // 检测违规类型
    let expected = 'kebab-case'
    if (/^[A-Z][a-zA-Z0-9]*$/.test(fileName)) {
        expected = 'kebab-case (检测到 PascalCase，应转为连字符小写)'
    } else if (/[A-Z]/.test(fileName)) {
        expected = 'kebab-case (含大写字母，应转为小写连字符)'
    } else if (/_/.test(fileName)) {
        expected = 'kebab-case (含下划线，应转为连字符)'
    }

    return {
        file: relPath,
        type: 'file-name-case',
        actual: fileName,
        expected,
        message: `${relPath}: 文件名 "${fileName}" 不符合 kebab-case`
    }
}

/**
 * 检查 .tsx 文件是否只有一个默认导出组件
 */
function checkSingleExport(content: string, relPath: string): NamingViolation | null {
    // 匹配 export default class/function/const
    const defaultExports = content.match(/export\s+default\s+/g) || []
    if (defaultExports.length <= 1) return null

    return {
        file: relPath,
        type: 'multi-export',
        actual: `${defaultExports.length} 个 default export`,
        expected: '1 个 default export',
        message: `${relPath}: 检测到 ${defaultExports.length} 个 default export（一个文件一个导出组件）`
    }
}

/**
 * 检查 PascalCase 组件名与 kebab-case 文件名对应
 * UserList.tsx ↔ user-list.tsx
 */
function checkComponentFileMatch(
    content: string,
    fileName: string,
    relPath: string
): NamingViolation | null {
    // 提取默认导出的组件名
    const exportMatch = content.match(/export\s+default\s+(?:function\s+)?([A-Z][a-zA-Z0-9]*)/)
    if (!exportMatch) return null

    const componentName = exportMatch[1]
    // PascalCase → kebab-case
    const expectedFileName = componentName
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '')

    if (fileName === expectedFileName) return null

    return {
        file: relPath,
        type: 'component-file-mismatch',
        actual: `组件名 ${componentName} ↔ 文件名 ${fileName}`,
        expected: `组件名 ${componentName} ↔ 文件名 ${expectedFileName}`,
        message: `${relPath}: 组件名 "${componentName}" 与文件名 "${fileName}" 不匹配（应为 "${expectedFileName}"）`
    }
}

/**
 * 检查 Hook 文件命名
 * 包含 useXxx 导出的文件应命名为 use-xxx.ts
 */
function checkHookFileNaming(
    content: string,
    fileName: string,
    relPath: string,
    dirName: string
): NamingViolation | null {
    // 提取所有 useXxx 导出（use 开头 + 大写字母）
    const hookExports = content.match(/(?:export\s+(?:const|function)\s+)(use[A-Z][a-zA-Z0-9]*)/g) || []
    if (hookExports.length === 0) return null

    // 已是 use-xxx.ts 形式 → PASS
    if (/^use-[a-z][a-z0-9-]*$/.test(fileName)) return null

    // 在 hooks/ 目录下且文件名为 hook.ts → 例外允许
    if (dirName === 'hooks' && (fileName === 'hook' || fileName === 'index')) return null

    // 有 useXxx 导出但文件名不是 use-xxx.ts
    const firstHookMatch = hookExports[0]?.match(/use[A-Z][a-zA-Z0-9]*/)
    const firstHook = firstHookMatch ? firstHookMatch[0] : 'useXxx'
    // useXxx → use-xxx（去掉 use 前缀，PascalCase → kebab-case，再拼回）
    const rest = firstHook.replace(/^use/, '') // Auth / UserList
    const kebabRest = rest
        .replace(/([A-Z])/g, '-$1')
        .replace(/^-/, '')
        .toLowerCase() // auth / user-list
    const expectedFileName = `use-${kebabRest}`

    return {
        file: relPath,
        type: 'hook-naming',
        actual: `Hook 导出 ${firstHook} ↔ 文件名 ${fileName}`,
        expected: `文件名应为 ${expectedFileName}.ts`,
        message: `${relPath}: 文件含 Hook 导出 "${firstHook}"，文件名应为 "${expectedFileName}" 而非 "${fileName}"`
    }
}
