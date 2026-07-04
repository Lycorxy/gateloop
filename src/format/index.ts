/**
 * 格式化工具模块
 *
 * 独立的格式化模块，可被 lint 模块复用
 */

export { detectFormatConfig, formatFile, formatFiles } from './formatter'

export type {
    FormatterType,
    FormatOptions,
    FormatResult,
    BatchFormatResult,
    ProjectFormatConfig
} from './types'

export { EXT_TO_PARSER, ESLINT_EXTENSIONS, PRETTIER_EXTENSIONS } from './types'
