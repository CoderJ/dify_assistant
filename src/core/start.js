#!/usr/bin/env node
const inquirer = require('inquirer');
const prompt = inquirer.createPromptModule();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const AppManager = require('./app-manager');

// 全局变量存储当前选中的应用路径
let currentAppPath = null;
let appManager = null;

// 解析 DSL 获取 mode
function getDSLMode(appPath) {
  try {
    const dslPath = path.join(appPath, 'DSL', 'main.yml');
    if (fs.existsSync(dslPath)) {
      const dsl = yaml.load(fs.readFileSync(dslPath, 'utf-8'));
      return dsl?.app?.mode || 'unknown';
    }
  } catch (e) {
    console.warn('解析 DSL 失败:', e.message);
  }
  return 'unknown';
}

// 获取可用的输入集
function getAvailableInputSets(appPath) {
  const inputsRoot = path.join(appPath, 'test', 'inputs');
  let inputSets = [];
  if (fs.existsSync(inputsRoot)) {
    inputSets = fs.readdirSync(inputsRoot).filter(f => fs.statSync(path.join(inputsRoot, f)).isDirectory());
  }
  return inputSets;
}

// 选择应用
async function selectApplication(skipCache = false) {
  appManager = new AppManager();
  
  // 检查是否有缓存的应用（除非明确跳过缓存）
  if (!skipCache) {
    const lastProjectFile = path.join(process.cwd(), '.last_project');
    if (fs.existsSync(lastProjectFile)) {
      try {
        const lastProjectPath = fs.readFileSync(lastProjectFile, 'utf-8').trim();
        // 检查缓存的应用是否存在
        if (fs.existsSync(lastProjectPath)) {
          const appInfo = appManager.getAppInfo(lastProjectPath);
          console.log('🚀 Dify Assistant 多应用管理器');
          console.log('=====================================\n');
          console.log(`🎯 自动进入上次调试的应用: ${appInfo.displayName} (${appInfo.mode})`);
          console.log(`📁 路径: ${lastProjectPath}\n`);
          return lastProjectPath;
        }
      } catch (e) {
        console.warn('读取缓存文件失败:', e.message);
      }
    }
  }
  
  console.log('🚀 Dify Assistant 多应用管理器');
  console.log('=====================================\n');
  
  currentAppPath = await appManager.selectApp();
  // 选择后立即写入缓存
  const lastProjectFile = path.join(process.cwd(), '.last_project');
  fs.writeFileSync(lastProjectFile, currentAppPath, 'utf-8');
  const appInfo = appManager.getAppInfo(currentAppPath);
  console.log(`\n🎯 当前应用: ${appInfo.displayName} (${appInfo.mode})`);
  
  // 显示应用标签信息
  const appTag = appManager.getAppTag(currentAppPath);
  if (appTag) {
    const tagIcon = appTag === 'PRODUCTION' ? '🔴' : '🟢';
    console.log(`${tagIcon} 应用标签: ${appTag}`);
  }
  
  console.log(`📁 路径: ${currentAppPath}\n`);
  return currentAppPath;
}

// 执行命令（相对于当前应用）
function executeCommand(cmd, appPath) {
  const originalCwd = process.cwd();
  try {
    process.chdir(appPath);
    // 设置环境变量，让cli.js知道当前应用路径
    process.env.APP_PATH = appPath;
    execSync(cmd, { stdio: 'inherit' });
  } finally {
    process.chdir(originalCwd);
  }
}

