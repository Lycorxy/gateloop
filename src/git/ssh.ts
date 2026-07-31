/**
 * SSH 自动配置工具
 *
 * 一键配置 SSH Key，支持 GitHub/GitLab/Gitee/腾讯工蜂(git.woa.com)/自定义平台。
 * 支持多帐号配置、常见问题诊断、Windows 路径适配。
 */

import { execSync } from 'node:child_process'
import {
    mkdirSync,
    existsSync,
    readFileSync,
    readdirSync,
    appendFileSync,
    chmodSync
} from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:https'
import type {
    SSHSetupOptions,
    SSHAccount,
    SSHTroubleshootResult,
    SSHTroubleshootCheck,
    GitResult
} from './types'

// ==================== 常量 ====================

const SSH_DIR = join(homedir(), '.ssh')
const SSH_CONFIG_PATH = join(SSH_DIR, 'config')
const IS_WIN = platform() === 'win32'

/** 平台默认配置 */
const PLATFORM_CONFIGS: Record<string, { host: string; user: string; port: number; addKeyUrl: string }> = {
    github: { host: 'github.com', user: 'git', port: 22, addKeyUrl: 'https://github.com/settings/ssh/new' },
    gitlab: { host: 'gitlab.com', user: 'git', port: 22, addKeyUrl: 'https://gitlab.com/-/profile/keys' },
    gitee: { host: 'gitee.com', user: 'git', port: 22, addKeyUrl: 'https://gitee.com/profile/sshkeys' },
    gitcode: { host: 'git.woa.com', user: 'git', port: 22, addKeyUrl: 'https://git.woa.com/-/profile/keys' }
}

/** 路径转 POSIX 风格（Windows 下 SSH config 需要正斜杠） */
function toPosixPath(p: string): string {
    return IS_WIN ? p.replace(/\\/g, '/') : p
}

// ==================== SSH 管理器 ====================

export class SSHManager {
    private cwd: string

    constructor(cwd?: string) {
        this.cwd = cwd || process.cwd()
    }

    /**
     * 一键配置 SSH
     *
     * @example
     * // 工蜂（腾讯内部）
     * await ssh.setup({ platform: 'gitcode', email: 'name@tencent.com' })
     * // 自定义平台
     * await ssh.setup({ platform: 'custom', host: 'git.example.com', email: 'me@example.com' })
     * // 多帐号（公共帐号）
     * await ssh.setup({ platform: 'gitcode', email: 'shared@tencent.com', account: 'shared' })
     */
    async setup(options: SSHSetupOptions): Promise<GitResult> {
        const startTime = Date.now()
        const {
            platform: pf = 'github',
            email,
            keyType = 'ed25519',
            keyBits = 4096,
            account
        } = options

        const platConf = PLATFORM_CONFIGS[pf]
        const host = options.host || platConf?.host || 'custom-host'
        const user = options.user || platConf?.user || 'git'
        const port = options.port || platConf?.port || 22

        try {
            mkdirSync(SSH_DIR, { recursive: true })

            // 密钥文件名：多帐号时加 account 后缀
            const keySuffix = account ? `_${account}` : ''
            const keyName = `id_${keyType}_${pf}${keySuffix}`
            const keyPath = join(SSH_DIR, keyName)
            const pubKeyPath = `${keyPath}.pub`

            // 已存在则直接返回公钥
            if (existsSync(keyPath) && existsSync(pubKeyPath)) {
                const pubKey = readFileSync(pubKeyPath, 'utf-8').trim()
                return this.successResult(startTime, {
                    platform: pf, keyType, keyPath, publicKey: pubKey,
                    alreadyExists: true,
                    nextSteps: this.buildNextSteps(host, pubKey, platConf?.addKeyUrl)
                })
            }

            // 生成密钥（不输入密码，-N ''）
            const keyTypeFlag = keyType === 'ed25519' ? '-t ed25519' : `-t rsa -b ${keyBits}`
            const comment = email || `nut-git-${pf}${keySuffix || ''}`
            try {
                execSync(`ssh-keygen ${keyTypeFlag} -f "${keyPath}" -N "" -C "${comment}"`, {
                    stdio: 'pipe', cwd: this.cwd
                })
            } catch (error) {
                return this.failResult(startTime, `密钥生成失败: ${(error as Error).message}`, 'KEY_GENERATION_FAILED')
            }

            const pubKey = readFileSync(pubKeyPath, 'utf-8').trim()

            // 更新 SSH config（含 Port/ControlMaster/ControlPath）
            await this.updateSSHConfig(host, user, port, keyPath, account)

            // 添加到 ssh-agent
            const agentAdded = this.addToAgent(keyPath)

            // 自动上传公钥到平台（有 token 时）
            let uploaded = false
            if (options.token) {
                uploaded = await this.uploadPublicKey(host, pubKey, options.token, pf)
            }

            // 测试连接
            const connectionTest = this.testConnection(host, user, port)

            return this.successResult(startTime, {
                platform: pf, keyType, keyPath, publicKey: pubKey,
                agentAdded, uploaded, connectionTest,
                nextSteps: uploaded
                    ? [`✅ 公钥已自动上传到 ${host}`, `验证: ssh -T git@${host}`]
                    : this.buildNextSteps(host, pubKey, platConf?.addKeyUrl)
            })
        } catch (error) {
            return this.failResult(startTime, `SSH 配置失败: ${(error as Error).message}`, 'SETUP_FAILED')
        }
    }

