/**
 * 项目 Git 配置文件生成（.gitattributes / .gitignore / .editorconfig）
 *
 * 提供"生产"（生成/完善）配置的能力，用于初始化或补全项目级 Git 配置，
 * 解决跨平台换行符（LF/CRLF）、依赖锁文件 diff、二进制误转等行业常见问题。
 *
 * 设计原则：
 * - 文件不存在 → 直接生成完整推荐配置
 * - 文件已存在且未加 --force → 仅**追加缺失的推荐项**，绝不覆盖用户已有配置
 * - 文件已存在且加 --force → 覆盖重写为最新推荐配置
 *
 * 注意：本模块不依赖 line-ending，避免循环引用。
 */

import { writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { gitExec } from './executor'
import { successResult, errorResult } from './result'
import type { LineEnding, GitResult, ConfigSetupOptions } from './types'

// ==================== 生成器 ====================

/**
 * 生成 .gitattributes 内容（换行符 + 文件属性）
 *
 * @param lineEnding 统一的目标换行符（默认 lf）
 */
export function generateGitAttributes(lineEnding: LineEnding = 'lf'): string {
    const eol = lineEnding === 'crlf' ? 'crlf' : 'lf'
    const lines = [
        '# 自动生成 - 换行符与文件属性配置（node-ultra git）',
        `# 统一换行符为 ${eol.toUpperCase()}，跨平台一致`,
        '',
        '# 默认：自动识别文本并统一行尾',
        `* text=auto eol=${eol}`,
        '',
        '# 显式文本类型（统一行尾）',
        '*.ts text',
        '*.tsx text',
        '*.js text',
        '*.jsx text',
        '*.mjs text',
        '*.cjs text',
        '*.json text',
        '*.css text',
        '*.scss text',
        '*.less text',
        '*.sass text',
        '*.html text',
        '*.htm text',
        '*.xml text',
        '*.svg text',
        '*.md text',
        '*.mdx text',
        '*.yml text',
        '*.yaml text',
        '*.toml text',
        '*.sh text eol=lf',
        '*.bash text eol=lf',
        '*.zsh text eol=lf',
        '*.ps1 text eol=crlf',
        '*.bat text eol=crlf',
        '*.cmd text eol=crlf',
        '',
        '# 依赖锁文件按文本处理（便于 diff），标记 -diff 减少噪音',
        'package-lock.json text -diff',
        'pnpm-lock.yaml text -diff',
        'yarn.lock text -diff',
        '',
        '# 二进制文件（禁止换行符转换）',
        '*.png binary',
        '*.jpg binary',
        '*.jpeg binary',
        '*.gif binary',
        '*.ico binary',
        '*.pdf binary',
        '*.zip binary',
        '*.tar binary',
        '*.gz binary',
        '*.7z binary',
        '*.rar binary',
        '*.exe binary',
        '*.dll binary',
        '*.so binary',
        '*.dylib binary',
        '*.woff binary',
        '*.woff2 binary',
        '*.ttf binary',
        '*.eot binary',
        '*.mp3 binary',
        '*.mp4 binary',
        '*.mov binary',
        '*.avi binary'
    ]
    return lines.join('\n') + '\n'
}

/**
 * 生成 .gitignore 内容（Node / TS 通用）
 */
export function generateGitIgnore(): string {
    const lines = [
        '# 依赖',
        'node_modules/',
        '.pnp/',
        '.pnp.js',
        '',
        '# 构建产物',
        'dist/',
        'build/',
        'out/',
        'bin/',
        '*.tsbuildinfo',
        '*.esbuild',
        '',
        '# 缓存 / 临时',
        '.cache/',
        '.temp/',
        '.tmp/',
        '*.log',
        'npm-debug.log*',
        'yarn-debug.log*',
        'yarn-error.log*',
        '',
        '# 环境变量 / 密钥',
        '.env',
        '.env.*',
        '!.env.example',
        '*.pem',
        '*.key',
        '*.p12',
        '',
        '# 编辑器 / OS',
        '.idea/',
        '.vscode/*',
        '!.vscode/extensions.json',
        '.DS_Store',
        'Thumbs.db',
        '',
        '# 测试 / 覆盖率',
        'coverage/',
        '.nyc_output/',
        '',
        '# 包管理器',
        '.pnpm-store/'
    ]
    return lines.join('\n') + '\n'
}

/**
 * 生成 .editorconfig 内容（编辑器统一配置）
 */
export function generateEditorConfig(lineEnding: LineEnding = 'lf'): string {
    const eol = lineEnding === 'crlf' ? 'crlf' : 'lf'
    const lines = [
        '# 编辑器统一配置（node-ultra git）',
        'root = true',
        '',
        '[*]',
        'charset = utf-8',
        `end_of_line = ${eol}`,
        'insert_final_newline = true',
        'trim_trailing_whitespace = true',
        'indent_style = space',
        'indent_size = 4',
        '',
        '[*.{yml,yaml,json}]',
        'indent_size = 2',
        '',
        '[*.md]',
        'trim_trailing_whitespace = false'
    ]
    return lines.join('\n') + '\n'
}

// ==================== 写入 / 合并 ====================

/**
 * 合并配置：在已有文件末尾追加缺失的推荐项（不覆盖用户已有内容）。
 * 注释行与空行不参与去重，仅对实际条目（非空、非 # 开头）做去重。
 */
function mergeIntoFile(
    filePath: string,
    recommended: string[],
    header: string
): { changed: boolean; added: string[] } {
    const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''
    const existingSet = new Set(
        existing
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
    )
    const missing = recommended.filter((line) => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return false
        return !existingSet.has(t)
    })
    if (missing.length === 0) return { changed: false, added: [] }
    const block = `\n${header}\n` + missing.join('\n') + '\n'
    appendFileSync(filePath, block, 'utf-8')
    return { changed: true, added: missing }
}

