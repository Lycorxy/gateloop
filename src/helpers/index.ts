/**
 * 辅助函数模块
 *
 * 提供通用的工具函数，包括：
 * - exec: 跨平台命令执行
 * - data: 数据处理（对象、数组）
 * - date: 日期处理
 * - file: 文件处理
 * - type: 类型判断
 * - async: 异步处理
 * - string: 字符串处理
 */

// ==================== 跨平台命令执行 ====================
export {
    // 类型
    type ExecResult,
    type ExecOptions,
    type EnvInfo,
    type BatchCommand,
    // 平台检测
    platform,
    isWindows,
    isMac,
    isLinux,
    getDefaultShell,
    // 核心执行
    exec,
    execShell,
    execScript,
    // 包管理器
    npmRun as execNpm,
    npx as execNpx,
    git as execGit,
    // 跨平台
    crossExec,
    crossCommand,
    // 环境信息
    getEnvInfo,
    // 命令检测
    commandExists,
    getCommandPath,
    // 批量执行
    execParallel,
    execSequence,
    execPipe
} from './exec'

// ==================== 数据处理 ====================
export {
    // 深拷贝与合并
    deepClone,
    deepMerge,
    // 对象操作
    isPlainObject,
    getNestedValue,
    setNestedValue,
    deleteNestedValue,
    flattenObject,
    unflattenObject,
    // 数组操作
    unique,
    groupBy,
    chunk,
    shuffle,
    // 数字操作
    clamp,
    random,
    // 异步操作（基础）
    delay,
    retry,
    limitConcurrency,
    withTimeout
} from './data'

// ==================== 日期处理 ====================
export {
    // 格式化
    formatDate,
    toISOString,
    formatRelative,
    formatDuration,
    // 解析
    toDate,
    parseDate,
    // 计算
    addTime,
    diffTime,
    // 判断
    isValidDate,
    isSameDay,
    isToday,
    isLeapYear,
    // 获取
    getDaysInMonth,
    getDayOfWeek,
    getDayOfYear,
    getWeekStart,
    getMonthStart,
    getYearStart,
    // 工具
    now,
    today
} from './date'

// ==================== 文件处理 ====================
export {
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
    ensureDir,
    ensureDirExists,
    ensureFileDir,
    readDir,
    readDirWithStats,
    createDir,
    // 文件操作
    copyFile,
    copyDir,
    copy,
    moveFile,
    move,
    removeFile,
    remove,
    removeDir,
    emptyDir,
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
} from './file'

// ==================== 类型判断 ====================
export {
    // 基础类型
    isString,
    isNumber,
    isBoolean,
    isFunction,
    isSymbol,
    isBigInt,
    // 空值判断
    isNull,
    isUndefined,
    isNullish,
    isEmpty,
    // 对象类型
    isObject,
    isPlainObject as isPlainObj,
    isArray,
    isTypedArray,
    isDate,
    isRegExp,
    isError,
    isMap,
    isSet,
    isWeakMap,
    isWeakSet,
    // Promise 和异步
    isPromise,
    isPromiseLike,
    isAsyncFunction,
    isGeneratorFunction,
    // 数字类型
    isInteger,
    isSafeInteger,
    isFinite,
    isNaN,
    isPositive,
    isNegative,
    // 字符串类型
    isNumericString,
    isJsonString,
    isUrl,
    isEmail,
    isUuid,
    // Node.js 特定
    isBuffer,
    isArrayBuffer,
    isSharedArrayBuffer,
    // 类型获取
    getType,
    getConstructorName,
    // 类型断言
    assertDefined,
    assertType
} from './type'

// ==================== 异步处理 ====================
export {
    // 延迟与定时
    delay as sleep,
    delayValue,
    cancellableDelay,
    // 超时控制
    withTimeout as timeout,
    withTimeoutDefault,
    // 重试机制
    retry as retryAsync,
    type RetryOptions,
    // 并发控制
    limitConcurrency as parallel,
    createConcurrencyLimiter,
    // Promise 工具
    settleAll,
    filterFulfilled,
    createDeferred,
    // 队列处理
    serial,
    pipe,
    // 防抖与节流
    debounce,
    throttle,
    debounceAsync,
    // 锁机制
    createMutex
} from './async'

// ==================== 字符串处理 ====================
export {
    // 大小写转换
    kebabCase as toKebab,
    camelCase as toCamel,
    pascalCase,
    snakeCase,
    constantCase,
    capitalize as toCapitalize,
    uncapitalize,
    // 字符串处理
    truncate as truncateStr,
    pad,
    trim,
    trimStart,
    trimEnd,
    // 字符串检测
    startsWith,
    endsWith,
    contains,
    isBlank,
    isNotBlank,
    // 字符串转换
    repeat,
    reverse,
    words,
    countOccurrences,
    // 模板处理
    template as templateStr,
    format,
    // 转义处理
    escapeRegExp,
    escapeHtml,
    unescapeHtml,
    // 编码处理
    base64Encode,
    base64Decode,
    base64UrlEncode,
    base64UrlDecode,
    // 随机字符串
    randomString as randomStr,
    randomHex,
    uuid as generateUuid,
    shortId
} from './string'

// ==================== HTTP/HTTPS 请求 ====================
export {
    // 核心方法
    request,
    // 统一门面
    http,
    // 便捷方法
    httpGet,
    httpPost,
    httpPut,
    httpPatch,
    httpDelete,
    httpHead,
    httpOptions,
    // 错误
    HttpError,
    // 类型
    type HttpMethod,
    type HttpRequestOptions,
    type HttpResponse,
    type HttpResponseType,
    type HttpRetryOptions
} from './http'

// ==================== 代码格式化 ====================
export {
    detectFormatConfig,
    formatFile,
    formatFiles,
    EXT_TO_PARSER,
    ESLINT_EXTENSIONS,
    PRETTIER_EXTENSIONS
} from '../format'

export type {
    FormatterType,
    FormatOptions,
    FormatResult,
    BatchFormatResult,
    ProjectFormatConfig
} from '../format'