    /**
     * 批量配置多帐号（个人 + 公共帐号）
     *
     * @example
     * await ssh.setupMultiAccount('gitcode', [
     *   { name: 'personal', email: 'me@tencent.com' },
     *   { name: 'shared', email: 'shared@tencent.com' }
     * ])
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
     * 更新 SSH config 文件
     * 格式包含 Host/HostName/User/Port/ControlMaster/ControlPath/IdentityFile
     */
    private async updateSSHConfig(
        host: string,
        user: string,
        port: number,
        keyPath: string,
        account?: string
    ): Promise<void> {
        // 多帐号时 Host 用别名区分（如 git.woa.com-shared）
        const hostAlias = account ? `${host}-${account}` : host
        const identityFile = toPosixPath(keyPath)

        const configBlock = `
# ${hostAlias} - 由 node-ultra 自动配置${account ? ` (${account})` : ''}
Host ${hostAlias}
    HostName ${host}
    User ${user}
    Port ${port}
    ControlMaster no
    ControlPath none
    IdentityFile ${identityFile}
    IdentitiesOnly yes
    PreferredAuthentications publickey
`

        if (existsSync(SSH_CONFIG_PATH)) {
            const existing = readFileSync(SSH_CONFIG_PATH, 'utf-8')
            if (existing.includes(`Host ${hostAlias}`)) return // 已配置
        }

        appendFileSync(SSH_CONFIG_PATH, configBlock, 'utf-8')

        try {
            chmodSync(SSH_CONFIG_PATH, 0o600)
        } catch {
            // Windows 可能不支持 chmod
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
            if (stderr.includes('Permission denied')) return 'Permission denied — 请将公钥添加到平台'
            if (stderr.includes('Connection timed out')) return `连接超时 — 检查网络/端口 ${port}`
            return stderr.slice(0, 200) || '连接测试失败（请将公钥添加到平台）'
        }
    }