/**
 * 写入或合并单个配置文件
 * @returns changed 是否发生了变化（新建/覆盖/追加）
 */
async function writeConfigFile(
    cwd: string,
    fileName: string,
    generate: () => string,
    options: ConfigSetupOptions,
    header: string
): Promise<{
    changed: boolean
    mode: 'created' | 'overwritten' | 'merged' | 'none'
    added: string[]
}> {
    const target = join(cwd, fileName)
    const content = generate()

    if (!existsSync(target)) {
        writeFileSync(target, content, 'utf-8')
        return { changed: true, mode: 'created', added: [] }
    }
    if (options.force) {
        writeFileSync(target, content, 'utf-8')
        return { changed: true, mode: 'overwritten', added: [] }
    }
    const { changed, added } = mergeIntoFile(target, content.split('\n'), header)
    return { changed, mode: changed ? 'merged' : 'none', added }
}

/** 暂存配置文件（非 git 仓库时静默忽略） */
async function tryStage(cwd: string, fileName: string): Promise<void> {
    try {
        await gitExec(['add', fileName], { cwd, silent: true })
    } catch {
        // 忽略
    }
}

/**
 * 生成 / 完善 .gitattributes（换行符与二进制配置）
 */
export async function setupGitAttributes(
    cwd: string,
    options: ConfigSetupOptions = {}
): Promise<GitResult> {
    const startTime = Date.now()
    const lineEnding = options.lineEnding || 'lf'
    try {
        const res = await writeConfigFile(
            cwd,
            '.gitattributes',
            () => generateGitAttributes(lineEnding),
            options,
            '# ===== node-ultra 推荐项 ====='
        )
        await tryStage(cwd, '.gitattributes')
        const msg =
            res.mode === 'created'
                ? `已生成 .gitattributes（${lineEnding.toUpperCase()}）`
                : res.mode === 'overwritten'
                  ? `已覆盖重写 .gitattributes（${lineEnding.toUpperCase()}）`
                  : res.mode === 'merged'
                    ? `已补充 ${res.added.length} 项到 .gitattributes`
                    : '.gitattributes 已是最新，无需补充'
        return successResult(
            'setupGitAttributes',
            msg,
            { file: '.gitattributes', mode: res.mode, lineEnding },
            undefined,
            Date.now() - startTime
        )
    } catch (error) {
        return errorResult(
            'setupGitAttributes',
            '生成 .gitattributes 失败',
            (error as Error).message,
            Date.now() - startTime
        )
    }
}

