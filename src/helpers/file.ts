/**
 * 文件处理辅助函数
 *
 * 使用 fs-extra 封装常用的文件操作；所有文件相关操作都从此模块导出。
 *
 * 设计原则（与 http 封装一致）：
 * - 稳定可靠：统一封装 fs 操作，正常执行与返回；异常统一收敛为 Result 结构。
 * - 无事件监听、无拦截器/过滤器：只做「读/写/查/移动」这一件事。
 * - 两套 API：直接抛错的命令式函数（readText 等）与返回 Result 的安全函数（*Result 等）。
 *
 * 规范：
 * 1. 所有 Node 模块使用 node:xxx 格式
 * 2. 禁止直接使用 fs，统一使用 fs-extra
 * 3. 所有文件操作统一从此模块导入
 */

import {
    access,
    stat,
    readFile,
    writeFile,
    appendFile,
    readdir,
    ensureDir,
    copy,
    move,
    remove,
    emptyDir as fsEmptyDir,
    pathExists
} from 'fs-extra'
import {
    dirname as pathDirname,
    basename as pathBasename,
    extname as pathExtname,
    join as pathJoin,
    resolve as pathResolve,
    relative as pathRelative,
    normalize as pathNormalize,
    isAbsolute as pathIsAbsolute
} from 'node:path'
import { homedir, tmpdir } from 'node:os'
import type { Result } from '../types'

// ==================== 路径处理 ====================

// 重新导出 path 模块常用函数（通过包装函数避免 rollup 打包问题）
export const dirname = pathDirname
export const basename = pathBasename
export const extname = pathExtname
export const join = pathJoin
export const resolve = pathResolve
export const relative = pathRelative
export const normalize = pathNormalize
export const isAbsolute = pathIsAbsolute

/**
 * 获取用户主目录
 */
export function getHomedir(): string {
    return homedir()
}

/**
 * 获取临时目录
 */
export function getTmpdir(): string {
    return tmpdir()
}

/**
 * 规范化路径（处理 Windows/Unix 差异）
 */
export function normalizePath(path: string): string {
    return normalize(path).replace(/\\/g, '/')
}

/**
 * 获取文件扩展名（小写）
 */
export function getExtension(filePath: string): string {
    return extname(filePath).toLowerCase()
}

/**
 * 获取不带扩展名的文件名
 */
export function getBasename(filePath: string, ext?: string): string {
    return basename(filePath, ext || extname(filePath))
}

/**
 * 更改文件扩展名
 */
export function changeExtension(filePath: string, newExt: string): string {
    const ext = extname(filePath)
    const newExtWithDot = newExt.startsWith('.') ? newExt : `.${newExt}`
    return filePath.slice(0, -ext.length || undefined) + newExtWithDot
}

// ==================== 文件检测 ====================

/**
 * 检查路径是否存在
 */
export async function exists(path: string): Promise<boolean> {
    try {
        await access(path)
        return true
    } catch {
        return false
    }
}

/**
 * 检查是否为文件
 */
export async function isFile(path: string): Promise<boolean> {
    try {
        const fileStat = await stat(path)
        return fileStat.isFile()
    } catch {
        return false
    }
}

/**
 * 检查是否为目录
 */
export async function isDirectory(path: string): Promise<boolean> {
    try {
        const fileStat = await stat(path)
        return fileStat.isDirectory()
    } catch {
        return false
    }
}

/**
 * 获取文件信息
 */
export async function getFileInfo(path: string): Promise<{
    path: string
    name: string
    extension: string
    size: number
    isFile: boolean
    isDirectory: boolean
    createdAt: Date
    modifiedAt: Date
} | null> {
    try {
        const fileStat = await stat(path)
        return {
            path,
            name: basename(path),
            extension: extname(path),
            size: fileStat.size,
            isFile: fileStat.isFile(),
            isDirectory: fileStat.isDirectory(),
            createdAt: fileStat.birthtime,
            modifiedAt: fileStat.mtime
        }
    } catch {
        return null
    }
}

