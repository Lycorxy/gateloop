/**
 * 代码格式化器
 *
 * 独立的格式化模块，支持 Prettier/ESLint 格式化和自动检测项目配置
 */

import { join, extname, resolve } from 'node:path'
import { exec, exists, readText, writeText } from '../helpers'
import type {
    FormatterType,
    FormatOptions,
    FormatResult,
    BatchFormatResult,
    ProjectFormatConfig
} from './types'
import { ESLINT_EXTENSIONS, PRETTIER_EXTENSIONS } from './types'

// ==================== 配置常量 ====================

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

// ==================== 配置检测 ====================

async function findConfigFile(rootDir: string, configFiles: string[]): Promise<string | undefined> {
    for (const configFile of configFiles) {
        const configPath = join(rootDir, configFile)
        if (await exists(configPath)) return configPath
    }
    return undefined
}

async function findProjectRoot(startPath?: string): Promise<string> {
    let currentDir = startPath || process.cwd()
    while (currentDir !== resolve('/')) {
        if (await exists(join(currentDir, 'package.json'))) return currentDir
        const parentDir = resolve(currentDir, '..')
        if (parentDir === currentDir) break
        currentDir = parentDir
    }
    return startPath || process.cwd()
}

export async function detectFormatConfig(startPath?: string): Promise<ProjectFormatConfig> {
    const rootDir = await findProjectRoot(startPath)
    const eslintConfigPath = await findConfigFile(rootDir, ESLINT_CONFIG_FILES)
    const prettierConfigPath = await findConfigFile(rootDir, PRETTIER_CONFIG_FILES)
    const hasEslint = !!eslintConfigPath
    const hasPrettier = !!prettierConfigPath

    let recommendedFormatter: FormatterType = 'none'
    if (hasEslint && hasPrettier) recommendedFormatter = 'both'
    else if (hasPrettier) recommendedFormatter = 'prettier'
    else if (hasEslint) recommendedFormatter = 'eslint'

    return {
        rootDir,
        hasEslint,
        hasPrettier,
        recommendedFormatter,
        eslintConfigPath,
        prettierConfigPath,
        eslintIgnorePath: (await exists(join(rootDir, '.eslintignore')))
            ? join(rootDir, '.eslintignore')
            : undefined,
        prettierIgnorePath: (await exists(join(rootDir, '.prettierignore')))
            ? join(rootDir, '.prettierignore')
            : undefined
    }
}

// ==================== 工具函数 ====================

async function getExecutable(rootDir: string, name: string): Promise<string | null> {
    const binPath = join(rootDir, 'node_modules', '.bin')
    const execName = process.platform === 'win32' ? `${name}.cmd` : name
    const execPath = join(binPath, execName)
    return (await exists(execPath)) ? execPath : null
}

function isEslintSupported(filePath: string): boolean {
    return ESLINT_EXTENSIONS.includes(extname(filePath).toLowerCase())
}

function isPrettierSupported(filePath: string): boolean {
    return PRETTIER_EXTENSIONS.includes(extname(filePath).toLowerCase())
}

// ==================== Prettier 格式化 ====================

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
        if (config.prettierConfigPath) args.push('--config', config.prettierConfigPath)
        if (options.write) args.push('--write')
        args.push(resolve(filePath))

        await exec(prettierPath, args, { cwd: config.rootDir, timeout: 30000 })

        if (options.write) {
            const newContent = await readText(filePath)
            result.formatted = newContent
            result.changed = originalContent !== newContent
        } else {
            result.formatted = originalContent
        }
    } catch (error) {
        result.errors.push(`Prettier 格式化失败: ${error}`)
    }

    result.duration = Date.now() - startTime
    return result
}

// ==================== ESLint 格式化 ====================

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
        if (config.eslintConfigPath) args.push('--config', config.eslintConfigPath)
        args.push(resolve(filePath))

        await exec(eslintPath, args, { cwd: config.rootDir, timeout: 30000 })

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

function determineFormatter(
    filePath: string,
    config: ProjectFormatConfig,
    preferredFormatter?: FormatterType
): FormatterType {
    if (preferredFormatter && preferredFormatter !== 'none') return preferredFormatter

    const supportsEslint = isEslintSupported(filePath)
    const supportsPrettier = isPrettierSupported(filePath)

    if (config.recommendedFormatter === 'both') {
        return resolveBothFormatter(supportsEslint, supportsPrettier)
    }
    if (config.recommendedFormatter === 'eslint') {
        return supportsEslint ? 'eslint' : 'none'
    }
    if (config.recommendedFormatter === 'prettier') {
        return supportsPrettier ? 'prettier' : 'none'
    }

    return 'none'
}

function resolveBothFormatter(supportsEslint: boolean, supportsPrettier: boolean): FormatterType {
    if (supportsEslint && supportsPrettier) return 'both'
    if (supportsEslint) return 'eslint'
    if (supportsPrettier) return 'prettier'
    return 'none'
}

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
            let result = await formatFileWithPrettier(filePath, config, { ...options, write: true })
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
            if (result.errors.length === 0) success++
            else failed++
            if (result.changed) changed++
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
