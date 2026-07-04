#!/usr/bin/env node
/**
 * 第一步：递归收集所有层级规则
 * 
 * 目的：
 * 收集项目中所有未关闭的 ESLint 规则，包括当前项目配置、extends 继承的所有配置、
 * 插件规则、共享配置，不管有多少层级都必须全部找出来。
 */

const fs = require('fs')
const path = require('path')

// 配置
const config = {
  rootDir: path.resolve(__dirname, '../../../../'),
  configPath: path.resolve(__dirname, '../../../../.eslintrc.cjs'),
  outputPath: path.resolve(__dirname, '../../../knowledge/lint/rules.json'),
  oldRulesPath: path.resolve(__dirname, '../../../knowledge/lint/rules.json')
}

// 工具函数：加载模块
function loadModule(moduleName) {
  try {
    const modulePath = path.join(config.rootDir, 'node_modules', moduleName)
    return require(modulePath)
  } catch (error) {
    console.warn(`⚠️  警告：无法加载模块 ${moduleName}`)
    return null
  }
}

// 工具函数：读取配置文件
function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在：${configPath}`)
  }
  
  // 清除 require 缓存
  delete require.cache[require.resolve(configPath)]
  
  return require(configPath)
}

// 递归追踪 extends
function traceExtends(config, depth = 1, extendsChain = []) {
  const results = {
    extendsChain: [],
    rules: [],
    plugins: []
  }
  
  if (!config.extends || config.extends.length === 0) {
    return results
  }
  
  for (const extend of config.extends) {
    console.log(`  深度 ${depth}: 追踪 ${extend}`)
    
    const extendInfo = {
      name: extend,
      type: 'unknown',
      depth: depth,
      rulesCount: 0,
      rules: []
    }
    
    // 解析 extends 类型
    if (extend.startsWith('eslint:')) {
      // 内置推荐配置
      extendInfo.type = 'builtin'
      const eslint = loadModule('eslint')
      if (eslint && eslint.Linter) {
        const linter = new eslint.Linter()
        const configRules = linter.getRules()
        
        for (const [ruleName, rule] of configRules) {
          // 获取推荐的规则
          if (rule.meta && rule.meta.docs && rule.meta.docs.recommended) {
            // 获取规则的默认配置
            const ruleDefaultConfigs = rule.meta.docs && rule.meta.docs.defaultConfig
            let configValue = 'error'
            
            if (typeof ruleDefaultConfigs === 'string') {
              configValue = ruleDefaultConfigs
            } else if (typeof ruleDefaultConfigs === 'number') {
              configValue = ruleDefaultConfigs === 2 ? 'error' : 'warn'
            }
            
            // 如果配置值不是 "off"，才添加
            if (configValue !== 'off') {
              const ruleData = {
                name: ruleName,
                configValue: configValue,
                source: 'extends',
                extendsChain: [...extendsChain, {
                  name: extend,
                  depth: depth,
                  configValue: configValue
                }],
                plugin: null,
                depth: depth,
                isOverridden: false,
                description: rule.meta && rule.meta.docs ? rule.meta.docs.description : '',
                url: rule.meta && rule.meta.docs ? rule.meta.docs.url : '',
                category: rule.meta && rule.meta.type ? rule.meta.type : 'unknown'
              }
              
              results.rules.push(ruleData)
              extendInfo.rules.push(ruleData)
            }
          }
        }
      }
      
      extendInfo.rulesCount = extendInfo.rules.length
      results.extendsChain.push(extendInfo)
      
    } else if (extend.startsWith('plugin:')) {
      // 插件推荐配置
      extendInfo.type = 'plugin'
      const parts = extend.split('/')
      const pluginName = parts[0].replace('plugin:', '')
      const configName = parts.slice(1).join('/')
      
      extendInfo.plugin = pluginName
      extendInfo.configName = configName
      
      // 加载插件
      const pluginPackageName = `${pluginName}/eslint-plugin`
      const plugin = loadModule(pluginPackageName)
      
      if (plugin) {
        // 添加到插件列表
        if (!results.plugins.find(p => p.name === pluginName)) {
          try {
            const packageJson = loadModule(`${pluginName}/package.json`)
            results.plugins.push({
              name: pluginName,
              packageName: pluginPackageName,
              version: packageJson ? packageJson.version : 'unknown',
              rulesCount: Object.keys(plugin.rules || {}).length,
              recommendedRules: 0
            })
          } catch (e) {
            results.plugins.push({
              name: pluginName,
              packageName: pluginPackageName,
              version: 'unknown',
              rulesCount: Object.keys(plugin.rules || {}).length,
              recommendedRules: 0
            })
          }
        }
        
        // 读取插件的推荐配置
        if (plugin.configs && plugin.configs[configName]) {
          const pluginConfig = plugin.configs[configName]
          
          // 递归追踪插件的 extends
          if (pluginConfig.extends) {
            const nestedResults = traceExtends(pluginConfig, depth + 1, [...extendsChain, { name: extend, depth: depth }])
            results.extendsChain.push(...nestedResults.extendsChain)
            results.rules.push(...nestedResults.rules)
            results.plugins.push(...nestedResults.plugins)
          }
          
          // 读取插件的规则
          if (pluginConfig.rules) {
            for (const [ruleName, ruleConfig] of Object.entries(pluginConfig.rules)) {
              const fullRuleName = `${pluginName}/${ruleName}`
              
              // 如果配置值不是 "off"，才添加
              if (ruleConfig !== 'off') {
                const ruleData = {
                  name: fullRuleName,
                  configValue: ruleConfig,
                  source: 'extends',
                  extendsChain: [...extendsChain, {
                    name: extend,
                    depth: depth,
                    configValue: ruleConfig
                  }],
                  plugin: pluginName,
                  depth: depth,
                  isOverridden: false,
                  description: plugin.rules && plugin.rules[ruleName] ? 
                    (plugin.rules[ruleName].meta && plugin.rules[ruleName].meta.docs ? 
                      plugin.rules[ruleName].meta.docs.description : '') : '',
                  url: '',
                  category: plugin.rules && plugin.rules[ruleName] ? 
                    (plugin.rules[ruleName].meta && plugin.rules[ruleName].meta.type ? 
                      plugin.rules[ruleName].meta.type : 'unknown') : 'unknown'
                }
                
                results.rules.push(ruleData)
                extendInfo.rules.push(ruleData)
              }
            }
          }
        }
      }
      
      extendInfo.rulesCount = extendInfo.rules.length
      results.extendsChain.push(extendInfo)
      
    } else {
      // 共享配置
      extendInfo.type = 'shared'
      
      // 尝试从 node_modules 加载
      const configModule = loadModule(extend)
      
      if (configModule) {
        // 递归追踪共享配置的 extends
        if (configModule.extends) {
          const nestedResults = traceExtends(configModule, depth + 1, [...extendsChain, { name: extend, depth: depth }])
          results.extendsChain.push(...nestedResults.extendsChain)
          results.rules.push(...nestedResults.rules)
          results.plugins.push(...nestedResults.plugins)
        }
        
        // 读取共享配置的规则
        if (configModule.rules) {
          for (const [ruleName, ruleConfig] of Object.entries(configModule.rules)) {
            // 如果配置值不是 "off"，才添加
            if (ruleConfig !== 'off') {
              const ruleData = {
                name: ruleName,
                configValue: ruleConfig,
                source: 'extends',
                extendsChain: [...extendsChain, {
                  name: extend,
                  depth: depth,
                  configValue: ruleConfig
                }],
                plugin: null,
                depth: depth,
                isOverridden: false,
                description: '',
                url: '',
                category: 'unknown'
              }
              
              results.rules.push(ruleData)
              extendInfo.rules.push(ruleData)
            }
          }
        }
      }
      
      extendInfo.rulesCount = extendInfo.rules.length
      results.extendsChain.push(extendInfo)
    }
  }
  
  return results
}

// 加载插件的规则
function loadPluginRules(plugins) {
  const rules = []
  
  for (const pluginName of plugins) {
    const pluginPackageName = `${pluginName}/eslint-plugin`
    const plugin = loadModule(pluginPackageName)
    
    if (plugin && plugin.rules) {
      for (const [ruleName, rule] of Object.entries(plugin.rules)) {
        const fullRuleName = `${pluginName}/${ruleName}`
        
        rules.push({
          name: fullRuleName,
          description: rule.meta && rule.meta.docs ? rule.meta.docs.description : '',
          url: rule.meta && rule.meta.docs ? rule.meta.docs.url : '',
          category: rule.meta && rule.meta.type ? rule.meta.type : 'unknown'
        })
      }
    }
  }
  
  return rules
}

// 合并规则（去重并应用覆盖）
function mergeRules(extendsRules, localRules, plugins) {
  const ruleMap = new Map()
  
  // 首先添加 extends 的规则
  for (const rule of extendsRules) {
    ruleMap.set(rule.name, rule)
  }
  
  // 应用本地规则的覆盖
  for (const rule of localRules) {
    if (ruleMap.has(rule.name)) {
      const existingRule = ruleMap.get(rule.name)
      
      // 标记为被覆盖
      ruleMap.set(rule.name, {
        ...existingRule,
        configValue: rule.configValue,
        source: 'local',
        isOverridden: true,
        originalValue: existingRule.configValue,
        extendsChain: [...existingRule.extendsChain, {
          name: 'local',
          depth: existingRule.depth + 1,
          configValue: rule.configValue
        }]
      })
    } else {
      ruleMap.set(rule.name, {
        ...rule,
        source: 'local',
        extendsChain: [{
          name: 'local',
          depth: 1,
          configValue: rule.configValue
        }]
      })
    }
  }
  
  // 只保留配置值不是 "off" 的规则
  const enabledRules = Array.from(ruleMap.values()).filter(rule => rule.configValue !== 'off')
  
  return enabledRules
}

// 对比新旧规则（增量更新）
function compareRules(oldRules, newRules) {
  const changes = {
    added: [],
    removed: [],
    modified: [],
    unchanged: []
  }
  
  // 创建旧规则的映射
  const oldRulesMap = new Map()
  oldRules.forEach(rule => oldRulesMap.set(rule.name, rule))
  
  // 对比新规则
  newRules.forEach(newRule => {
    const oldRule = oldRulesMap.get(newRule.name)
    
    if (!oldRule) {
      // 新增的规则
      changes.added.push(newRule)
    } else if (newRule.configValue !== oldRule.configValue) {
      // 配置值变化的规则
      changes.modified.push({
        name: newRule.name,
        oldValue: oldRule.configValue,
        newValue: newRule.configValue,
        oldRule: oldRule,
        newRule: newRule
      })
    } else {
      // 未变化的规则
      changes.unchanged.push(newRule)
    }
  })
  
  // 找出删除的规则
  oldRules.forEach(oldRule => {
    const exists = newRules.some(newRule => newRule.name === oldRule.name)
    if (!exists) {
      changes.removed.push(oldRule)
    }
  })
  
  return changes
}

// 收集插件名称
function collectPluginNames(config) {
  const plugins = []
  
  if (config.plugins) {
    for (const plugin of config.plugins) {
      if (typeof plugin === 'string') {
        plugins.push(plugin)
      } else if (plugin.name) {
        plugins.push(plugin.name)
      }
    }
  }
  
  // 从 extends 收集插件名称
  if (config.extends) {
    for (const extend of config.extends) {
      if (extend.startsWith('plugin:')) {
        const parts = extend.split('/')
        const pluginName = parts[0].replace('plugin:', '')
        if (!plugins.includes(pluginName)) {
          plugins.push(pluginName)
        }
      }
    }
  }
  
  return plugins
}

// 主函数
async function main() {
  console.log('============================================================')
  console.log('第一步：递归收集所有层级规则')
  console.log('============================================================')
  console.log('')
  
  try {
    // 检查配置文件是否存在
    if (!fs.existsSync(config.configPath)) {
      throw new Error(`配置文件不存在：${config.configPath}`)
    }
    
    console.log(`✅ 配置文件：${config.configPath}`)
    console.log(`✅ 项目根目录：${config.rootDir}`)
    console.log('')
    
    // 加载配置
    console.log('📖 加载配置文件...')
    const projectConfig = loadConfig(config.configPath)
    console.log('✅ 配置文件加载成功')
    console.log('')
    
    // 收集插件名称
    console.log('🔍 收集插件名称...')
    const pluginNames = collectPluginNames(projectConfig)
    console.log(`✅ 发现 ${pluginNames.length} 个插件：${pluginNames.join(', ')}`)
    console.log('')
    
    // 递归追踪 extends
    console.log('🔄 递归追踪 extends（无限深度）...')
    const extendsResults = traceExtends(projectConfig)
    console.log(`✅ 追踪到 ${extendsResults.extendsChain.length} 个继承配置`)
    console.log(`✅ 收集到 ${extendsResults.rules.length} 条继承规则`)
    console.log(`✅ 加载了 ${extendsResults.plugins.length} 个插件`)
    console.log('')
    
    // 收集本地规则
    console.log('📋 收集本地规则...')
    const localRules = []
    if (projectConfig.rules) {
      for (const [ruleName, ruleConfig] of Object.entries(projectConfig.rules)) {
        // 只收集配置值不是 "off" 的规则
        if (ruleConfig !== 'off') {
          localRules.push({
            name: ruleName,
            configValue: ruleConfig
          })
        }
      }
    }
    console.log(`✅ 收集到 ${localRules.length} 条本地规则`)
    console.log('')
    
    // 合并规则
    console.log('🔗 合并规则...')
    const allRules = mergeRules(extendsResults.rules, localRules, extendsResults.plugins)
    console.log(`✅ 合并后共有 ${allRules.length} 条规则`)
    console.log('')
    
    // 检查是否有已关闭的规则
    const offRules = allRules.filter(rule => rule.configValue === 'off')
    if (offRules.length > 0) {
      throw new Error(`❌ 严重错误：收集到 ${offRules.length} 条已关闭的规则！`)
    }
    console.log('✅ 验证通过：没有已关闭的规则')
    console.log('')
    
    // 统计信息
    const stats = {
      totalRules: allRules.length,
      errorLevel: allRules.filter(r => r.configValue === 'error').length,
      warnLevel: allRules.filter(r => r.configValue === 'warn').length,
      offLevel: allRules.filter(r => r.configValue === 'off').length,
      coreRules: allRules.filter(r => !r.name.includes('/') || r.name.startsWith('@typescript-eslint')).length,
      pluginRules: allRules.filter(r => r.name.includes('/') && !r.name.startsWith('@typescript-eslint')).length,
      extendsLevels: extendsResults.extendsChain.length,
      pluginsLoaded: extendsResults.plugins.length
    }
    
    console.log('📊 统计信息：')
    console.log(`  总规则数：${stats.totalRules} 条`)
    console.log(`  error 级别：${stats.errorLevel} 条`)
    console.log(`  warn 级别：${stats.warnLevel} 条`)
    console.log(`  核心规则：${stats.coreRules} 条`)
    console.log(`  插件规则：${stats.pluginRules} 条`)
    console.log(`  继承层级：${stats.extendsLevels} 层`)
    console.log(`  加载插件：${stats.pluginsLoaded} 个`)
    console.log('')
    
    // 检查是否需要增量更新
    if (fs.existsSync(config.oldRulesPath)) {
      console.log('🔄 检测到旧的 rules.json，进行增量更新...')
      const oldRulesData = JSON.parse(fs.readFileSync(config.oldRulesPath, 'utf-8'))
      const changes = compareRules(oldRulesData.rules, allRules)
      
      console.log('📋 配置变化报告：')
      console.log(`  新增规则：${changes.added.length} 条`)
      console.log(`  删除规则：${changes.removed.length} 条`)
      console.log(`  修改规则：${changes.modified.length} 条`)
      console.log(`  未变化：${changes.unchanged.length} 条`)
      console.log('')
      
      if (changes.added.length > 0) {
        console.log('  新增的规则：')
        changes.added.forEach(rule => console.log(`    + ${rule.name} (${rule.configValue})`))
      }
      
      if (changes.removed.length > 0) {
        console.log('  删除的规则：')
        changes.removed.forEach(rule => console.log(`    - ${rule.name} (${rule.configValue})`))
      }
      
      if (changes.modified.length > 0) {
        console.log('  修改的规则：')
        changes.modified.forEach(change => {
          console.log(`    ~ ${change.name}: ${change.oldValue} → ${change.newValue}`)
        })
      }
      
      console.log('')
    }
    
    // 生成输出数据
    const outputData = {
      meta: {
        rootDir: config.rootDir,
        configPath: config.configPath,
        collectedAt: new Date().toISOString(),
        eslintVersion: null
      },
      extendsChain: extendsResults.extendsChain,
      plugins: extendsResults.plugins,
      rules: allRules,
      stats: stats
    }
    
    // 获取 ESLint 版本
    const eslint = loadModule('eslint')
    if (eslint) {
      outputData.meta.eslintVersion = eslint.version
    }
    
    // 创建输出目录
    const outputDir = path.dirname(config.outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    
    // 备份旧的 rules.json
    if (fs.existsSync(config.oldRulesPath)) {
      const backupPath = config.oldRulesPath.replace('.json', '-old.json')
      fs.copyFileSync(config.oldRulesPath, backupPath)
      console.log(`✅ 已备份旧的 rules.json 到 ${backupPath}`)
    }
    
    // 写入输出文件
    fs.writeFileSync(config.outputPath, JSON.stringify(outputData, null, 2), 'utf-8')
    console.log(`✅ 已生成 rules.json：${config.outputPath}`)
    console.log('')
    
    console.log('============================================================')
    console.log('✅ 第一步完成！已递归收集所有层级的未关闭规则')
    console.log('============================================================')
    console.log('')
    
    process.exit(0)
  } catch (error) {
    console.error('')
    console.error('============================================================')
    console.error('❌ 第一步失败！')
    console.error('============================================================')
    console.error(error.message)
    console.error(error.stack)
    console.error('')
    
    process.exit(1)
  }
}

// 执行主函数
main()
