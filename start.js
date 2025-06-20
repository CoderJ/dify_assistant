#!/usr/bin/env node
const inquirer = require('inquirer');
const prompt = inquirer.createPromptModule();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function main() {
  while (true) {
    const { action } = await prompt([
      {
        type: 'list',
        name: 'action',
        message: '请选择操作：',
        choices: [
          { name: '初始化本地开发环境（prepare）', value: 'prepare' },
          { name: '合并并发布（update）', value: 'update' },
          { name: '批量测试（test）', value: 'test' },
          { name: '命令行对话测试（test:chat）', value: 'test:chat' },
          { name: '退出', value: 'exit' }
        ]
      }
    ]);
    if (action === 'exit') {
      console.log('已退出。');
      break;
    }
    let cmd = '';
    if (action === 'prepare') cmd = 'npm run prepare';
    if (action === 'update') cmd = 'npm run update';
    if (action === 'test') cmd = 'npm run test';
    if (action === 'test:chat') {
      // 检查本地有多少组inputs
      const inputsRoot = path.join(__dirname, 'test', 'inputs');
      let inputSets = [];
      if (fs.existsSync(inputsRoot)) {
        inputSets = fs.readdirSync(inputsRoot).filter(f => fs.statSync(path.join(inputsRoot, f)).isDirectory());
      }
      let chosen = '1';
      if (inputSets.length > 1) {
        const { set } = await prompt([
          {
            type: 'list',
            name: 'set',
            message: '请选择要使用的输入编号（inputs）：',
            choices: inputSets.map(s => ({ name: s, value: s }))
          }
        ]);
        chosen = set;
      }
      cmd = `npm run test:chat -- --inputs ${chosen}`;
    }
    if (cmd) {
      try {
        execSync(cmd, { stdio: 'inherit' });
      } catch (e) {
        console.error('命令执行出错:', e.message);
      }
    }
  }
}

main(); 