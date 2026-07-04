/**
 * SSH 自动配置工具
 *
 * 一键配置 SSH Key，支持 GitHub/GitLab/Gitee。
 * 用户只需提供 Token 即可完成配置（扩展预留）。
 */

import { execSync } from 'node:child_process'
import {
    mkdirSync,
    existsSync,
    readFileSync,
    writeFileSync,
    readdirSync,
    appendFileSync,
    chmodSync
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { gitExecOrThrow } from './executor'
import type { SSHConfig, SSHResult, GitResult } from './types'

// ==================== 常量 ====================

/** 默认 SSH 目录 */
const SSH_DIR = join(homedir(), '.ssh')
const SSH_CONFIG_PATH = join(SSH_DIR, 'config')

/** 平台默认配置 */
const PLATFORM_CONFIGS: Record<string, { host: string; user: string; addKeyUrl: string }> = {
    github: {
        host: 'github.com',
        user: 'git',
        addKeyUrl: 'https://github.com/settings/ssh/new'
    },
    gitlab: {
        host: 'gitlab.com',
        user: 'git',
        addKeyUrl: 'https://gitlab.com/-/profile/keys'
    },
    gitee: {
        host: 'gitee.com',
        user: 'git',
        addKeyUrl: 'https://gitee.com/profile/sshkeys'
    }
}

// ==================== SSH 管理器 ====================

/**
 * SSH 配置管理器
 */
export class SSHManager {
    private cwd: string

    constructor(cwd?: string) {
        this.cwd = cwd || process.cwd()
    }

    /**
     * 一键配置 SSH
     * @param platform 平台类型
     * @param token 可选，用于验证连接
     * @param keyType SSH 密钥类型
     * @param keyBits SSH 密钥位数
     */
    async setup(
        platform: 'github' | 'gitlab' | 'gitee' | 'custom' = 'github',
        token?: string,
        keyType: 'rsa' | 'ed25519' = 'ed25519',
        keyBits: number = 4096
    ): Promise<GitResult> {
        const startTime = Date.now()
        const platConf = PLATFORM_CONFIGS[platform]

        if (!platConf && platform !== 'custom') {
            return {
                success: false,
                operation: 'stage',
                message: `不支持的平台: ${platform}`,
                error: 'UNSUPPORTED_PLATFORM',
                duration: Date.now() - startTime
            }
        }

        try {
            // 1. 确保 .ssh 目录存在
            mkdirSync(SSH_DIR, { recursive: true })

            const keyName = `id_${keyType}_${platform}`
            const keyPath = join(SSH_DIR, keyName)
            const pubKeyPath = `${keyPath}.pub`

            // 2. 检查密钥是否已存在
            if (existsSync(keyPath) && existsSync(pubKeyPath)) {
                const pubKey = readFileSync(pubKeyPath, 'utf-8').trim()

                return {
                    success: true,
                    operation: 'stage',
                    message: `SSH 密钥已存在: ${keyName}`,
                    data: {
                        platform,
                        keyType,
                        keyPath,
                        publicKey: pubKey,
                        publicKeyPreview: pubKey.slice(-40),
                        alreadyExists: true,
                        nextSteps: [
                            `密钥已存在，公钥内容如下：`,
                            pubKey,
                            '',
                            `如需添加到 ${platform}：`,
                            `访问: ${platConf?.addKeyUrl || '平台 SSH 设置页面'}`,
                            '将上面的公钥内容粘贴到 SSH Key 文本框中保存'
                        ]
                    },
                    duration: Date.now() - startTime
                }
            }

            // 3. 生成 SSH 密钥
            const keyTypeFlag = keyType === 'ed25519' ? '-t ed25519' : `-t rsa -b ${keyBits}`
            // 使用数组形式的参数避免命令注入
            const sshKeygenArgs = [
                keyType === 'ed25519' ? '-t' : '-t',
                keyType === 'ed25519' ? 'ed25519' : 'rsa',
                ...(keyType === 'ed25519' ? [] : ['-b', String(keyBits)]),
                '-f',
                keyPath,
                '-N',
                '',
                '-C',
                `nut-git-${platform}`
            ]

            try {
                execSync(`ssh-keygen ${sshKeygenArgs.map((a) => `"${a}"`).join(' ')}`, {
                    stdio: 'pipe',
                    cwd: this.cwd
                })
            } catch (error) {
                return {
                    success: false,
                    operation: 'stage',
                    message: `SSH 密钥生成失败: ${(error as Error).message}`,
                    error: 'KEY_GENERATION_FAILED',
                    duration: Date.now() - startTime
                }
            }

            // 4. 读取公钥
            const pubKey = readFileSync(pubKeyPath, 'utf-8').trim()

            // 5. 配置 SSH config
            if (platConf) {
                await this.updateSSHConfig(platform, keyPath, platConf.host, platConf.user)
            }

            // 6. 启动 ssh-agent 并添加密钥
            const agentResult = this.addToAgent(keyPath)

            // 7. 测试连接
            let connectionTest = '未测试'
            if (platConf) {
                try {
                    const testOutput = execSync(
                        `ssh -T -o StrictHostKeyChecking=accept-new -o BatchMode=yes ${platConf.user}@${platConf.host}`,
                        { stdio: 'pipe', timeout: 10000 }
                    )
                    connectionTest = testOutput.toString() || '连接成功（无输出）'
                } catch (err: unknown) {
                    const errorObj = err as { stdout?: Buffer; stderr?: Buffer }
                    const stderrStr = errorObj.stderr?.toString() || ''
                    // GitHub 返回 1 但是输出成功消息是正常的
                    if (stderrStr.includes('successfully authenticated')) {
                        connectionTest = 'SSH 连接验证成功'
                    } else {
                        connectionTest = `SSH 连接测试: ${stderrStr.slice(0, 200) || '请将公钥添加到平台'}`
                    }
                }
            }

            return {
                success: true,
                operation: 'stage',
                message: 'SSH 配置完成',
                data: {
                    platform,
                    keyType,
                    keyPath,
                    publicKey: pubKey,
                    publicKeyPreview: `${pubKey.slice(0, 30)}...${pubKey.slice(-30)}`,
                    sshAgentAdded: agentResult,
                    connectionTest,
                    nextSteps: [
                        '========================================',
                        '📋 请将以下公钥添加到平台：',
                        '========================================',
                        '',
                        pubKey,
                        '',
                        '========================================',
                        platConf
                            ? `🔗 添加地址: ${platConf.addKeyUrl}`
                            : '🔗 请到对应平台的 SSH 设置页面添加',
                        '========================================',
                        '',
                        '添加完成后验证连接：',
                        `  ssh -T ${platConf ? `${platConf.user}@${platConf.host}` : 'git@your-host.com'}`
                    ]
                },
                duration: Date.now() - startTime
            }
        } catch (error) {
            return {
                success: false,
                operation: 'stage',
                message: `SSH 配置失败: ${(error as Error).message}`,
                error: 'SETUP_FAILED',
                duration: Date.now() - startTime
            }
        }
    }

    /**
     * 更新 SSH 配置文件
     */
    private async updateSSHConfig(
        platform: string,
        keyPath: string,
        host: string,
        user: string
    ): Promise<void> {
        const configBlock = `
# ${platform} - 由 node-ultra 自动配置
Host ${host}
    HostName ${host}
    User ${user}
    IdentityFile ${keyPath}
    IdentitiesOnly yes
    PreferredAuthentications publickey
`

        // 检查是否已存在配置
        if (existsSync(SSH_CONFIG_PATH)) {
            const existing = readFileSync(SSH_CONFIG_PATH, 'utf-8')
            if (existing.includes(`Host ${host}`)) {
                return // 已配置
            }
        }

        appendFileSync(SSH_CONFIG_PATH, configBlock, 'utf-8')

        // 确保权限正确（Unix）
        try {
            chmodSync(SSH_CONFIG_PATH, 0o600)
        } catch {
            // Windows 可能不支持 chmod
        }
    }

    /**
     * 添加密钥到 ssh-agent
     */
    private addToAgent(keyPath: string): boolean {
        try {
            // 检查 ssh-agent 是否运行
            try {
                execSync('ssh-add -l', { stdio: 'pipe' })
            } catch {
                // 启动 ssh-agent
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

            // 添加密钥
            execSync(`ssh-add "${keyPath}"`, { stdio: 'pipe' })
            return true
        } catch {
            return false
        }
    }

    /**
     * 检测当前 SSH 配置状态
     */
    async checkStatus(): Promise<GitResult> {
        const startTime = Date.now()

        try {
            const status = {
                sshDir: existsSync(SSH_DIR),
                sshConfig: existsSync(SSH_CONFIG_PATH),
                keys: [] as string[]
            }

            // 列出密钥
            if (existsSync(SSH_DIR)) {
                const files = readdirSync(SSH_DIR)
                status.keys = files.filter(
                    (f: string) =>
                        !f.endsWith('.pub') && (f.startsWith('id_') || f.startsWith('nut-'))
                )
            }

            // 检查 ssh-agent
            let agentRunning = false
            let loadedKeys: string[] = []
            try {
                const output = execSync('ssh-add -l', { stdio: 'pipe' }).toString()
                agentRunning = true
                loadedKeys = output.split('\n').filter(Boolean)
            } catch {
                agentRunning = false
            }

            return {
                success: true,
                operation: 'stage',
                message: `SSH 状态: ${status.keys.length} 个密钥, ssh-agent ${agentRunning ? '运行中' : '未运行'}`,
                data: {
                    ...status,
                    sshAgent: {
                        running: agentRunning,
                        loadedKeys: loadedKeys.length
                    },
                    configContent: status.sshConfig
                        ? readFileSync(SSH_CONFIG_PATH, 'utf-8').slice(0, 2000)
                        : null
                },
                duration: Date.now() - startTime,
                summary: {
                    keysCount: status.keys.length,
                    agentRunning,
                    configExists: status.sshConfig
                }
            }
        } catch (error) {
            return {
                success: false,
                operation: 'stage',
                message: '获取 SSH 状态失败',
                error: (error as Error).message,
                duration: Date.now() - startTime
            }
        }
    }

    /**
     * 显示公钥
     */
    async showPublicKey(platform: string = 'github'): Promise<GitResult> {
        const startTime = Date.now()

        try {
            const candidates = [
                join(SSH_DIR, `id_ed25519_${platform}.pub`),
                join(SSH_DIR, `id_rsa_${platform}.pub`),
                // 兼容纯平台名无前缀
                join(SSH_DIR, `id_ed25519.pub`),
                join(SSH_DIR, `id_rsa.pub`)
            ]

            let pubKeyPath = ''
            for (const candidate of candidates) {
                if (existsSync(candidate)) {
                    pubKeyPath = candidate
                    break
                }
            }

            if (!pubKeyPath) {
                return {
                    success: false,
                    operation: 'stage',
                    message: `未找到 ${platform} 的 SSH 公钥`,
                    error: 'KEY_NOT_FOUND',
                    duration: Date.now() - startTime
                }
            }

            const pubKey = readFileSync(pubKeyPath, 'utf-8').trim()

            return {
                success: true,
                operation: 'stage',
                message: 'SSH 公钥',
                data: {
                    platform,
                    keyPath: pubKeyPath,
                    publicKey: pubKey
                },
                duration: Date.now() - startTime
            }
        } catch (error) {
            return {
                success: false,
                operation: 'stage',
                message: '读取公钥失败',
                error: (error as Error).message,
                duration: Date.now() - startTime
            }
        }
    }
}

// ==================== 快捷函数 ====================

/**
 * 一键配置 SSH
 */
export async function setupSSH(
    platform: 'github' | 'gitlab' | 'gitee' = 'github',
    token?: string,
    keyType: 'rsa' | 'ed25519' = 'ed25519'
): Promise<GitResult> {
    const manager = new SSHManager()
    return manager.setup(platform, token, keyType)
}

/**
 * 检查 SSH 状态
 */
export async function checkSSHStatus(): Promise<GitResult> {
    const manager = new SSHManager()
    return manager.checkStatus()
}

/**
 * 显示 SSH 公钥
 */
export async function showSSHKey(platform: string = 'github'): Promise<GitResult> {
    const manager = new SSHManager()
    return manager.showPublicKey(platform)
}

export default SSHManager
