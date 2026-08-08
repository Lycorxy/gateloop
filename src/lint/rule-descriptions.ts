/**
 * 规则描述和代码示例数据
 *
 * 存储 ESLint 和 Stylelint 规则的中文说明及代码示例
 * 从 knowledge.ts 中抽取，减少主文件体积
 */

// ==================== ESLint 规则说明 ====================

/**
 * ESLint 规则详细说明（中文）
 */
export const eslintRuleDescriptions: Record<string, string> = {
    'constructor-super':
        '要求派生类的构造函数在调用 this 之前必须调用 super()，这是在派生类构造函数中访问 this 的前提条件。',
    'for-direction':
        '确保 for 循环的更新语句使循环变量向正确的方向移动，防止无限循环或循环体不执行。',
    'getter-return': '强制要求 getter 函数必须有返回值，getter 函数应该返回一个值而不应有副作用。',
    'no-async-promise-executor':
        '禁止将异步函数作为 Promise 的执行器，Promise 执行器应该是同步的，异步执行器可能导致意外行为。',
    'no-case-declarations':
        '禁止在 case 子句中声明变量，应该在 switch 语句外声明变量或在 case 块中使用花括号创建块级作用域。',
    'no-class-assign': '禁止修改类声明，防止意外地给类变量赋值导致代码逻辑错误。',
    'no-compare-neg-zero':
        '禁止直接与 -0 比较，因为 Object.is(-0, 0) 返回 false，应使用更合适的比较方法如 Object.is()。',
    'no-cond-assign': '禁止在条件语句中使用赋值操作符，通常这是一个错误，应该使用比较操作符。',
    'no-const-assign': '禁止修改用 const 声明的变量，const 变量是常量，不能重新赋值。',
    'no-constant-condition': '禁止在条件中使用常量表达式，这通常是错误或代码逻辑有问题。',
    'no-debugger': '禁止使用 debugger 语句，debugger 语句应该只在调试时使用，不应提交到代码库。',
    'no-dupe-args': '禁止函数参数重名，重复的参数名会导致混淆和潜在的错误。',
    'no-dupe-class-members': '禁止类成员重名，重复的成员名会导致覆盖和潜在的错误。',
    'no-dupe-else-if': '禁止 if-else-if 链中出现重复的条件，重复的条件会导致某些分支永远无法执行。',
    'no-dupe-keys': '禁止对象字面量中出现重复的键，重复的键会导致后面的覆盖前面的。',
    'no-duplicate-case':
        '禁止 switch 语句中出现重复的 case 标签，重复的 case 会导致后面的覆盖前面的。',
    'no-empty': '禁止空的块语句，空的块语句通常表示代码不完整或逻辑错误。',
    'no-empty-character-class': '禁止在正则表达式中出现空的字符类，空的字符类 [] 不匹配任何字符。',
    'no-empty-pattern': '禁止在解构模式中出现空模式，空模式没有实际作用。',
    'no-func-assign': '禁止重新赋值函数声明，函数声明不应该被重新赋值。',
    'no-undef': '禁止使用未声明的变量，这会导致 ReferenceError。',
    'no-unused-vars': '禁止声明未使用的变量，未使用的变量应该被删除或添加下划线前缀。',
    'no-use-before-define': '禁止在变量定义之前使用它们，这可能导致意外的行为。',
    semi: '要求或禁止使用分号，根据配置可以强制使用或不使用分号。',
    quotes: '强制使用一致的反引号、双引号或单引号。',
    indent: '强制使用一致的缩进，可以是空格或制表符。',
    'no-console': '禁止调用 console 对象的方法，console 应该只在调试时使用。',
    eqeqeq: '要求使用 === 和 !== 而不是 == 和 !=，避免隐式类型转换。',
    curly: '强制所有控制语句使用一致的括号风格。',
    'no-eval': '禁止使用 eval() 函数，eval() 可能导致安全漏洞和性能问题。',
    'no-extra-semi': '禁止不必要的分号，不必要的分号会导致代码冗余。',
    'no-fallthrough': '禁止 switch 语句中的 case 贯穿（fallthrough），除非有明确的注释说明。',
    'no-irregular-whitespace': '禁止在字符串和正则表达式中出现不规则的空白字符。',
    'no-prototype-builtins':
        '禁止直接调用对象原型上的内置方法，应该使用 Object.prototype 上的方法。',
    'no-redeclare': '禁止重复声明变量，重复声明会导致混淆和潜在的错误。',
    'no-shadow-restricted-names': '禁止使用与受限名称相同的变量名，如 NaN、undefined 等。',
    'no-unreachable': '禁止不可达代码，不可达代码永远不会被执行，应该被删除。',
    'use-isnan': '要求使用 isNaN() 检查 NaN，而不是直接比较，因为 NaN !== NaN。',
    'valid-typeof': '要求 typeof 表达式的结果与有效字符串比较，防止拼写错误。'
}

// ==================== Stylelint 规则说明 ====================

/**
 * Stylelint 规则详细说明（中文）
 */