/**
 * 获取文件大小
 */
export async function getFileSize(path: string): Promise<number> {
    const fileStat = await stat(path)
    return fileStat.size
}

/**
 * 获取文件修改时间
 */
export async function getModifiedTime(path: string): Promise<Date> {
    const fileStat = await stat(path)
    return fileStat.mtime
}

// ==================== 文件读写 ====================

/**
 * 读取文本文件
 */
export async function readText(
    filePath: string,
    encoding: BufferEncoding = 'utf8'
): Promise<string> {
    return readFile(filePath, encoding)
}

/**
 * 读取 JSON 文件
 */
export async function readJson<T = unknown>(filePath: string): Promise<T> {
    const content = await readText(filePath)
    return JSON.parse(content)
}

/**
 * 读取文件为 Buffer
 */
export async function readBuffer(filePath: string): Promise<Buffer> {
    return readFile(filePath)
}

/**
 * 读取文件指定行范围
 */
export async function readLines(
    filePath: string,
    startLine: number = 1,
    endLine?: number
): Promise<string[]> {
    const content = await readText(filePath)
    const lines = content.split('\n')
    const start = Math.max(0, startLine - 1)
    const end = endLine ? Math.min(lines.length, endLine) : lines.length
    return lines.slice(start, end)
}

/**
 * 获取文件行数
 */
export async function getLineCount(filePath: string): Promise<number> {
    const content = await readText(filePath)
    return content.split('\n').length
}

/**
 * 写入文本文件
 */
export async function writeText(
    filePath: string,
    content: string,
    encoding: BufferEncoding = 'utf8'
): Promise<void> {
    await ensureDirExists(dirname(filePath))
    await writeFile(filePath, content, encoding)
}

/**
 * 写入 JSON 文件
 */
export async function writeJson(
    filePath: string,
    data: unknown,
    indent: number = 2
): Promise<void> {
    const content = JSON.stringify(data, null, indent)
    await writeText(filePath, content)
}

/**
 * 写入 Buffer
 */
export async function writeBuffer(filePath: string, buffer: Buffer): Promise<void> {
    await ensureDirExists(dirname(filePath))
    await writeFile(filePath, buffer)
}

/**
 * 追加内容到文件
 */
export async function appendText(
    filePath: string,
    content: string,
    encoding: BufferEncoding = 'utf8'
): Promise<void> {
    await ensureDirExists(dirname(filePath))
    await appendFile(filePath, content, encoding)
}

// ==================== 目录操作 ====================

/**
 * 确保目录存在
 */
export async function ensureDirExists(dirPath: string): Promise<void> {
    await ensureDir(dirPath)
}

/**
 * 确保文件所在目录存在
 */
export async function ensureFileDir(filePath: string): Promise<void> {
    await ensureDirExists(dirname(filePath))
}

/**
 * 读取目录内容
 */
export async function readDir(dirPath: string): Promise<string[]> {
    return readdir(dirPath)
}

/**
 * 读取目录内容（包含文件信息）
 */
export async function readDirWithStats(dirPath: string): Promise<
    Array<{
        name: string
        path: string
        isFile: boolean
        isDirectory: boolean
        size: number
    }>
> {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const results: Array<{
        name: string
        path: string
        isFile: boolean
        isDirectory: boolean
        size: number
    }> = []

    for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        const fileStat = await stat(fullPath)
        results.push({
            name: entry.name,
            path: fullPath,
            isFile: entry.isFile(),
            isDirectory: entry.isDirectory(),
            size: fileStat.size
        })
    }

    return results
}

/**
 * 创建目录（递归）
 */
export async function createDir(dirPath: string): Promise<void> {
    await ensureDir(dirPath)
}

/**
 * 删除目录（递归）
 */