    /**
     * 自动上传公钥到 GitLab 兼容平台（工蜂/GitLab/Gitee）
     * 使用 POST /api/v4/user/keys 接口
     */
    private async uploadPublicKey(
        host: string,
        pubKey: string,
        token: string,
        platform: string
    ): Promise<boolean> {
        const apiPath = '/api/v4/user/keys'
        const title = `nut-git-${platform}-${Date.now()}`

        const postData = JSON.stringify({ title, key: pubKey })

        return new Promise<boolean>((resolve) => {
            const req = request(
                {
                    hostname: host,
                    port: 443,
                    path: apiPath,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData),
                        'PRIVATE-TOKEN': token
                    },
                    timeout: 10000
                },
                (res) => {
                    let body = ''
                    res.on('data', (chunk: Buffer) => { body += chunk.toString() })
                    res.on('end', () => {
                        if (res.statusCode === 201 || res.statusCode === 200) {
                            resolve(true)
                        } else {
                            resolve(false)
                        }
                    })
                }
            )
            req.on('error', () => resolve(false))
            req.on('timeout', () => { req.destroy(); resolve(false) })
            req.write(postData)
            req.end()
        })
    }

    /** 构建下一步指引 */
    private buildNextSteps(host: string, pubKey: string, addKeyUrl?: string): string[] {
        return [
            '📋 请将以下公钥添加到平台：',
            pubKey,
            addKeyUrl ? `🔗 添加地址: ${addKeyUrl}` : '🔗 请到平台 SSH 设置页面添加',
            `✅ 添加后验证: ssh -T git@${host}`
        ]
    }

    /**
     * 诊断 SSH 常见问题
     * 检查用户指南中的 10 个常见问题
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
            return { name: 'config 文件', status: 'fail', message: '不存在', fix: 'touch ~/.ssh/config && chmod 600 ~/.ssh/config' }
        }
        return { name: 'config 文件', status: 'pass', message: SSH_CONFIG_PATH }
    }

    private checkConfigHost(host: string): SSHTroubleshootCheck {
        if (!existsSync(SSH_CONFIG_PATH)) {
            return { name: `config 中 ${host}`, status: 'fail', message: 'config 不存在', fix: '先创建 config 文件' }
        }
        const content = readFileSync(SSH_CONFIG_PATH, 'utf-8')
        if (content.includes(`Host ${host}`) || content.includes(`Host ${host}-`)) {
            return { name: `config 中 ${host}`, status: 'pass', message: '已配置' }
        }
        return { name: `config 中 ${host}`, status: 'fail', message: '未找到 host 配置', fix: `运行 setup 配置 ${host}` }
    }

    private checkKeys(): SSHTroubleshootCheck {
        if (!existsSync(SSH_DIR)) return { name: '密钥文件', status: 'fail', message: '.ssh 目录不存在', fix: '先运行 setup' }
        const keys = readdirSync(SSH_DIR).filter((f: string) => f.startsWith('id_') && !f.endsWith('.pub'))
        if (keys.length === 0) {
            return { name: '密钥文件', status: 'fail', message: '无密钥', fix: '运行 setup 生成密钥' }
        }
        return { name: '密钥文件', status: 'pass', message: `${keys.length} 个: ${keys.join(', ')}` }
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
                fix: 'ssh-add ~/.ssh/id_ed25519_platform（问题8: agent refused operation）'
            }
        }
    }

    private checkOpenSSHVersion(): SSHTroubleshootCheck {
        try {
            const versionOutput = execSync('ssh -V', { stdio: 'pipe' }).toString()
            const match = versionOutput.match(/OpenSSH_(\d+\.\d+)/)
            if (!match) return { name: 'OpenSSH 版本', status: 'pass', message: versionOutput.trim() }
            const ver = parseFloat(match[1])
            if (ver >= 8.8) {
                return {
                    name: 'OpenSSH 版本',
                    status: 'warn',
                    message: `v${ver} — 高版本不接受 ssh-rsa（问题2/10）`,
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
            const insteadOf = output.split('\n').filter((l: string) => l.toLowerCase().includes('insteadof'))
            if (insteadOf.length > 0) {
                return {
                    name: 'git insteadOf',
                    status: 'warn',
                    message: `发现 ${insteadOf.length} 条强转配置（问题7）`,
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
                stdio: 'pipe', timeout: 10000
            })
            return { name: 'SSH 连接', status: 'pass', message: '连接成功' }
        } catch (err: unknown) {
            const errorObj = err as { stdout?: Buffer; stderr?: Buffer }
            const stderr = errorObj.stderr?.toString() || ''
            if (stderr.includes('successfully authenticated')) {
                return { name: 'SSH 连接', status: 'pass', message: '认证成功' }
            }
            if (stderr.includes('Permission denied')) {
                return { name: 'SSH 连接', status: 'fail', message: 'Permission denied（问题2）', fix: '检查公钥是否已添加到平台' }
            }
            if (stderr.includes('timed out') || stderr.includes('Connection timed out')) {
                return { name: 'SSH 连接', status: 'fail', message: '连接超时（问题3/6）', fix: '检查网络策略/是否在 StaffWifi' }
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
                ? readdirSync(SSH_DIR).filter((f: string) => !f.endsWith('.pub') && f.startsWith('id_'))
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
                    configContent: configExists ? readFileSync(SSH_CONFIG_PATH, 'utf-8').slice(0, 2000) : null,
                    sshAgent: { running: agentRunning, loadedKeys }
                },
                duration: Date.now() - startTime,
                summary: { keysCount: keys.length, agentRunning, configExists }
            }
        } catch (error) {
            return this.failResult(startTime, '获取状态失败', (error as Error).message)
        }
    }

    /**
     * 显示公钥（按 host 或 platform 匹配）
     */
    async showPublicKey(hostOrPlatform: string = 'github'): Promise<GitResult> {
        const startTime = Date.now()
        try {
            const candidates = [
                join(SSH_DIR, `id_ed25519_${hostOrPlatform}.pub`),
                join(SSH_DIR, `id_rsa_${hostOrPlatform}.pub`),
                join(SSH_DIR, 'id_ed25519.pub'),
                join(SSH_DIR, 'id_rsa.pub')
            ]

            let pubKeyPath = ''
            for (const c of candidates) {
                if (existsSync(c)) { pubKeyPath = c; break }
            }

            if (!pubKeyPath && existsSync(SSH_DIR) && existsSync(SSH_CONFIG_PATH)) {
                // 按 host 在 config 里找 IdentityFile
                const config = readFileSync(SSH_CONFIG_PATH, 'utf-8')
                const match = config.match(new RegExp(`Host ${hostOrPlatform}[\\s\\S]*?IdentityFile\\s+(\\S+)`))
                if (match) {
                    const keyFromConfig = match[1]
                    const pubCandidate = `${keyFromConfig}.pub`
                    if (existsSync(pubCandidate)) pubKeyPath = pubCandidate
                }
            }

            if (!pubKeyPath) {
                return this.failResult(startTime, `未找到 ${hostOrPlatform} 的公钥`, 'KEY_NOT_FOUND')
            }

            const pubKey = readFileSync(pubKeyPath, 'utf-8').trim()
            return this.successResult(startTime, { platform: hostOrPlatform, keyPath: pubKeyPath, publicKey: pubKey })
        } catch (error) {
            return this.failResult(startTime, '读取公钥失败', (error as Error).message)
        }
    }

    // ==================== 内部工具 ====================

    private successResult(startTime: number, data: Record<string, unknown>): GitResult {
        return { success: true, operation: 'stage', message: 'SSH 操作成功', data, duration: Date.now() - startTime }
    }

    private failResult(startTime: number, message: string, error: string): GitResult {
        return { success: false, operation: 'stage', message, error, duration: Date.now() - startTime }
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

export default SSHManager
