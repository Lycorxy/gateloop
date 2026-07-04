/**
 * 代码格式化器
 *
 * 独立的格式化模块，支持：
 * - Prettier 格式化
 * - ESLint 格式化
 * - 自动检测项目配置
 */

import { join, extname, resolve } from 'node:path'
import { exec } from '../helpers'
import { exists, readText, writeText } from '../helpers'
import type {
    FormatterType,
    FormatOptions,
    FormatResult,
    BatchFormatResult,
    ProjectFormatConfig
} from './types'
import { EXT_TO_PARSER, ESLINT_EXTENSIONS, PRETTIER_EXTENSIONS } from './types'

// ==================== 配置检测 ====================

/** ESLint 配置文件 */
const ESLINT_CONFIG_FILES = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.mjs',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    '.eslintrc.json',
    '.eslintrc'
]

/** Prettier 配置文件 */
const PRETTIER_CONFIG_FILES = [
    'prettier.config.js',
    'prettier.config.cjs',
    'prettier.config.mjs',
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yml',
    '.prettierrc.yaml',
    '.prettierrc.json5',
    '.prettierrc.js',
    '.prettierrc.cjs',
    '.prettierrc.mjs',
    '.prettierrc.toml'
]

/**
 * 查找配置文件
 */
async function findConfigFile(rootDir: string, configFiles: string[]): Promise<string | undefined> {
    for (const configFile of configFiles) {
        const configPath = join(rootDir, configFile)
        if (await exists(configPath)) {
            return configPath
        }
    }
    return undefined
}

/**
 * 查找项目根目录
 */
async function findProjectRoot(startPath?: string): Promise<string> {
    let currentDir = startPath || process.cwd()

    while (currentDir !== resolve('/')) {
        const packagePath = join(currentDir, 'package.json')
        if (await exists(packagePath)) {
            return currentDir
        }

        const parentDir = resolve(currentDir, '..')
        if (parentDir === currentDir) break
        currentDir = parentDir
    }

    return startPath || process.cwd()
}

/**
 * 检测项目格式化配置
 */
export async function detectFormatConfig(startPath?: string): Promise<ProjectFormatConfig> {
    const rootDir = await findProjectRoot(startPath)

    const eslintConfigPath = await findConfigFile(rootDir, ESLINT_CONFIG_FILES)
    const prettierConfigPath = await findConfigFile(rootDir, PRETTIER_CONFIG_FILES)

    const hasEslint = !!eslintConfigPath
    const hasPrettier = !!prettierConfigPath

    let recommendedFormatter: FormatterType = 'none'
    if (hasEslint && hasPrettier) {
        recommendedFormatter = 'both'
    } else if (hasPrettier) {
        recommendedFormatter = 'prettier'
    } else if (hasEslint) {
        recommendedFormatter = 'eslint'
    }

    const eslintIgnorePath = (await exists(join(rootDir, '.eslintignore')))
        ? join(rootDir, '.eslintignore')
        : undefined
    const prettierIgnorePath = (await exists(join(rootDir, '.prettierignore')))
        ? join(rootDir, '.prettierignore')
        : undefined

    return {
        rootDir,
        hasEslint,
        hasPrettier,
        recommendedFormatter,
        eslintConfigPath,
        prettierConfigPath,
        eslintIgnorePath,
        prettierIgnorePath
    }
}

// ==================== 工具检测 ====================

/**
 * 获取可执行文件路径
 */
async function getExecutable(rootDir: string, name: string): Promise<string | null> {
    const binPath = join(rootDir, 'node_modules', '.bin')
    const execName = process.platform === 'win32' ? `${name}.cmd` : name
    const execPath = join(binPath, execName)

    if (await exists(execPath)) {
        return execPath
    }

    return null
}

/**
 * 获取文件的 Prettier 解析器
 */
function getParser(filePath: string): string | undefined {
    const ext = extname(filePath).toLowerCase()
    return EXT_TO_PARSER[ext]
}

/**
 * 检查文件是否被 ESLint 支持
 */
function isEslintSupported(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase()
    return ESLINT_EXTENSIONS.includes(ext)
}

/**
 * 检查文件是否被 Prettier 支持
 */
function isPrettierSupported(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase()
    return PRETTIER_EXTENSIONS.includes(ext)
}

// ==================== Prettier 格式化 ====================

/**
 * 使用 Prettier 格式化文件
 */
async function formatFileWithPrettier(
    filePath: string,
    config: ProjectFormatConfig,
    options: FormatOptions = {}
): Promise<FormatResult> {
    const startTime = Date.now()
    const result: FormatResult = {
        formatted: '',
        changed: false,
        formatter: 'prettier',
        errors: [],
        warnings: [],
        duration: 0
    }

    const prettierPath = await getExecutable(config.rootDir, 'prettier')
    if (!prettierPath) {
        result.errors.push('Prettier 未安装')
        result.duration = Date.now() - startTime
        return result
    }

    try {
        const originalContent = await readText(filePath)
        const args: string[] = []

        if (config.prettierConfigPath) {
            args.push('--config', config.prettierConfigPath)
        }

        if (options.write) {
            args.push('--write')
        }

        args.push(resolve(filePath))

        await exec(prettierPath, args, {
            cwd: config.rootDir,
            timeout: 30000
        })

        if (options.write) {
            const newContent = await readText(filePath)
            result.formatted = newContent
            result.changed = originalContent !== newContent
        } else {
            // prettier 输出格式化内容到 stdout
            result.formatted = originalContent
        }
    } catch (error) {
        result.errors.push(`Prettier 格式化失败: ${error}`)
    }

    result.duration = Date.now() - startTime
    return result
}