export async function removeDir(dirPath: string): Promise<void> {
    await remove(dirPath)
}

/**
 * 清空目录
 */
export async function emptyDir(dirPath: string): Promise<void> {
    await fsEmptyDir(dirPath)
}

// ==================== 文件操作 ====================

/**
 * 复制文件
 */
export async function copyFile(src: string, dest: string): Promise<void> {
    await ensureDir(dirname(dest))
    await copy(src, dest, { overwrite: true, errorOnExist: false })
}

/**
 * 复制目录
 */
export async function copyDir(src: string, dest: string): Promise<void> {
    await copy(src, dest, { overwrite: true })
}

/**
 * 移动文件
 */
export async function moveFile(src: string, dest: string): Promise<void> {
    await ensureDir(dirname(dest))
    await move(src, dest, { overwrite: true })
}

/**
 * 删除文件
 */
export async function removeFile(filePath: string): Promise<void> {
    try {
        await remove(filePath)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error
        }
    }
}

/**
 * 重命名文件
 */
export async function renameFile(oldPath: string, newPath: string): Promise<void> {
    await move(oldPath, newPath, { overwrite: true })
}

// ==================== 文件大小 ====================

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/**
 * 格式化文件大小
 */
export function formatSize(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 B'

    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${SIZE_UNITS[i]}`
}

/**
 * 解析文件大小字符串
 */
export function parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^([0-9.]+)\s*([A-Z]*B?)$/i)
    if (!match) throw new Error(`Invalid size format: ${sizeStr}`)

    const [, numStr, unit] = match
    const num = parseFloat(numStr)
    const unitIndex = SIZE_UNITS.findIndex((u) => u.toLowerCase() === unit.toLowerCase())

    if (unitIndex === -1) throw new Error(`Unknown size unit: ${unit}`)

    return num * Math.pow(1024, unitIndex)
}

// ==================== 文件名处理 ====================

/**
 * 清理文件名（移除非法字符）
 */
export function sanitizeFilename(filename: string, replacement: string = '_'): string {
    return filename
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, replacement)
        .replace(/^\.+/, '')
        .replace(/\.+$/, '')
        .replace(/\s+/g, replacement)
        .substring(0, 255)
}

/**
 * 生成唯一文件名
 */
export function uniqueFilename(baseName: string, ext: string = ''): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `${baseName}_${timestamp}_${random}${ext}`
}

/**
 * 验证文件路径是否合法
 */
export function isValidPath(filePath: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false

    // 检查非法字符（Windows）
    const invalidChars = /[<>:"|?*\x00-\x1f]/
    if (invalidChars.test(filePath)) return false

    // 检查保留名称（Windows）
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i
    const fileName = basename(filePath)
    if (reservedNames.test(fileName)) return false

    return true
}

// ==================== 文件类型检测 ====================

const BINARY_EXTENSIONS = new Set([
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.bin',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.ico',
    '.webp',
    '.mp3',
    '.mp4',
    '.avi',
    '.mov',
    '.mkv',
    '.wav',
    '.flac',
    '.zip',
    '.tar',
    '.gz',
    '.rar',
    '.7z',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.ttf',
    '.otf',
    '.woff',
    '.woff2',
    '.eot'
])

const TEXT_EXTENSIONS = new Set([
    '.txt',
    '.md',
    '.json',
    '.xml',
    '.yaml',
    '.yml',
    '.toml',
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.mjs',
    '.cjs',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.styl',
    '.html',
    '.htm',
    '.vue',
    '.svelte',
    '.py',
    '.rb',
    '.php',
    '.java',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.go',
    '.rs',
    '.swift',
    '.kt',
    '.scala',
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.ps1',
    '.bat',
    '.cmd',
    '.sql',
    '.graphql',
    '.prisma',
    '.env',
    '.gitignore',
    '.editorconfig',
    '.prettierrc'
])

/**
 * 检查是否为二进制文件
 */
export function isBinaryFile(filePath: string): boolean {
    return BINARY_EXTENSIONS.has(getExtension(filePath))
}

/**
 * 检查是否为文本文件
 */
export function isTextFile(filePath: string): boolean {
    return TEXT_EXTENSIONS.has(getExtension(filePath))
}

/**
 * 获取文件 MIME 类型
 */
export function getMimeType(filePath: string): string {
    const ext = getExtension(filePath)
    const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip'
    }
    return mimeTypes[ext] || 'application/octet-stream'
}

// ==================== 路径安全检查 ====================

/**
 * 检查路径是否在指定目录内（防止路径遍历攻击）
 */
export function isPathInside(childPath: string, parentPath: string): boolean {
    const resolvedChild = resolve(childPath)
    const resolvedParent = resolve(parentPath)
    return resolvedChild.startsWith(resolvedParent + (resolvedParent.endsWith('/') ? '' : '/'))
}

/**
 * 获取安全的相对路径
 */
export function getSafeRelativePath(from: string, to: string): string {
    const rel = relative(from, to)
    // 防止路径遍历
    if (rel.startsWith('..')) {
        throw new Error('Path traversal detected')
    }
    return rel
}

// ==================== Result 包装辅助 ====================

interface FileInfo {
    path: string
    name: string
    size: number
    isFile: boolean
    isDirectory: boolean
    modified: Date
}

interface SearchMatch {
    line: number
    content: string
}

interface SearchResult {
    file: string
    matches: SearchMatch[]
}

interface DirEntry {
    name: string
    path: string
    isFile: boolean
    isDirectory: boolean
    size: number
}

/**
 * 统一把命令式操作收敛为 Result：成功返回 data，异常返回 { success:false, error }
 */
async function withResult<R>(fn: () => Promise<R>, msg: string): Promise<Result<R>> {
    try {
        return { success: true, data: await fn() }
    } catch (error) {
        return {
            success: false,
            error: `${msg}: ${error instanceof Error ? error.message : String(error)}`
        }
    }
}

// ==================== 文件操作（Result 包装） ====================

/**
 * 读取文件（Result 包装）。支持按行范围读取。
 */
export function readFileResult(
    path: string,
    options?: { encoding?: BufferEncoding; startLine?: number; endLine?: number }
): Promise<Result<string>> {
    return withResult(async () => {
        if (options?.startLine || options?.endLine) {
            const lines = await readLines(path, options.startLine, options.endLine)
            return lines.join('\n')
        }
        return readText(path, options?.encoding)
    }, '读取文件失败')
}

/**
 * 写入文件（Result 包装）。可选写前备份。
 */
export function writeFileResult(
    path: string,
    content: string,
    options?: { createBackup?: boolean }
): Promise<Result<void>> {
    return withResult(async () => {
        if (options?.createBackup && (await exists(path))) {
            await copyFile(path, `${path}.bak`)
        }
        await writeText(path, content)
    }, '写入文件失败')
}

/**
 * 追加文件（Result 包装）
 */
export function appendFileResult(path: string, content: string): Promise<Result<void>> {
    return withResult(() => appendText(path, content), '追加文件失败')
}

/**
 * 创建文件（Result 包装）
 */
export function createFileResult(path: string, content: string = ''): Promise<Result<void>> {
    return withResult(() => writeText(path, content), '创建文件失败')
}

/**
 * 删除文件（Result 包装）
 */
export function deleteFileResult(path: string): Promise<Result<void>> {
    return withResult(() => removeFile(path), '删除文件失败')
}

/**
 * 复制文件（Result 包装）。不覆盖已存在目标（除非 overwrite=true）。
 */
export function copyFileResult(
    src: string,
    dest: string,
    overwrite?: boolean
): Promise<Result<void>> {
    return withResult(async () => {
        if (!overwrite && (await exists(dest))) throw new Error('目标文件已存在')
        await copyFile(src, dest)
    }, '复制文件失败')
}

/**
 * 移动文件（Result 包装）。不覆盖已存在目标（除非 overwrite=true）。
 */
export function moveFileResult(
    src: string,
    dest: string,
    overwrite?: boolean
): Promise<Result<void>> {
    return withResult(async () => {
        if (!overwrite && (await exists(dest))) throw new Error('目标文件已存在')
        await moveFile(src, dest)
    }, '移动文件失败')
}

/**
 * 检查存在（Result 包装）
 */
export function existsResult(path: string): Promise<Result<boolean>> {
    return withResult(() => exists(path), '检查文件失败')
}

/**
 * 获取文件信息（Result 包装）
 */
export function getFileInfoResult(path: string): Promise<Result<FileInfo>> {
    return withResult(async () => {
        const info = await getFileInfo(path)
        if (!info) throw new Error('文件不存在')
        return {
            path: info.path,
            name: info.name,
            size: info.size,
            isFile: info.isFile,
            isDirectory: info.isDirectory,
            modified: info.modifiedAt
        }
    }, '获取文件信息失败')
}

// ==================== 目录操作（Result 包装） ====================

/**
 * 创建目录（Result 包装）
 */
export function createDirResult(path: string): Promise<Result<void>> {
    return withResult(() => createDir(path), '创建目录失败')
}

/**
 * 删除目录（Result 包装）
 */
export function removeDirResult(path: string): Promise<Result<void>> {
    return withResult(() => removeDir(path), '删除目录失败')
}

/**
 * 清空目录（Result 包装）
 */
export function cleanDirResult(path: string): Promise<Result<void>> {
    return withResult(() => emptyDir(path), '清空目录失败')
}

/**
 * 列出目录（Result 包装）
 */
export function listDirResult(
    path: string,
    options?: {
        recursive?: boolean
        maxDepth?: number
        includeHidden?: boolean
        filter?: string
        fileTypes?: string[]
    }
): Promise<Result<DirEntry[]>> {
    return withResult(async () => {
        const entries = await readDirWithStats(path)
        let results: DirEntry[] = entries

        if (!options?.includeHidden) {
            results = results.filter((e) => !e.name.startsWith('.'))
        }
        if (options?.fileTypes && options.fileTypes.length > 0) {
            results = results.filter(
                (e) => e.isDirectory || options.fileTypes!.includes(getExtension(e.name))
            )
        }
        if (options?.filter) {
            const pattern = new RegExp(options.filter.replace(/\*/g, '.*'), 'i')
            results = results.filter((e) => pattern.test(e.name))
        }
        return results
    }, '列出目录失败')
}

/**
 * 复制目录（Result 包装）。不覆盖已存在目标（除非 overwrite=true）。
 */
export function copyDirResult(
    src: string,
    dest: string,
    overwrite?: boolean
): Promise<Result<void>> {
    return withResult(async () => {
        if (!overwrite && (await exists(dest))) throw new Error('目标目录已存在')
        await copyDir(src, dest)
    }, '复制目录失败')
}

/**
 * 递归计算目录大小（Result 包装）
 */
export function getDirSizeResult(path: string): Promise<Result<number>> {
    return withResult(async () => {
        const entries = await readDirWithStats(path)
        let totalSize = 0
        for (const entry of entries) {
            if (entry.isFile) {
                totalSize += entry.size
            } else if (entry.isDirectory) {
                const sub = await getDirSizeResult(entry.path)
                if (sub.success && sub.data) totalSize += sub.data
            }
        }
        return totalSize
    }, '获取目录大小失败')
}

// ==================== 搜索与替换操作 ====================

function matchLines(content: string, regex: RegExp): SearchMatch[] {
    const lines = content.split('\n')
    const matches: SearchMatch[] = []
    for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
            matches.push({ line: i + 1, content: lines[i].trim() })
        }
        regex.lastIndex = 0
    }
    return matches
}

async function collectSearch(
    dir: string,
    options: { pattern: string; caseSensitive?: boolean; recursive?: boolean; maxResults?: number },
    results: SearchResult[]
): Promise<void> {
    const entries = await readDirWithStats(dir)
    const regex = new RegExp(options.pattern, options.caseSensitive ? 'g' : 'gi')
    for (const entry of entries) {
        if (results.length >= (options.maxResults ?? 1000)) return
        if (entry.isFile && isTextFile(entry.path)) {
            const matches = matchLines(await readText(entry.path), regex)
            if (matches.length > 0) results.push({ file: entry.path, matches })
        } else if (entry.isDirectory && options.recursive !== false) {
            await collectSearch(entry.path, options, results)
        }
    }
}

/**
 * 搜索文件内容（Result 包装）
 */
export function searchContent(
    dirPath: string,
    options: {
        pattern: string
        caseSensitive?: boolean
        recursive?: boolean
        maxResults?: number
        contextLines?: number
    }
): Promise<Result<SearchResult[]>> {
    return withResult(async () => {
        const results: SearchResult[] = []
        await collectSearch(dirPath, options, results)
        return results
    }, '搜索失败')
}

async function collectFileMatches(
    dir: string,
    regex: RegExp,
    fileTypes: string[] | undefined,
    results: Array<{ path: string; name: string }>,
    recursive = true
): Promise<void> {
    const entries = await readDirWithStats(dir)
    for (const entry of entries) {
        if (entry.isFile && regex.test(entry.name)) {
            if (!fileTypes || fileTypes.includes(getExtension(entry.name))) {
                results.push({ path: entry.path, name: entry.name })
            }
        } else if (entry.isDirectory && recursive) {
            await collectFileMatches(entry.path, regex, fileTypes, results, recursive)
        }
    }
}

/**
 * 按名称搜索文件（Result 包装）
 */
export function searchFiles(
    dirPath: string,
    pattern: string,
    options?: { recursive?: boolean; fileTypes?: string[] }
): Promise<Result<Array<{ path: string; name: string }>>> {
    return withResult(async () => {
        const results: Array<{ path: string; name: string }> = []
        const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i')
        await collectFileMatches(dirPath, regex, options?.fileTypes, results)
        return results
    }, '搜索文件失败')
}

/**
 * 替换单个文件内容（Result 包装）
 */
export function replaceContent(
    filePath: string,
    options: {
        pattern: string
        replacement: string
        caseSensitive?: boolean
        createBackup?: boolean
        dryRun?: boolean
    }
): Promise<Result<{ replacements: number }>> {
    return withResult(async () => {
        const content = await readText(filePath)
        const regex = new RegExp(options.pattern, options.caseSensitive ? 'g' : 'gi')
        const matches = content.match(regex)
        const replacements = matches ? matches.length : 0

        if (!options.dryRun && replacements > 0) {
            if (options.createBackup) await copyFile(filePath, `${filePath}.bak`)
            await writeText(filePath, content.replace(regex, options.replacement))
        }
        return { replacements }
    }, '替换失败')
}

/**
 * 批量替换目录下文件内容（Result 包装）
 */
export function replaceInFiles(
    dirPath: string,
    options: {
        pattern: string
        replacement: string
        filePattern?: string
        caseSensitive?: boolean
        dryRun?: boolean
    }
): Promise<Result<{ files: number; replacements: number }>> {
    return withResult(async () => {
        let totalFiles = 0
        let totalReplacements = 0

        const filesResult = await searchFiles(dirPath, options.filePattern || '*')
        if (!filesResult.success || !filesResult.data) throw new Error(filesResult.error)

        for (const f of filesResult.data) {
            const result = await replaceContent(f.path, {
                pattern: options.pattern,
                replacement: options.replacement,
                caseSensitive: options.caseSensitive,
                dryRun: options.dryRun
            })
            if (result.success && result.data && result.data.replacements > 0) {
                totalFiles++
                totalReplacements += result.data.replacements
            }
        }
        return { files: totalFiles, replacements: totalReplacements }
    }, '批量替换失败')
}

// ==================== 批量操作 ====================

/**
 * 批量创建文件（Result 包装）
 */
export function batchCreate(
    files: Array<{ path: string; content?: string }>
): Promise<Result<{ created: number }>> {
    return withResult(async () => {
        let created = 0
        for (const f of files) {
            await writeText(f.path, f.content || '')
            created++
        }
        return { created }
    }, '批量创建失败')
}

/**
 * 批量删除文件（Result 包装）
 */
export function batchDelete(paths: string[]): Promise<Result<{ deleted: number }>> {
    return withResult(async () => {
        let deleted = 0
        for (const p of paths) {
            await removeFile(p)
            deleted++
        }
        return { deleted }
    }, '批量删除失败')
}

/**
 * 批量复制文件（Result 包装）
 */
export function batchCopy(
    files: Array<{ src: string; dest: string }>,
    overwrite?: boolean
): Promise<Result<{ copied: number }>> {
    return withResult(async () => {
        let copied = 0
        for (const f of files) {
            if (!overwrite && (await exists(f.dest))) continue
            await copyFile(f.src, f.dest)
            copied++
        }
        return { copied }
    }, '批量复制失败')
}

/**
 * 批量移动文件（Result 包装）
 */
export function batchMove(
    files: Array<{ src: string; dest: string }>,
    overwrite?: boolean
): Promise<Result<{ moved: number }>> {
    return withResult(async () => {
        let moved = 0
        for (const f of files) {
            if (!overwrite && (await exists(f.dest))) continue
            await moveFile(f.src, f.dest)
            moved++
        }
        return { moved }
    }, '批量移动失败')
}

// ==================== 重新导出 fs-extra 常用函数 ====================

export { pathExists, ensureDir, copy, move, remove }

// ==================== 默认导出 ====================

export default {
    // 路径处理
    dirname,
    basename,
    extname,
    join,
    resolve,
    relative,
    normalize,
    isAbsolute,
    getHomedir,
    getTmpdir,
    normalizePath,
    getExtension,
    getBasename,
    changeExtension,
    // 文件检测
    exists,
    isFile,
    isDirectory,
    getFileInfo,
    getFileSize,
    getModifiedTime,
    pathExists,
    // 文件读写
    readText,
    readJson,
    readBuffer,
    readLines,
    getLineCount,
    writeText,
    writeJson,
    writeBuffer,
    appendText,
    // 目录操作
    ensureDirExists,
    ensureFileDir,
    ensureDir,
    readDir,
    readDirWithStats,
    createDir,
    removeDir,
    emptyDir,
    // 文件操作
    copyFile,
    copyDir,
    copy,
    moveFile,
    move,
    removeFile,
    remove,
    renameFile,
    // 文件大小
    formatSize,
    parseSize,
    // 文件名处理
    sanitizeFilename,
    uniqueFilename,
    isValidPath,
    // 文件类型检测
    isBinaryFile,
    isTextFile,
    getMimeType,
    // 路径安全
    isPathInside,
    getSafeRelativePath,
    // Result 包装操作
    readFileResult,
    writeFileResult,
    appendFileResult,
    createFileResult,
    deleteFileResult,
    copyFileResult,
    moveFileResult,
    existsResult,
    getFileInfoResult,
    createDirResult,
    removeDirResult,
    cleanDirResult,
    listDirResult,
    copyDirResult,
    getDirSizeResult,
    // 搜索操作
    searchContent,
    searchFiles,
    replaceContent,
    replaceInFiles,
    // 批量操作
    batchCreate,
    batchDelete,
    batchCopy,
    batchMove
}