async function main() {
  // 选择应用
  currentAppPath = await selectApplication();
  
  let dslMode = getDSLMode(currentAppPath);
  const availableInputSets = getAvailableInputSets(currentAppPath);
  
  console.log(`当前 DSL mode: ${dslMode}`);
  if (availableInputSets.length > 0) {
    console.log(`可用输入集: ${availableInputSets.join(', ')}`);
  }
  console.log('');

  while (true) {
    const choices = [
      { name: '初始化本地开发环境（prepare）', value: 'prepare' },
      { name: '合并并发布（update）', value: 'update' },
    ];

    // 根据 DSL mode 添加 workflow 测试选项
    if (dslMode === 'workflow') {
      choices.push({ name: 'Workflow 测试（test:workflow）', value: 'test:workflow' });
      choices.push({ name: '从Dify日志提取测试数据', value: 'extract_test_data' });
    } else if (dslMode === 'advanced-chat') {
      choices.push({ name: '网页调试（debug）', value: 'debug' });
      choices.push({ name: 'Chat 测试（test:chat）', value: 'test:chat' });
    }

    choices.push({ name: '切换应用', value: 'switch_app' });
    choices.push({ name: '退出', value: 'exit' });

    const { action } = await prompt([
      {
        type: 'list',
        name: 'action',
        message: '请选择操作：',
        choices
      }
    ]);

    if (action === 'exit') {
      console.log('已退出。');
      break;
    }

    if (action === 'switch_app') {
      currentAppPath = await selectApplication(true); // 跳过缓存，直接显示选择列表
      dslMode = getDSLMode(currentAppPath);
      continue;
    }

    // 检查PRODUCTION标签应用的update操作限制
    if (action === 'update') {
      if (appManager.isProductionApp(currentAppPath)) {
        const appName = path.basename(currentAppPath);
        console.error('❌ 安全限制：检测到PRODUCTION标签的应用，不允许执行update操作！');
        console.error('📝 应用名称:', appName);
        console.error('🔒 为了保护生产环境，PRODUCTION标签的应用禁止update操作');
        console.error('💡 如需更新，请先将应用标签改为TEST，或联系管理员');
        continue;
      }
    }

    let cmd = '';
    if (action === 'prepare') cmd = 'npm run prepare';
    if (action === 'update') cmd = 'npm run update';
    if (action === 'test') cmd = 'npm run test';
    if (action === 'debug') cmd = 'npm run debug';
    
    if (action === 'test:chat') {
      let chosen = '1';
      if (availableInputSets.length > 1) {
        const { set } = await prompt([
          {
            type: 'list',
            name: 'set',
            message: '请选择要使用的输入编号（inputs）：',
            choices: availableInputSets.map(s => ({ name: s, value: s }))
          }
        ]);
        chosen = set;
      }
      cmd = `npm run test:chat -- --inputs ${chosen}`;
    }
    
    if (action === 'test:workflow') {
      if (availableInputSets.length === 0) {
        console.log('没有找到可用的输入集，请先在 test/inputs/ 下创建输入文件夹。');
        continue;
      }
      
      const { set } = await prompt([
        {
          type: 'list',
          name: 'set',
          message: '请选择要使用的输入编号（inputs）：',
          choices: [
            ...availableInputSets.map(s => ({ name: s, value: s })),
            { name: '测试全部输入集', value: 'all' }
          ]
        }
      ]);
      
      if (set === 'all') {
        // 测试全部输入集
        for (const inputSet of availableInputSets) {
          console.log(`\n测试输入集: ${inputSet}`);
          try {
            executeCommand(`npm run test:workflow -- --inputs ${inputSet}`, currentAppPath);
          } catch (e) {
            console.error(`测试输入集 ${inputSet} 时出错:`, e.message);
          }
        }
        continue;
      } else {
        cmd = `npm run test:workflow -- --inputs ${set}`;
      }
    }

    if (action === 'extract_test_data') {
      try {
        const DifyTestDataExtractor = require('../utils/extract-test-data');
        
        const { maxTests, days, keyword } = await prompt([
          {
            type: 'input',
            name: 'maxTests',
            message: '要提取多少个测试用例？',
            default: '5',
            validate: (value) => {
              const num = parseInt(value);
              return num > 0 && num <= 20 ? true : '请输入1-20之间的数字';
            }
          },
          {
            type: 'input',
            name: 'days',
            message: '要获取最近几天的日志？',
            default: '7',
            validate: (value) => {
              const num = parseInt(value);
              return num > 0 && num <= 30 ? true : '请输入1-30之间的数字';
            }
          },
          {
            type: 'input',
            name: 'keyword',
            message: '搜索关键词（可选，留空则不搜索）',
            default: ''
          }
        ]);

        const extractor = new DifyTestDataExtractor(currentAppPath);
        await extractor.extractTestData(parseInt(maxTests), parseInt(days), keyword);
        
        console.log('\n✅ 测试数据提取完成！');
        console.log('📝 已自动过滤掉metadata.json和sys.开头的参数');
        console.log('现在可以使用 "Workflow 测试" 来测试新提取的数据。');
        
      } catch (error) {
        console.error('❌ 提取测试数据失败:', error.message);
      }
      continue;
    }

    if (cmd) {
      try {
        executeCommand(cmd, currentAppPath);
      } catch (e) {
        console.error('命令执行出错:', e.message);
      }
    }
  }
}

main(); 