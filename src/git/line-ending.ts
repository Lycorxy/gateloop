/**
 * 换行符处理工具
 *
 * 检测和修复项目中的换行符问题（LF/CRLF）。
 * 仅在当前项目范围内操作，不影响全局 Git 配置。
 *
 * 策略：
 * - 检测：扫描所有文本文件，报告换行符类型
 * - 修复：将不符合预期的文件转换为预期换行符
 * - 配置：自动更新 .gitattributes 确保一致性
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { gitExec, gitExecOrThrow, isGitRepo, getGitRoot } from './executor'
import type { LineEnding, LineEndingReport, GitResult } from './types'

// ==================== 常量 ====================

/** 二进制文件扩展名（跳过检测） */
const BINARY_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.ico',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.zip',
    '.tar',
    '.gz',
    '.rar',
    '.7z',
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.mp3',
    '.mp4',
    '.avi',
    '.mov',
    '.wmv',
    '.ttf',
    '.woff',
    '.woff2',
    '.eot',
    '.map'
])

/** 常见文本文件扩展名 */
const TEXT_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.css',
    '.scss',
    '.less',
    '.sass',
    '.html',
    '.htm',
    '.xml',
    '.svg',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.md',
    '.txt',
    '.rst',
    '.vue',
    '.svelte',
    '.py',
    '.rb',
    '.php',
    '.java',
    '.go',
    '.rs',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.lock',
    '.sum'
])

/** 无扩展名的文本文件名 */
const TEXT_FILENAMES = new Set([
    '.gitignore',
    '.gitattributes',
    '.editorconfig',
    '.env',
    '.npmrc',
    '.prettierrc',
    '.eslintrc',
    'Dockerfile',
    'Makefile'
])

// ==================== 类型定义 ====================

/** 修复选项 */
export interface FixLineEndingsOptions {
    /** 预期的换行符类型 */
    expected: LineEnding
    /** 是否自动修复 */
    fix?: boolean
    /** 是否仅扫描暂存区文件 */
    stagedOnly?: boolean
    /** 是否创建自动备份 */
    backup?: boolean
}

/** 修复结果 */
export interface LineEndingFixResult {
    /** 是否成功 */
    success: boolean
    /** 错误信息 */
    error?: string
    /** 检测报告 */
    report?: LineEndingReport
    /** 已修复文件数 */
    fixedCount?: number
}

// ==================== 检测工具 ====================

/**
 * 检测文件的换行符类型
 */
function detectLineEnding(content: string): LineEnding | 'mixed' {
    const hasCRLF = content.includes('\r\n')
    const hasLFOnly = content.replace(/\r\n/g, '').includes('\n')

    if (hasCRLF && hasLFOnly) return 'mixed'
    if (hasCRLF) return 'crlf'
    return 'lf'
}

/**
 * 判断是否为文本文件
 */
function isTextFile(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase()
    const baseName = filePath.split('/').pop() || ''

    // 检查文件名
    if (TEXT_FILENAMES.has(baseName)) {
        return true
    }

    // 提取扩展名
    const dotIndex = lowerPath.lastIndexOf('.')
    if (dotIndex === -1) {
        return true // 无扩展名默认为文本
    }

    const ext = lowerPath.slice(dotIndex)

    // O(1) 查找
    if (TEXT_EXTENSIONS.has(ext)) {
        return true
    }

    if (BINARY_EXTENSIONS.has(ext)) {
        return false
    }

    // .min.js, .min.css 视为二进制
    if (ext === '.js' || ext === '.css') {
        const prevDot = lowerPath.lastIndexOf('.', dotIndex - 1)
        if (prevDot !== -1 && lowerPath.slice(prevDot, dotIndex) === '.min') {
            return false
        }
    }

    // 默认为文本文件
    return true
}

// ==================== 核心功能 ====================

/**
 * 检测并修复换行符
 */
export async function checkAndFixLineEndings(
    cwd?: string,
    options: FixLineEndingsOptions = { expected: 'lf' }
): Promise<LineEndingFixResult> {
    const workDir = cwd || process.cwd()
    const { expected, fix = false, stagedOnly = false, backup = true } = options

    // 确保在 Git 仓库中
    const isRepo = await isGitRepo(workDir)
    if (!isRepo) {
        return { success: false, error: '当前目录不是 Git 仓库' }
    }

    const root = await getGitRoot(workDir)

    try {
        // 获取文件列表
        let fileList: string[]
        if (stagedOnly) {
            const output = await gitExecOrThrow(['diff', '--name-only', '--cached'], {
                cwd: root,
                silent: true
            })
            fileList = output.split('\n').filter(Boolean)
        } else {
            const output = await gitExecOrThrow(['ls-files'], { cwd: root, silent: true })
            fileList = output.split('\n').filter(Boolean)
        }

        // 过滤文本文件
        const textFiles = fileList.filter(isTextFile)
        const report: LineEndingReport = {
            totalFiles: textFiles.length,
            lfFiles: 0,
            crlfFiles: 0,
            mixedFiles: 0,
            expected,
            mismatched: []
        }

        const fixTasks: { path: string; current: LineEnding | 'mixed'; expected: LineEnding }[] = []

        // 扫描每个文件
        for (const file of textFiles) {
            try {
                const fullPath = join(root, file)
                if (!existsSync(fullPath)) continue

                const content = readFileSync(fullPath, 'utf-8')
                const ending = detectLineEnding(content)

                switch (ending) {
                    case 'lf':
                        report.lfFiles++
                        break
                    case 'crlf':
                        report.crlfFiles++
                        break
                    case 'mixed':
                        report.mixedFiles++
                        break
                }

                if (ending !== expected) {
                    report.mismatched.push({
                        path: file,
                        current: ending,
                        expected
                    })

                    if (fix) {
                        fixTasks.push({
                            path: file,
                            current: ending,
                            expected
                        })
                    }
                }
            } catch {
                // 跳过无法读取的文件
            }
        }

        // 执行修复
        let fixedCount = 0
        if (fix && fixTasks.length > 0) {
            // 备份（使用 git stash）
            if (backup) {
                try {
                    await gitExec(['stash', 'push', '-m', 'nut-line-ending-backup'], {
                        cwd: root,
                        silent: true
                    })
                } catch {
                    // 忽略备份失败
                }
            }

            for (const task of fixTasks) {
                try {
                    const fullPath = join(root, task.path)
                    let content = readFileSync(fullPath, 'utf-8')

                    if (task.expected === 'lf') {
                        // 转换为 LF
                        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
                    } else {
                        // 转换为 CRLF
                        content = content
                            .replace(/\r\n/g, '\n')
                            .replace(/\r/g, '\n')
                            .replace(/\n/g, '\r\n')
                    }

                    writeFileSync(fullPath, content, 'utf-8')
                    fixedCount++
                } catch {
                    // 修复失败，跳过
                }
            }

            // 重新暂存已修复的文件
            if (stagedOnly && fixedCount > 0) {
                try {
                    const fixedPaths = fixTasks.map((t) => t.path)
                    await gitExec(['add', '--', ...fixedPaths], { cwd: root, silent: true })
                } catch {
                    // 忽略
                }
            }
        }

        return {
            success: true,
            report,
            fixedCount
        }
    } catch (error) {
        return {
            success: false,
            error: (error as Error).message
        }
    }
}

