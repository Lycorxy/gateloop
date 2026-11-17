import alias from '@rollup/plugin-alias'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'
import typescript from '@rollup/plugin-typescript'
import { resolve } from 'path'
import type { RollupOptions } from 'rollup'
import { defineConfig } from 'rollup'
import del from 'rollup-plugin-delete'
import { dts } from 'rollup-plugin-dts'
import terser from '@rollup/plugin-terser'

const __dirname = resolve()

// ==================== 环境检测 ====================

const isProd = process.env.NODE_ENV === 'production'

// ==================== 入口配置 ====================

const entries = {
    // CLI 入口（统一 nut 命令）
    cli: './src/cli/index.ts',
    'gateloop-cli': './src/cli/gateloop.ts',
    // 库入口（API 形式）
    gateloop: './src/gateloop/index.ts',
    helpers: './src/helpers/index.ts'
}

// ==================== 需要添加 shebang 的文件 ====================

const cliFiles = ['cli', 'gateloop-cli']

// ==================== JS/TS 打包配置 ====================

export default [
    defineConfig({
        input: entries,
        output: [
            {
                format: 'cjs',
                strict: false,
                dir: 'dist',
                sourcemap: true,
                exports: 'named',
                entryFileNames: '[name]/index.cjs',
                chunkFileNames: 'common/[name].cjs',
                banner: (chunkInfo) => {
                    if (cliFiles.some((f) => chunkInfo.fileName.startsWith(f))) {
                        return '#!/usr/bin/env node\n'
                    }
                    return ''
                }
            },
            {
                dir: 'dist',
                sourcemap: true,
                exports: 'named',
                format: 'esm',
                externalLiveBindings: false,
                freeze: false,
                entryFileNames: '[name]/index.mjs',
                chunkFileNames: 'common/[name].mjs',
                banner: (chunkInfo) => {
                    if (cliFiles.some((f) => chunkInfo.fileName.startsWith(f))) {
                        return '#!/usr/bin/env node\n'
                    }
                    return ''
                }
            }
        ],
        // 外部依赖
        external: ['esbuild', 'prettier', 'eslint', 'glob'],
        cache: false, // 禁用缓存，确保使用新配置
        plugins: [
            alias({
                entries: [{ find: '@', replacement: resolve(__dirname, './src') }]
            }),
            replace({
                preventAssignment: true,
                values: {
                    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
                }
            }),
            nodeResolve({
                exportConditions: ['node', 'import', 'require', 'default'],
                browser: false,
                preferBuiltins: true
            }),
            commonjs({
                transformMixedEsModules: true,
                include: [/node_modules/]
            }),
            typescript({
                tsconfig: './tsconfig.json',
                exclude: ['node_modules']
            }),
            json(),
            // 生产环境压缩代码，开发环境不压缩保持可读性
            isProd &&
                terser({
                    compress: {
                        drop_console: false,
                        drop_debugger: true,
                        pure_funcs: []
                    },
                    format: {
                        comments: false
                    },
                    mangle: true,
                    toplevel: true
                })
        ],
        onwarn: (warning, warn) => {
            if (warning.message.includes('Circular dependency') || warning.code === 'EVAL') {
                return
            }
            warn(warning)
        }
    }),

    // ==================== 类型声明打包配置 ====================

    defineConfig({
        input: entries,
        output: [
            {
                dir: 'dist',
                format: 'es',
                entryFileNames: '[name]/index.d.ts',
                chunkFileNames: 'common/[name].d.ts'
            }
        ],
        // dts 插件需要显式排除 node 内置模块
        external: (id) =>
            id.startsWith('node:') ||
            [
                'events',
                'path',
                'fs',
                'os',
                'child_process',
                'util',
                'stream',
                'buffer',
                'crypto',
                'url',
                'http',
                'https',
                'net',
                'tls',
                'readline',
                'assert',
                'zlib'
            ].includes(id),
        plugins: [
            dts({
                tsconfig: './tsconfig.json'
            }),
            process.env.NODE_ENV === 'production'
                ? del({ hook: 'buildEnd', targets: './dist/types' })
                : []
        ]
    })
] as RollupOptions[]
