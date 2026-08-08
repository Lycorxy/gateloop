module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    env: {
        browser: true,
        node: true,
        es6: true
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended'
    ],
    parserOptions: {
        ecmaVersion: 6,
        sourceType: 'module'
    },
    plugins: ['@typescript-eslint'],
    rules: {
        'object-curly-spacing': ['error', 'always'],
        '@typescript-eslint/no-explicit-any': 'error',
        'eol-last': ['error', 'always'],
        semi: ['error', 'never'],
        'no-control-regex': 0,
        complexity: ['error', 10],
        'no-nested-ternary': 'error',
        'no-restricted-syntax': [
            'error',
            {
                selector: 'LineComment[raw=/^\\s*eslint-disable/i]',
                message: '禁止使用 eslint-disable 注释。有问题应从根本上修复，而非抑制警告。'
            },
            {
                selector: 'BlockComment[value=/eslint-disable/i]',
                message: '禁止使用 eslint-disable 注释。有问题应从根本上修复，而非抑制警告。'
            }
        ]
    },
    overrides: [
        {
            // 度量脚本天然多分支（AST 遍历/状态机/多类检测），放宽复杂度限制
            files: ['src/ads/metrics/**/*.ts'],
            rules: {
                complexity: ['error', 30]
            }
        },
        {
            // CLI 入口天然多分支（命令分发/参数解析），放宽复杂度限制
            files: ['src/cli/**/*.ts'],
            rules: {
                complexity: ['error', 20]
            }
        }
    ]
}
