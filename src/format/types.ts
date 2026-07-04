/**
 * 格式化工具类型定义
 *
 * 独立的格式化模块，可被多处复用
 */

// ==================== 格式化器类型 ====================

/** 格式化工具类型 */
export type FormatterType = 'prettier' | 'eslint' | 'both' | 'none'

/** 格式化选项 */
export interface FormatOptions {
    /** 是否写入文件 */
    write?: boolean
    /** 强制使用的格式化工具 */
    forceFormatter?: FormatterType
    /** ESLint 选项 */
    eslintOptions?: {
        fix?: boolean
        configFile?: string
        ignorePath?: string
    }
    /** Prettier 选项 */
    prettierOptions?: {
        configFile?: string
        ignorePath?: string
        parser?: string
    }
}

/** 格式化结果 */
export interface FormatResult {
    /** 格式化后的内容 */
    formatted: string
    /** 是否发生更改 */
    changed: boolean
    /** 使用的格式化工具 */
    formatter: FormatterType
    /** 错误信息 */
    errors: string[]
    /** 警告信息 */
    warnings: string[]
    /** 耗时 */
    duration: number
}

/** 批量格式化结果 */
export interface BatchFormatResult {
    /** 总文件数 */
    total: number
    /** 成功数 */
    success: number
    /** 失败数 */
    failed: number
    /** 更改数 */
    changed: number
    /** 详细结果 */
    results: Array<{
        filePath: string
        result: FormatResult
    }>
    /** 总耗时 */
    duration: number
}

// ==================== 项目配置类型 ====================

/** 项目格式化配置 */
export interface ProjectFormatConfig {
    /** 项目根目录 */
    rootDir: string
    /** 是否有 ESLint */
    hasEslint: boolean
    /** 是否有 Prettier */
    hasPrettier: boolean
    /** 推荐的格式化工具 */
    recommendedFormatter: FormatterType
    /** ESLint 配置路径 */
    eslintConfigPath?: string
    /** Prettier 配置路径 */
    prettierConfigPath?: string
    /** ESLint 忽略文件路径 */
    eslintIgnorePath?: string
    /** Prettier 忽略文件路径 */
    prettierIgnorePath?: string
}

// ==================== 解析器类型 ====================

/** Prettier 解析器 */
export type PrettierParser =
    | 'babel'
    | 'babel-flow'
    | 'babel-ts'
    | 'flow'
    | 'typescript'
    | 'espree'
    | 'meriyah'
    | 'acorn'
    | 'css'
    | 'scss'
    | 'less'
    | 'html'
    | 'vue'
    | 'angular'
    | 'lwc'
    | 'markdown'
    | 'mdx'
    | 'yaml'
    | 'graphql'
    | 'json'
    | 'json5'
    | 'jsonc'

/** 扩展名到解析器映射 */
export const EXT_TO_PARSER: Record<string, PrettierParser> = {
    '.js': 'babel',
    '.mjs': 'babel',
    '.cjs': 'babel',
    '.jsx': 'babel',
    '.ts': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.tsx': 'typescript',
    '.vue': 'vue',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'scss',
    '.less': 'less',
    '.html': 'html',
    '.htm': 'html',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.mdx': 'mdx',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.json': 'json',
    '.json5': 'json5',
    '.graphql': 'graphql',
    '.gql': 'graphql'
}

// ==================== 支持的文件类型 ====================

/** ESLint 支持的扩展名 */
export const ESLINT_EXTENSIONS = [
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.mts',
    '.cts',
    '.tsx',
    '.vue'
]

/** Prettier 支持的扩展名 */
export const PRETTIER_EXTENSIONS = [
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.mts',
    '.cts',
    '.tsx',
    '.vue',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.html',
    '.htm',
    '.md',
    '.markdown',
    '.mdx',
    '.yaml',
    '.yml',
    '.json',
    '.json5',
    '.graphql',
    '.gql'
]