export const stylelintRuleDescriptions: Record<string, string> = {
    'block-no-empty': '禁止出现空的代码块，空的代码块通常表示代码不完整或逻辑错误。',
    'color-hex-case': '指定十六进制颜色值的大小写，可以选择小写或大写。',
    'color-hex-length': '指定十六进制颜色值的长度，可以选择短格式或长格式。',
    'comment-empty-line-before': '要求注释之前有空行。',
    'declaration-block-no-duplicate-properties': '禁止在声明块中使用重复的属性。',
    'declaration-block-no-shorthand-property-overrides':
        '禁止在声明块中使用简写属性覆盖相关的长写属性。',
    'declaration-block-semicolon-newline-after': '要求或禁止在声明块的分号后换行。',
    'declaration-block-semicolon-space-before': '要求或禁止在声明块的分号前有空格。',
    'declaration-colon-newline-after': '要求或禁止在声明的冒号后换行。',
    'declaration-colon-space-before': '要求或禁止在声明的冒号前有空格。',
    'function-url-quotes': '要求或禁止使用引号包裹 URL。',
    indentation: '强制使用一致的缩进，可以是空格或制表符。',
    'max-empty-lines': '限制文件中连续空行的最大数量。',
    'no-descending-specificity': '禁止在具有较低特异性的规则之后出现具有较高特异性的规则。',
    'no-duplicate-selectors': '禁止出现重复的选择器。',
    'no-empty-source': '禁止出现空的源文件。',
    'no-eol-whitespace': '禁止行尾出现空白。',
    'no-extra-semicolons': '禁止不必要的分号。',
    'no-invalid-double-slash-comments': '禁止在 CSS 中使用 // 注释（某些浏览器不支持）。',
    'no-missing-end-of-source-newline': '要求源文件末尾有换行符。',
    'number-leading-zero': '要求或禁止在数字中使用前导零。',
    'number-no-trailing-zeros': '禁止在数字中使用尾随零。',
    'property-case': '指定属性的大小写。',
    'selector-class-pattern': '指定类选择器的模式。',
    'selector-id-pattern': '指定 ID 选择器的模式。',
    'selector-pseudo-class-case': '指定伪类的大小写。',
    'selector-pseudo-element-case': '指定伪元素的大小写。',
    'selector-type-case': '指定类型选择器的大小写。',
    'string-quotes': '指定字符串使用单引号还是双引号。',
    'unit-case': '指定单位的大小写。',
    'value-compression': '要求压缩颜色值和长度值。'
}

// ==================== ESLint 规则代码示例 ====================

/**
 * ESLint 规则代码示例
 */
export const eslintRuleExamples: Record<string, { correct: string; incorrect: string }> = {
    'constructor-super': {
        correct: `class Dog extends Animal {
  constructor(name) {
    super(name)
    this.name = name
  }
}`,
        incorrect: `class Dog extends Animal {
  constructor(name) {
    this.name = name  // ❌ 在 super() 之前使用 this
    super(name)
  }
}`
    },
    'for-direction': {
        correct: `for (let i = 0; i < 10; i++) {
  console.log(i)
}`,
        incorrect: `for (let i = 0; i < 10; i--) {
  console.log(i)
}`
    },
    semi: {
        correct: `const name = 'hello'
const obj = { foo: 'bar' }`,
        incorrect: `const name = 'hello';
const obj = { foo: 'bar' };`
    },
    'no-undef': {
        correct: `const myVar = 10
console.log(myVar)`,
        incorrect: `console.log(undeclaredVar)`
    },
    'no-unused-vars': {
        correct: `const x = 1
console.log(x)`,
        incorrect: `const x = 1
// x 从未使用`
    },
    eqeqeq: {
        correct: `if (x === 5) {
  // ...
}`,
        incorrect: `if (x == 5) {
  // ...
}`
    },
    quotes: {
        correct: `const name = 'hello'
const message = 'world'`,
        incorrect: `const name = "hello"
const message = "world"`
    },
    indent: {
        correct: `function foo() {
    const x = 1
    if (x) {
        console.log(x)
    }
}`,
        incorrect: `function foo() {
  const x = 1
    if (x) {
  console.log(x)
  }
}`
    },
    'no-console': {
        correct: `logger.info('message')
log('message')`,
        incorrect: `console.log('message')
console.error('error')`
    },
    curly: {
        correct: `if (x) {
  doSomething()
}`,
        incorrect: `if (x)
  doSomething()`
    }
}

// ==================== Stylelint 规则代码示例 ====================

/**
 * Stylelint 规则代码示例
 */
export const stylelintRuleExamples: Record<string, { correct: string; incorrect: string }> = {
    indentation: {
        correct: `.foo {
    color: red;
    margin: 0;
}`,
        incorrect: `.foo {
color: red;
margin: 0;
}`
    },
    'string-quotes': {
        correct: `.foo {
  content: 'hello';
}`,
        incorrect: `.foo {
  content: "hello";
}`
    },
    'color-hex-case': {
        correct: `.foo {
  color: #ffffff;
}`,
        incorrect: `.foo {
  color: #FFFFFF;
}`
    },
    'declaration-block-semicolon-space-before': {
        correct: `.foo {
  color: red;
  margin: 0;
}`,
        incorrect: `.foo {
  color: red ;
  margin: 0 ;
}`
    },
    'no-eol-whitespace': {
        correct: `.foo {
  color: red;
}`,
        incorrect: `.foo {
  color: red;
}`
    }
}
