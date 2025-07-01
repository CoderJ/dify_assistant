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
async function selectApplication() {
  appManager = new AppManager();
  
  console.log('🚀 Dify Assistant 多应用管理器');
  console.log('=====================================\n');
  
  currentAppPath = await appManager.selectApp();
  const appInfo = appManager.getAppInfo(currentAppPath);
  console.log(`\n🎯 当前应用: ${appInfo.displayName} (${appInfo.mode})`);
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
  
  const dslMode = getDSLMode(currentAppPath);
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
      { name: '批量测试（test）', value: 'test' },
      { name: '网页调试（debug）', value: 'debug' },
      { name: '命令行对话测试（test:chat）', value: 'test:chat' },
      { name: '切换应用', value: 'switch_app' }
    ];

    // 根据 DSL mode 添加 workflow 测试选项
    if (dslMode === 'workflow') {
      choices.push({ name: 'Workflow 测试（test:workflow）', value: 'test:workflow' });
    }

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
      currentAppPath = await selectApplication();
      continue;
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