// ==================== ESLint 格式化 ====================

/**
 * 使用 ESLint 格式化文件
 */
async function formatFileWithEslint(
    filePath: string,
    config: ProjectFormatConfig,
    options: FormatOptions = {}
): Promise<FormatResult> {
    const startTime = Date.now()
    const result: FormatResult = {
        formatted: '',
        changed: false,
        formatter: 'eslint',
        errors: [],
        warnings: [],
        duration: 0
    }

    const eslintPath = await getExecutable(config.rootDir, 'eslint')
    if (!eslintPath) {
        result.errors.push('ESLint 未安装')
        result.duration = Date.now() - startTime
        return result
    }

    try {
        const originalContent = await readText(filePath)
        const args = ['--fix']

        if (config.eslintConfigPath) {
            args.push('--config', config.eslintConfigPath)
        }

        args.push(resolve(filePath))

        await exec(eslintPath, args, {
            cwd: config.rootDir,
            timeout: 30000
        })

        const newContent = await readText(filePath)
        result.formatted = newContent
        result.changed = originalContent !== newContent

        // 如果不需要写入，恢复原始内容
        if (!options.write && result.changed) {
            await writeText(filePath, originalContent)
        }
    } catch (error) {
        result.errors.push(`ESLint 格式化失败: ${error}`)
    }

    result.duration = Date.now() - startTime
    return result
}

// ==================== 综合格式化 ====================

/**
 * 确定使用的格式化工具
 */
function determineFormatter(
    filePath: string,
    config: ProjectFormatConfig,
    preferredFormatter?: FormatterType
): FormatterType {
    if (preferredFormatter && preferredFormatter !== 'none') {
        return preferredFormatter
    }

    const supportsEslint = isEslintSupported(filePath)
    const supportsPrettier = isPrettierSupported(filePath)

    if (config.recommendedFormatter === 'both') {
        if (supportsEslint && supportsPrettier) {
            return 'both'
        }
        if (supportsEslint) {
            return 'eslint'
        }
        if (supportsPrettier) {
            return 'prettier'
        }
    }

    if (config.recommendedFormatter === 'eslint') {
        return supportsEslint ? 'eslint' : 'none'
    }

    if (config.recommendedFormatter === 'prettier') {
        return supportsPrettier ? 'prettier' : 'none'
    }

    return 'none'
}

/**
 * 格式化单个文件
 */
export async function formatFile(
    filePath: string,
    cwd?: string,
    options: FormatOptions = {}
): Promise<FormatResult> {
    const config = await detectFormatConfig(cwd)
    const formatter = determineFormatter(filePath, config, options.forceFormatter)

    switch (formatter) {
        case 'eslint':
            return formatFileWithEslint(filePath, config, options)

        case 'prettier':
            return formatFileWithPrettier(filePath, config, options)

        case 'both': {
            let result = await formatFileWithPrettier(filePath, config, {
                ...options,
                write: true
            })

            if (result.errors.length === 0 && isEslintSupported(filePath)) {
                const eslintResult = await formatFileWithEslint(filePath, config, options)
                result = {
                    ...eslintResult,
                    formatter: 'both',
                    warnings: [...result.warnings, ...eslintResult.warnings],
                    duration: result.duration + eslintResult.duration
                }
            }

            return result
        }

        default:
            return {
                formatted: await readText(filePath),
                changed: false,
                formatter: 'none',
                errors: ['无可用的格式化工具'],
                warnings: [],
                duration: 0
            }
    }
}

/**
 * 批量格式化文件
 */
export async function formatFiles(
    files: string[],
    cwd?: string,
    formatter?: FormatterType
): Promise<BatchFormatResult> {
    const startTime = Date.now()
    const results: Array<{ filePath: string; result: FormatResult }> = []

    let success = 0
    let failed = 0
    let changed = 0

    const concurrency = 5
    for (let i = 0; i < files.length; i += concurrency) {
        const batch = files.slice(i, i + concurrency)
        const batchResults = await Promise.all(
            batch.map(async (filePath) => {
                const result = await formatFile(filePath, cwd, {
                    write: true,
                    forceFormatter: formatter
                })
                return { filePath, result }
            })
        )

        for (const { result } of batchResults) {
            results.push(result as unknown as { filePath: string; result: FormatResult })

            if (result.errors.length === 0) {
                success++
            } else {
                failed++
            }

            if (result.changed) {
                changed++
            }
        }
    }

    return {
        total: files.length,
        success,
        failed,
        changed,
        results,
        duration: Date.now() - startTime
    }
}