/**
 * 快速检测项目换行符状态
 */
export async function checkLineEndings(cwd?: string): Promise<GitResult> {
    const startTime = Date.now()
    const result = await checkAndFixLineEndings(cwd, {
        expected: 'lf',
        fix: false
    })

    if (!result.success || !result.report) {
        return {
            success: false,
            operation: 'stage',
            message: '检测换行符失败',
            error: result.error,
            duration: Date.now() - startTime
        }
    }

    const r = result.report

    return {
        success: true,
        operation: 'stage',
        message: `检测完成: ${r.totalFiles} 个文件, ${r.mismatched.length} 个不匹配`,
        data: {
            total: r.totalFiles,
            lf: r.lfFiles,
            crlf: r.crlfFiles,
            mixed: r.mixedFiles,
            expected: r.expected,
            mismatched: r.mismatched.slice(0, 50) // 限制输出
        },
        duration: Date.now() - startTime,
        summary: {
            totalFiles: r.totalFiles,
            mismatchedCount: r.mismatched.length,
            compliance:
                r.mismatched.length === 0
                    ? '100%'
                    : `${((1 - r.mismatched.length / r.totalFiles) * 100).toFixed(1)}%`
        }
    }
}

/**
 * 修复项目换行符
 */
export async function fixLineEndings(
    cwd?: string,
    expected: LineEnding = 'lf'
): Promise<GitResult> {
    const startTime = Date.now()
    const result = await checkAndFixLineEndings(cwd, {
        expected,
        fix: true,
        backup: true
    })

    if (!result.success || !result.report) {
        return {
            success: false,
            operation: 'stage',
            message: '修复换行符失败',
            error: result.error,
            duration: Date.now() - startTime
        }
    }

    return {
        success: true,
        operation: 'stage',
        message: `已修复 ${result.fixedCount} 个文件为 ${expected.toUpperCase()}`,
        data: {
            expected,
            fixed: result.fixedCount,
            total: result.report.totalFiles
        },
        duration: Date.now() - startTime
    }
}

// ==================== .gitattributes 管理 ====================

/**
 * 生成 .gitattributes 内容
 */
export function generateGitAttributes(lineEnding: LineEnding): string {
    const endingRule = lineEnding === 'lf' ? 'text eol=lf' : 'text eol=crlf'

    return `# 自动生成的 .gitattributes - 换行符配置
# 由 node-ultra git 工具管理

# 默认行为：统一换行符为 ${lineEnding.toUpperCase()}
* ${endingRule}

# 二进制文件（不做转换）
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.pdf binary
*.zip binary
*.tar binary
*.gz binary
*.woff binary
*.woff2 binary
*.ttf binary
*.eot binary
`
}

/**
 * 写入 .gitattributes 文件
 */
export async function setupGitAttributes(
    cwd?: string,
    lineEnding: LineEnding = 'lf'
): Promise<GitResult> {
    const startTime = Date.now()
    const workDir = cwd || process.cwd()

    try {
        const attributesPath = join(workDir, '.gitattributes')
        const content = generateGitAttributes(lineEnding)
        writeFileSync(attributesPath, content, 'utf-8')

        // 暂存 .gitattributes
        try {
            await gitExec(['add', '.gitattributes'], { cwd: workDir, silent: true })
        } catch {
            // 忽略
        }

        return {
            success: true,
            operation: 'stage',
            message: `已配置 .gitattributes，统一换行符为 ${lineEnding.toUpperCase()}`,
            data: {
                file: '.gitattributes',
                lineEnding,
                autoStaged: true
            },
            duration: Date.now() - startTime
        }
    } catch (error) {
        return {
            success: false,
            operation: 'stage',
            message: '配置 .gitattributes 失败',
            error: (error as Error).message,
            duration: Date.now() - startTime
        }
    }
}

export default {
    checkLineEndings,
    fixLineEndings,
    checkAndFixLineEndings,
    setupGitAttributes,
    generateGitAttributes
}