/**
 * 生成 / 完善 .gitignore
 */
export async function setupGitIgnore(
    cwd: string,
    options: ConfigSetupOptions = {}
): Promise<GitResult> {
    const startTime = Date.now()
    try {
        const res = await writeConfigFile(
            cwd,
            '.gitignore',
            () => generateGitIgnore(),
            options,
            '# ===== node-ultra 推荐项 ====='
        )
        await tryStage(cwd, '.gitignore')
        const msg =
            res.mode === 'created'
                ? '已生成 .gitignore'
                : res.mode === 'overwritten'
                  ? '已覆盖重写 .gitignore'
                  : res.mode === 'merged'
                    ? `已补充 ${res.added.length} 项到 .gitignore`
                    : '.gitignore 已是最新，无需补充'
        return successResult(
            'setupGitIgnore',
            msg,
            { file: '.gitignore', mode: res.mode },
            undefined,
            Date.now() - startTime
        )
    } catch (error) {
        return errorResult(
            'setupGitIgnore',
            '生成 .gitignore 失败',
            (error as Error).message,
            Date.now() - startTime
        )
    }
}

/**
 * 生成 / 完善 .editorconfig
 */
export async function setupEditorConfig(
    cwd: string,
    options: ConfigSetupOptions = {}
): Promise<GitResult> {
    const startTime = Date.now()
    const lineEnding = options.lineEnding || 'lf'
    try {
        const res = await writeConfigFile(
            cwd,
            '.editorconfig',
            () => generateEditorConfig(lineEnding),
            options,
            '# ===== node-ultra 推荐项 ====='
        )
        await tryStage(cwd, '.editorconfig')
        const msg =
            res.mode === 'created'
                ? `已生成 .editorconfig（${lineEnding.toUpperCase()}）`
                : res.mode === 'overwritten'
                  ? `已覆盖重写 .editorconfig（${lineEnding.toUpperCase()}）`
                  : res.mode === 'merged'
                    ? `已补充 ${res.added.length} 项到 .editorconfig`
                    : '.editorconfig 已是最新，无需补充'
        return successResult(
            'setupEditorConfig',
            msg,
            { file: '.editorconfig', mode: res.mode, lineEnding },
            undefined,
            Date.now() - startTime
        )
    } catch (error) {
        return errorResult(
            'setupEditorConfig',
            '生成 .editorconfig 失败',
            (error as Error).message,
            Date.now() - startTime
        )
    }
}

/**
 * 一键生成 / 完善项目 Git 配置（.gitattributes + .gitignore + .editorconfig）
 *
 * 不覆盖已有配置：默认仅追加缺失的推荐项；加 --force 才覆盖重写。
 *
 * @param cwd 项目根目录
 * @param options.lineEnding 目标换行符（用于 .gitattributes / .editorconfig）
 * @param options.force 已存在时是否覆盖重写
 */
export async function setupProjectConfig(
    cwd: string,
    options: ConfigSetupOptions = {}
): Promise<GitResult> {
    const startTime = Date.now()
    try {
        const attr = await setupGitAttributes(cwd, options)
        const ignore = await setupGitIgnore(cwd, options)
        const editor = await setupEditorConfig(cwd, options)

        const files: string[] = []
        if (attr.success) files.push('.gitattributes')
        if (ignore.success) files.push('.gitignore')
        if (editor.success) files.push('.editorconfig')

        return successResult(
            'setupProjectConfig',
            `已生成/完善项目 Git 配置: ${files.join(', ')}`,
            {
                files,
                lineEnding: options.lineEnding || 'lf',
                force: !!options.force,
                details: {
                    gitattributes: attr.data,
                    gitignore: ignore.data,
                    editorconfig: editor.data
                }
            },
            undefined,
            Date.now() - startTime
        )
    } catch (error) {
        return errorResult(
            'setupProjectConfig',
            '生成项目 Git 配置失败',
            (error as Error).message,
            Date.now() - startTime
        )
    }
}
