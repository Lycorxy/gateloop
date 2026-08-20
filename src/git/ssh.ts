/**
 * SSH 自动配置工具
 *
 * 一键配置 SSH Key，支持 GitHub/GitLab/Gitee/腾讯工蜂(git.woa.com)/自定义平台。
 * 支持多帐号配置、常见问题诊断、Windows 路径适配。
 *
 * 远程 Key 管理（注册/查询/删除/验证 Token）已拆分到 ssh-remote.ts。
 * token 来源由 auth.ts 的 ensureToken() 自动获取，调用方无需传 token。
 */

import { execSync } from 'node:child_process'
import {
    mkdirSync,
    existsSync,
    readFileSync,
    readdirSync,
    appendFileSync,
    writeFileSync,
    unlinkSync,
    chmodSync
} from 'node:fs'
import { homedir, platform, hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import { ensureToken, openUrl, copyToClipboard } from './auth'
import { uploadKey as uploadKeyRemote } from './ssh-remote'
import type {
    SSHSetupOptions,
    SSHAccount,
    SSHTroubleshootResult,
    SSHTroubleshootCheck,
    UploadKeyResult,
    GitResult
} from './types'

// ==================== 常量 ====================

const SSH_DIR = join(homedir(), '.ssh')
const SSH_CONFIG_PATH = join(SSH_DIR, 'config')
const IS_WIN = platform() === 'win32'

/** 平台默认配置 */
const PLATFORM_CONFIGS: Record<
    string,
    { host: string; user: string; port: number; addKeyUrl: string }
> = {
    github: {
        host: 'github.com',
        user: 'git',
        port: 22,
        addKeyUrl: 'https://github.com/settings/ssh/new'
    },
    gitlab: {
        host: 'gitlab.com',
        user: 'git',
        port: 22,
        addKeyUrl: 'https://gitlab.com/-/profile/keys'
    },
    gitee: {
        host: 'gitee.com',
        user: 'git',
        port: 22,
        addKeyUrl: 'https://gitee.com/profile/sshkeys'
    },
    gitcode: {
        host: 'git.woa.com',
        user: 'git',
        port: 22,
        addKeyUrl: 'https://git.woa.com/profile/keys'
    }
}

/** 路径转 POSIX 风格（Windows 下 SSH config 需要正斜杠） */
function toPosixPath(p: string): string {
    return IS_WIN ? p.replace(/\\/g, '/') : p
}

/** 获取本机用户标识（用于密钥注释） */
function getUserTag(): string {
    try {
        const u = userInfo().username || 'user'
        return `${u}@${hostname()}`
    } catch {
        return 'nut-git@localhost'
    }
}

// ==================== SSH 管理器 ====================

/** setup 上下文 */
interface SetupContext {
    pf: string
    email?: string
    keyType: string
    keyBits: number
    account?: string
    force: boolean
    skipUpload: boolean
    host: string
    user: string
    port: number
    keyPath: string
    pubKeyPath: string
    platConf?: { host?: string; user?: string; port?: number; addKeyUrl?: string }
}

/** 解析 clean 上下文：hostAlias + 候选密钥路径 */
function resolveCleanContext(
    platform: string,
    account?: string
): { hostAlias: string; keyCandidates: string[] } {
    const platConf = PLATFORM_CONFIGS[platform]
    const host = platConf?.host || platform
    const hostAlias = account ? `${host}-${account}` : host
    const suffix = account ? `_${account}` : ''

    return {
        hostAlias,
        keyCandidates: [
            join(SSH_DIR, `id_ed25519_${platform}${suffix}`),
            join(SSH_DIR, `id_rsa_${platform}${suffix}`)
        ]
    }
}

/** 查找公钥路径：先按命名约定查找，再从 SSH config 解析 */
function findPubKeyPath(hostOrPlatform: string): string {
    const candidates = [
        join(SSH_DIR, `id_ed25519_${hostOrPlatform}.pub`),
        join(SSH_DIR, `id_rsa_${hostOrPlatform}.pub`),
        join(SSH_DIR, `${hostOrPlatform}.pub`),
        join(SSH_DIR, 'id_ed25519.pub'),
        join(SSH_DIR, 'id_rsa.pub')
    ]

    for (const c of candidates) {
        if (existsSync(c)) return c
    }

    return findKeyFromConfig(hostOrPlatform)
}

/** 从 SSH config 解析 IdentityFile */
function findKeyFromConfig(hostOrPlatform: string): string {
    if (!existsSync(SSH_DIR) || !existsSync(SSH_CONFIG_PATH)) return ''

    const config = readFileSync(SSH_CONFIG_PATH, 'utf-8')
    const match = config.match(new RegExp(`Host ${hostOrPlatform}[\\s\\S]*?IdentityFile\\s+(\\S+)`))
    if (!match) return ''

    const pubCandidate = `${match[1]}.pub`
    return existsSync(pubCandidate) ? pubCandidate : ''
}

/** 解析 setup options 为上下文 */
function resolveSetupContext(options: SSHSetupOptions): SetupContext {
    const {
        platform: pf = 'github',
        email,
        keyType = 'ed25519',
        keyBits = 4096,
        account,
        force = false,
        skipUpload = false
    } = options

    const platConf = PLATFORM_CONFIGS[pf]
    const host = options.host || platConf?.host || 'custom-host'
    const user = options.user || platConf?.user || 'git'
    const port = options.port || platConf?.port || 22

    const keySuffix = account ? `_${account}` : ''
    const keyName = options.keyName || `id_${keyType}_${pf}${keySuffix}`
    const keyPath = join(SSH_DIR, keyName)

    return {
        pf,
        email,
        keyType,
        keyBits,
        account,
        force,
        skipUpload,
        host,
        user,
        port,
        keyPath,
        pubKeyPath: `${keyPath}.pub`,
        platConf
    }
}

export class SSHManager {
    private cwd: string

    constructor(cwd?: string) {
        this.cwd = cwd || process.cwd()
    }

    /**
     * 一键配置 SSH
     *
     * 流程：验证 Token → 生成/复用密钥 → 配置 config → 添加 agent → 上传公钥 → 测试连接
     *
     * token 自动来源：auth.ensureToken()（OAuth device flow，缓存 ~/.gfrc 300 天）。
     * 调用方无需传 token；仅当 skipUpload=true 时跳过远程操作。
     *
     * @example
     * // 工蜂（自动授权 + 自动上传公钥）
     * await ssh.setup({ platform: 'gitcode', email: 'name@tencent.com' })
     * // 强制覆盖已有密钥
     * await ssh.setup({ platform: 'gitcode', force: true })
     * // 自定义密钥名
     * await ssh.setup({ platform: 'gitcode', keyName: 'id_ed25519_auto' })
     */
    async setup(options: SSHSetupOptions): Promise<GitResult> {
        const startTime = Date.now()
        const setupCtx = resolveSetupContext(options)

        try {
            mkdirSync(SSH_DIR, { recursive: true })

            const keyResult = await this.prepareKey(setupCtx, startTime)
            if (!keyResult.ok) return keyResult.error!

            await this.updateSSHConfig(
                setupCtx.host,
                setupCtx.user,
                setupCtx.port,
                keyResult.keyPath!,
                setupCtx.account
            )
            this.addToAgent(keyResult.keyPath!)

            const uploadResult = await this.tryUploadKey(
                options,
                keyResult.pubKey!,
                setupCtx.skipUpload
            )
            const connectionTest = this.testConnection(setupCtx.host, setupCtx.user, setupCtx.port)

            return this.buildSetupResult(
                startTime,
                setupCtx,
                keyResult,
                uploadResult,
                connectionTest
            )
        } catch (error) {
            return this.failResult(
                startTime,
                `SSH 配置失败: ${error instanceof Error ? error.message : String(error)}`,
                'SETUP_FAILED'
            )
        }
    }

    /** 准备密钥：生成新密钥或复用已有 */
    private async prepareKey(
        ctx: SetupContext,
        startTime: number
    ): Promise<{ ok: boolean; keyPath?: string; pubKey?: string; error?: GitResult }> {
        const keyExists = existsSync(ctx.keyPath) && existsSync(ctx.pubKeyPath)
        if (keyExists && ctx.force) this.removeKeyFiles(ctx.keyPath)

        const shouldGenerate = ctx.force || !keyExists
        let pubKey = ''

        if (shouldGenerate) {
            const flag = ctx.keyType === 'ed25519' ? '-t ed25519' : `-t rsa -b ${ctx.keyBits}`
            const comment = ctx.email || getUserTag()
            try {
                execSync(`ssh-keygen ${flag} -f "${ctx.keyPath}" -N "" -C "${comment}"`, {
                    stdio: 'pipe',
                    cwd: this.cwd
                })
            } catch (error) {
                return {
                    ok: false,
                    error: this.failResult(
                        startTime,
                        `密钥生成失败: ${error instanceof Error ? error.message : String(error)}`,
                        'KEY_GENERATION_FAILED'
                    )
                }
            }
            pubKey = readFileSync(ctx.pubKeyPath, 'utf-8').trim()
        } else {
            pubKey = readFileSync(ctx.pubKeyPath, 'utf-8').trim()
        }

        return { ok: true, keyPath: ctx.keyPath, pubKey }
    }

    /**
     * 尝试上传公钥（跳过则返回 null）
     *
     * 兼容两种 token 方式：
     *   - 传了 --token（个人私有 token / PAT）→ 走 PRIVATE-TOKEN header，不触发 OAuth 授权
     *   - 没传 → 检测本地缓存，有则用（OAuth access_token，走 query 参数），无则触发 OAuth 授权
     */
    private async tryUploadKey(
        options: SSHSetupOptions,
        pubKey: string,
        skipUpload: boolean
    ): Promise<UploadKeyResult | null> {
        if (skipUpload) return null

        // 方式二：显式传入 PAT → pat 认证，不需要自动授权
        if (options.token) {
            return uploadKeyRemote(pubKey, options.token, undefined, 'pat')
        }

        // 方式一：OAuth 自动授权（检测缓存，无则触发授权）
        const token = await ensureToken()
        if (!token) return null
        return uploadKeyRemote(pubKey, token, undefined, 'oauth')
    }

    /** 构建 setup 成功结果 */
    private buildSetupResult(
        startTime: number,
        ctx: SetupContext,
        keyResult: { pubKey?: string; keyPath?: string },
        uploadResult: UploadKeyResult | null,
        connectionTest: string
    ): GitResult {
        const pubKey = keyResult.pubKey || ''
        const uploaded = uploadResult?.success === true
        const alreadyExists = uploadResult?.alreadyExists === true

        // 上传失败时兜底：自动打开添加页面 + 复制公钥到剪贴板，用户只需粘贴保存
        if (!uploaded && !alreadyExists && !ctx.skipUpload && ctx.platConf?.addKeyUrl && pubKey) {
            this.guideManualAdd(ctx.platConf.addKeyUrl, pubKey)
        }

        const nextSteps = this.buildSetupNextSteps({
            host: ctx.host,
            pubKey,
            addKeyUrl: ctx.platConf?.addKeyUrl,
            uploaded,
            alreadyExists,
            uploadError: uploadResult?.error,
            hasToken: Boolean(uploadResult),
            skipUpload: ctx.skipUpload
        })

        return {
            success: true,
            operation: 'stage',
            message: this.buildSetupMessage({
                generated: keyResult.pubKey !== undefined,
                uploaded,
                alreadyExists,
                connectionTest
            }),
            data: {
                platform: ctx.pf,
                keyType: ctx.keyType,
                keyPath: keyResult.keyPath,
                publicKey: pubKey,
                agentAdded: true,
                uploaded,
                alreadyExists,
                connectionTest,
                nextSteps
            },
            duration: Date.now() - startTime
        }
    }

    /**
     * 批量配置多帐号（个人 + 公共帐号）
     */
    async setupMultiAccount(
        pf: 'github' | 'gitlab' | 'gitee' | 'gitcode',
        accounts: SSHAccount[]
    ): Promise<GitResult> {
        const startTime = Date.now()
        const results: GitResult[] = []

        for (const acc of accounts) {
            const r = await this.setup({
                platform: pf,
                email: acc.email,
                account: acc.name,
                keyName: acc.keyName
            })
            results.push(r)
        }

        const allSuccess = results.every((r) => r.success)
        return {
            success: allSuccess,
            operation: 'stage',
            message: `多帐号配置${allSuccess ? '完成' : '部分失败'}: ${results.length} 个帐号`,
            data: { results: results.map((r) => ({ success: r.success, message: r.message })) },
            duration: Date.now() - startTime
        }
    }

    /**
     * 更新 SSH config 文件（幂等：重复运行不产生重复配置块）
     *
     * 配置块含 Host/HostName/User/Port/IdentityFile/IdentitiesOnly/StrictHostKeyChecking。
     */
    private async updateSSHConfig(
        host: string,
        user: string,
        port: number,
        keyPath: string,
        account?: string
    ): Promise<void> {
        const hostAlias = account ? `${host}-${account}` : host
        const identityFile = toPosixPath(keyPath)

        const configBlock = `
# ${hostAlias} - 由 ai-ultra 自动配置${account ? ` (${account})` : ''}
Host ${hostAlias}
    HostName ${host}
    User ${user}
    Port ${port}
    ControlMaster no
    ControlPath none
    IdentityFile ${identityFile}
    IdentitiesOnly yes
    PreferredAuthentications publickey
    StrictHostKeyChecking accept-new
`

        if (existsSync(SSH_CONFIG_PATH)) {
            const existing = readFileSync(SSH_CONFIG_PATH, 'utf-8')
            // 已存在同名 Host 块则先移除再追加（实现幂等更新）
            if (existing.includes(`Host ${hostAlias}`)) {
                const updated = this.removeConfigBlock(existing, hostAlias)
                writeFileSync(SSH_CONFIG_PATH, updated + configBlock, 'utf-8')
                return
            }
        }

        appendFileSync(SSH_CONFIG_PATH, configBlock, 'utf-8')

        try {
            chmodSync(SSH_CONFIG_PATH, 0o600)
        } catch {
            // Windows 可能不支持 chmod
        }
    }

    /**
     * 从 config 内容中移除指定 Host 块
     *
     * @param content config 文件内容
     * @param hostAlias Host 别名（如 git.woa.com）
     * @returns 移除后的内容
     */
    private removeConfigBlock(content: string, hostAlias: string): string {
        // 匹配 Host 块：从 `Host xxx` 到下一个 `Host ` 或文件末尾
        const pattern = new RegExp(
            `\\n?# ${hostAlias}[\\s\\S]*?Host ${hostAlias.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?(?=\\n?#|\\nHost |$)`,
            'g'
        )
        return content.replace(pattern, '').replace(/\n{3,}/g, '\n\n')
    }

    /**
     * 移除指定 Host 的 config 块并写回文件
     */
    private removeSSHConfigBlock(hostAlias: string): void {
        if (!existsSync(SSH_CONFIG_PATH)) return
        const content = readFileSync(SSH_CONFIG_PATH, 'utf-8')
        if (!content.includes(`Host ${hostAlias}`)) return
        const updated = this.removeConfigBlock(content, hostAlias)
        writeFileSync(SSH_CONFIG_PATH, updated, 'utf-8')
    }

    /**
     * 删除指定路径的密钥对文件（私钥 + 公钥）
     */
    private removeKeyFiles(keyPath: string): void {
        try {
            if (existsSync(keyPath)) unlinkSync(keyPath)
        } catch {
            // 忽略删除失败
        }
        try {
            const pubPath = `${keyPath}.pub`
            if (existsSync(pubPath)) unlinkSync(pubPath)
        } catch {
            // 忽略删除失败
        }
    }

    /** 添加密钥到 ssh-agent */
    private addToAgent(keyPath: string): boolean {
        try {
            try {
                execSync('ssh-add -l', { stdio: 'pipe' })
            } catch {
                try {
                    const agentOutput = execSync('ssh-agent -s', { stdio: 'pipe' }).toString()
                    const match = agentOutput.match(/SSH_AUTH_SOCK=([^;]+);.*SSH_AGENT_PID=(\d+)/)
                    if (match) {
                        process.env.SSH_AUTH_SOCK = match[1]
                        process.env.SSH_AGENT_PID = match[2]
                    }
                } catch {
                    // 无法启动 ssh-agent
                }
            }
            execSync(`ssh-add "${keyPath}"`, { stdio: 'pipe' })
            return true
        } catch {
            return false
        }
    }

    /** 测试 SSH 连接 */
    private testConnection(host: string, user: string, port: number): string {
        try {
            execSync(
                `ssh -T -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=5 -p ${port} ${user}@${host}`,
                { stdio: 'pipe', timeout: 10000 }
            )
            return '连接成功'
        } catch (err: unknown) {
            const errorObj = err as { stdout?: Buffer; stderr?: Buffer }
            const stderr = errorObj.stderr?.toString() || ''
            if (stderr.includes('successfully authenticated')) return 'SSH 连接验证成功'
            if (stderr.includes('Permission denied'))
                return 'Permission denied — 请将公钥添加到平台'
            if (stderr.includes('Connection timed out')) return `连接超时 — 检查网络/端口 ${port}`
            return stderr.slice(0, 200) || '连接测试失败（请将公钥添加到平台）'
        }
    }

    /**
     * 上传失败兜底：自动打开添加公钥页面 + 复制公钥到剪贴板
     * 用户只需在页面上 Ctrl+V 粘贴公钥并点击保存
     */
    private guideManualAdd(addKeyUrl: string, pubKey: string): void {
        const copied = copyToClipboard(pubKey)
        const opened = openUrl(addKeyUrl)

        console.log('\n========== 手动添加公钥 ==========')
        if (opened) {
            console.log('已自动打开添加公钥页面')
        } else {
            console.log(`请手动打开: ${addKeyUrl}`)
        }
        if (copied) {
            console.log('公钥已复制到剪贴板，页面粘贴框按 Ctrl+V 即可')
        } else {
            console.log('（剪贴板复制失败，请手动复制下方公钥）')
        }
        console.log('==================================\n')
    }

    /**
     * 构建 setup 结果的下一步指引
     */
    private buildSetupNextSteps(opts: {
        host: string
        pubKey: string
        addKeyUrl?: string
        uploaded: boolean
        alreadyExists: boolean
        uploadError?: string
        hasToken: boolean
        skipUpload: boolean
    }): string[] {
        if (opts.skipUpload) {
            return [
                '⏭️ 已跳过远程公钥上传（skipUpload=true）',
                '📋 公钥内容（需手动添加到平台）：',
                opts.pubKey,
                opts.addKeyUrl ? `🔗 添加地址: ${opts.addKeyUrl}` : '',
                `✅ 添加后验证: ssh -T git@${opts.host}`
            ].filter(Boolean)
        }
        if (opts.uploaded) {
            return [`✅ 公钥已自动上传到 ${opts.host}`, `验证: ssh -T git@${opts.host}`]
        }
        if (opts.alreadyExists) {
            return [`ℹ️ 公钥已在平台存在，无需重复上传`, `验证: ssh -T git@${opts.host}`]
        }
        if (!opts.hasToken) {
            return [
                '⚠️ 未获取到 token（OAuth 授权未完成），公钥未上传',
                '📋 请手动添加公钥，或先 git.login() 授权后重试：',
                opts.pubKey,
                opts.addKeyUrl ? `🔗 添加地址: ${opts.addKeyUrl}` : '',
                `✅ 添加后验证: ssh -T git@${opts.host}`
            ].filter(Boolean)
        }
        return [
            `⚠️ 公钥上传失败: ${opts.uploadError || '未知错误'}`,
            '📋 请手动添加公钥：',
            opts.pubKey,
            opts.addKeyUrl ? `🔗 添加地址: ${opts.addKeyUrl}` : '',
            `✅ 添加后验证: ssh -T git@${opts.host}`
        ].filter(Boolean)
    }

    /**
     * 构建 setup 的结果消息
     */
    private buildSetupMessage(opts: {
        generated: boolean
        uploaded: boolean
        alreadyExists: boolean
        connectionTest: string
    }): string {
        const parts: string[] = []
        parts.push(opts.generated ? '已生成密钥' : '复用已有密钥')
        if (opts.uploaded) parts.push('公钥已上传')
        else if (opts.alreadyExists) parts.push('公钥已存在')
        parts.push(opts.connectionTest)
        return parts.join(' / ')
    }

    /**
     * 诊断 SSH 常见问题
     */
    async troubleshoot(host: string = 'git.woa.com'): Promise<GitResult> {
        const startTime = Date.now()
        const checks: SSHTroubleshootCheck[] = []

        checks.push(this.checkSshDir())
        checks.push(this.checkConfigFile())
        checks.push(this.checkConfigHost(host))
        checks.push(this.checkKeys())
        checks.push(this.checkAgent())
        checks.push(this.checkOpenSSHVersion())
        checks.push(this.checkInsteadOf())
        checks.push(this.checkConnection(host))

        const passed = checks.filter((c) => c.status === 'pass').length
        const failed = checks.filter((c) => c.status === 'fail').length
        const warnings = checks.filter((c) => c.status === 'warn').length

        const result: SSHTroubleshootResult = {
            host,
            checks,
            summary: { passed, failed, warnings }
        }

        return {
            success: failed === 0,
            operation: 'stage',
            message: `诊断完成: ${passed}通过 / ${failed}失败 / ${warnings}警告`,
            data: result,
            duration: Date.now() - startTime
        }
    }

    private checkSshDir(): SSHTroubleshootCheck {
        return existsSync(SSH_DIR)
            ? { name: '.ssh 目录', status: 'pass', message: SSH_DIR }
            : { name: '.ssh 目录', status: 'fail', message: '目录不存在', fix: 'mkdir -p ~/.ssh' }
    }

    private checkConfigFile(): SSHTroubleshootCheck {
        if (!existsSync(SSH_CONFIG_PATH)) {
            return {
                name: 'config 文件',
                status: 'fail',
                message: '不存在',
                fix: 'touch ~/.ssh/config && chmod 600 ~/.ssh/config'
            }
        }
        return { name: 'config 文件', status: 'pass', message: SSH_CONFIG_PATH }
    }

    private checkConfigHost(host: string): SSHTroubleshootCheck {
        if (!existsSync(SSH_CONFIG_PATH)) {
            return {
                name: `config 中 ${host}`,
                status: 'fail',
                message: 'config 不存在',
                fix: '先创建 config 文件'
            }
        }
        const content = readFileSync(SSH_CONFIG_PATH, 'utf-8')
        if (content.includes(`Host ${host}`) || content.includes(`Host ${host}-`)) {
            return { name: `config 中 ${host}`, status: 'pass', message: '已配置' }
        }
        return {
            name: `config 中 ${host}`,
            status: 'fail',
            message: '未找到 host 配置',
            fix: `运行 setup 配置 ${host}`
        }
    }

    private checkKeys(): SSHTroubleshootCheck {
        if (!existsSync(SSH_DIR))
            return {
                name: '密钥文件',
                status: 'fail',
                message: '.ssh 目录不存在',
                fix: '先运行 setup'
            }
        const keys = readdirSync(SSH_DIR).filter(
            (f: string) => f.startsWith('id_') && !f.endsWith('.pub')
        )
        if (keys.length === 0) {
            return {
                name: '密钥文件',
                status: 'fail',
                message: '无密钥',
                fix: '运行 setup 生成密钥'
            }
        }
        return {
            name: '密钥文件',
            status: 'pass',
            message: `${keys.length} 个: ${keys.join(', ')}`
        }
    }

    private checkAgent(): SSHTroubleshootCheck {
        try {
            const output = execSync('ssh-add -l', { stdio: 'pipe' }).toString()
            const count = output.split('\n').filter(Boolean).length
            return { name: 'ssh-agent', status: 'pass', message: `运行中，已加载 ${count} 个密钥` }
        } catch {
            return {
                name: 'ssh-agent',
                status: 'warn',
                message: '未运行或无密钥',
                fix: 'ssh-add ~/.ssh/id_ed25519_platform'
            }
        }
    }

    private checkOpenSSHVersion(): SSHTroubleshootCheck {
        try {
            const versionOutput = execSync('ssh -V', { stdio: 'pipe' }).toString()
            const match = versionOutput.match(/OpenSSH_(\d+\.\d+)/)
            if (!match)
                return { name: 'OpenSSH 版本', status: 'pass', message: versionOutput.trim() }
            const ver = parseFloat(match[1])
            if (ver >= 8.8) {
                return {
                    name: 'OpenSSH 版本',
                    status: 'warn',
                    message: `v${ver} — 高版本不接受 ssh-rsa`,
                    fix: 'config 中添加: HostkeyAlgorithms +ssh-rsa（或用 ed25519 密钥）'
                }
            }
            return { name: 'OpenSSH 版本', status: 'pass', message: `v${ver}` }
        } catch {
            return { name: 'OpenSSH 版本', status: 'warn', message: '无法检测' }
        }
    }

    private checkInsteadOf(): SSHTroubleshootCheck {
        try {
            const output = execSync('git config --list --show-origin', { stdio: 'pipe' }).toString()
            const insteadOf = output
                .split('\n')
                .filter((l: string) => l.toLowerCase().includes('insteadof'))
            if (insteadOf.length > 0) {
                return {
                    name: 'git insteadOf',
                    status: 'warn',
                    message: `发现 ${insteadOf.length} 条强转配置`,
                    fix: '检查 git config --list --show-origin | grep insteadOf，删除相关配置'
                }
            }
            return { name: 'git insteadOf', status: 'pass', message: '无强转配置' }
        } catch {
            return { name: 'git insteadOf', status: 'pass', message: '无可检测配置' }
        }
    }

    private checkConnection(host: string): SSHTroubleshootCheck {
        try {
            execSync(`ssh -T -o BatchMode=yes -o ConnectTimeout=5 git@${host}`, {
                stdio: 'pipe',
                timeout: 10000
            })
            return { name: 'SSH 连接', status: 'pass', message: '连接成功' }
        } catch (err: unknown) {
            const errorObj = err as { stdout?: Buffer; stderr?: Buffer }
            const stderr = errorObj.stderr?.toString() || ''
            if (stderr.includes('successfully authenticated')) {
                return { name: 'SSH 连接', status: 'pass', message: '认证成功' }
            }
            if (stderr.includes('Permission denied')) {
                return {
                    name: 'SSH 连接',
                    status: 'fail',
                    message: 'Permission denied',
                    fix: '检查公钥是否已添加到平台'
                }
            }
            if (stderr.includes('timed out') || stderr.includes('Connection timed out')) {
                return {
                    name: 'SSH 连接',
                    status: 'fail',
                    message: '连接超时',
                    fix: '检查网络策略/是否在 StaffWifi'
                }
            }
            return { name: 'SSH 连接', status: 'warn', message: stderr.slice(0, 150) || '测试失败' }
        }
    }

    /**
     * 检测当前 SSH 配置状态
     */
    async checkStatus(): Promise<GitResult> {
        const startTime = Date.now()
        try {
            const sshDirExists = existsSync(SSH_DIR)
            const configExists = existsSync(SSH_CONFIG_PATH)
            const keys = sshDirExists
                ? readdirSync(SSH_DIR).filter(
                      (f: string) => !f.endsWith('.pub') && f.startsWith('id_')
                  )
                : []

            let agentRunning = false
            let loadedKeys = 0
            try {
                const output = execSync('ssh-add -l', { stdio: 'pipe' }).toString()
                agentRunning = true
                loadedKeys = output.split('\n').filter(Boolean).length
            } catch {
                agentRunning = false
            }

            return {
                success: true,
                operation: 'stage',
                message: `SSH 状态: ${keys.length} 密钥, agent ${agentRunning ? '运行中' : '未运行'}`,
                data: {
                    sshDir: sshDirExists,
                    sshConfig: configExists,
                    keys,
                    configContent: configExists
                        ? readFileSync(SSH_CONFIG_PATH, 'utf-8').slice(0, 2000)
                        : null,
                    sshAgent: { running: agentRunning, loadedKeys }
                },
                duration: Date.now() - startTime,
                summary: { keysCount: keys.length, agentRunning, configExists }
            }
        } catch (error) {
            return this.failResult(
                startTime,
                '获取状态失败',
                error instanceof Error ? error.message : String(error)
            )
        }
    }

    /**
     * 显示公钥（按 host 或 platform 匹配）
     */
    async showPublicKey(hostOrPlatform: string = 'github'): Promise<GitResult> {
        const startTime = Date.now()
        try {
            const pubKeyPath = findPubKeyPath(hostOrPlatform)

            if (!pubKeyPath) {
                return this.failResult(
                    startTime,
                    `未找到 ${hostOrPlatform} 的公钥`,
                    'KEY_NOT_FOUND'
                )
            }

            const pubKey = readFileSync(pubKeyPath, 'utf-8').trim()
            return this.successResult(startTime, {
                platform: hostOrPlatform,
                keyPath: pubKeyPath,
                publicKey: pubKey
            })
        } catch (error) {
            return this.failResult(
                startTime,
                '读取公钥失败',
                error instanceof Error ? error.message : String(error)
            )
        }
    }

    /**
     * 清理本地 SSH 配置（密钥文件 + config 块）
     *
     * 删除指定平台的密钥对，并从 ~/.ssh/config 移除对应 Host 块。
     * 不删除远程平台上的公钥（如需删除远程 Key，用 ssh-remote 的 deleteKey）。
     *
     * @param platform 平台名（如 gitcode）；默认 gitcode
     * @param account 多帐号标识（可选）
     */
    async clean(platform: string = 'gitcode', account?: string): Promise<GitResult> {
        const startTime = Date.now()
        try {
            const { hostAlias, keyCandidates } = resolveCleanContext(platform, account)

            const removedFiles = this.removeKeyFilesFromList(keyCandidates)
            const configRemoved = this.tryRemoveConfigBlock(hostAlias)
            this.removeFromAgent(keyCandidates)

            return {
                success: true,
                operation: 'stage',
                message: `已清理 ${platform} SSH 配置: ${removedFiles.length} 个密钥文件${configRemoved ? ' + config 块' : ''}`,
                data: { platform, hostAlias, removedFiles, configRemoved },
                duration: Date.now() - startTime
            }
        } catch (error) {
            return this.failResult(
                startTime,
                '清理 SSH 配置失败',
                error instanceof Error ? error.message : String(error)
            )
        }
    }

    /** 批量删除密钥文件 */
    private removeKeyFilesFromList(keyPaths: string[]): string[] {
        const removedFiles: string[] = []
        for (const keyPath of keyPaths) {
            if (existsSync(keyPath)) {
                this.removeKeyFiles(keyPath)
                removedFiles.push(keyPath)
            }
        }
        return removedFiles
    }

    /** 尝试从 SSH config 移除 Host 块 */
    private tryRemoveConfigBlock(hostAlias: string): boolean {
        if (!existsSync(SSH_CONFIG_PATH)) return false
        if (!readFileSync(SSH_CONFIG_PATH, 'utf-8').includes(`Host ${hostAlias}`)) return false

        this.removeSSHConfigBlock(hostAlias)
        return true
    }

    /** 从 ssh-agent 移除密钥（忽略失败） */
    private removeFromAgent(keyPaths: string[]): void {
        for (const keyPath of keyPaths) {
            try {
                execSync(`ssh-add -d "${keyPath}"`, { stdio: 'pipe' })
            } catch {
                // 密钥可能未加载，忽略
            }
        }
    }

    // ==================== 内部工具 ====================

    private successResult(startTime: number, data: Record<string, unknown>): GitResult {
        return {
            success: true,
            operation: 'stage',
            message: 'SSH 操作成功',
            data,
            duration: Date.now() - startTime
        }
    }

    private failResult(startTime: number, message: string, error: string): GitResult {
        return {
            success: false,
            operation: 'stage',
            message,
            error,
            duration: Date.now() - startTime
        }
    }
}

// ==================== 快捷函数 ====================

export async function setupSSH(options: SSHSetupOptions): Promise<GitResult> {
    return new SSHManager().setup(options)
}

export async function setupMultiAccountSSH(
    pf: 'github' | 'gitlab' | 'gitee' | 'gitcode',
    accounts: SSHAccount[]
): Promise<GitResult> {
    return new SSHManager().setupMultiAccount(pf, accounts)
}

export async function troubleshootSSH(host?: string): Promise<GitResult> {
    return new SSHManager().troubleshoot(host)
}

export async function checkSSHStatus(): Promise<GitResult> {
    return new SSHManager().checkStatus()
}

export async function showSSHKey(hostOrPlatform?: string): Promise<GitResult> {
    return new SSHManager().showPublicKey(hostOrPlatform || 'github')
}

/** 清理本地 SSH 配置（密钥文件 + config 块） */
export async function cleanSSH(platform?: string, account?: string): Promise<GitResult> {
    return new SSHManager().clean(platform, account)
}

export default SSHManager
