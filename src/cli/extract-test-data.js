#!/usr/bin/env node

const path = require('path');
const inquirer = require('inquirer');
const DifyTestDataExtractor = require('../utils/extract-test-data');

async function main() {
    console.log('🔍 Dify测试数据提取工具');
    console.log('=====================================\n');

    // 解析命令行参数
    const args = process.argv.slice(2);
    let appPath = null;
    let maxTests = 5;
    let days = 7;

    // 解析参数
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--app-path':
                appPath = args[++i];
                break;
            case '--max-tests':
                maxTests = parseInt(args[++i]);
                break;
            case '--days':
                days = parseInt(args[++i]);
                break;
            case '--help':
            case '-h':
                showHelp();
                return;
        }
    }

    // 如果没有指定app路径，让用户选择
    if (!appPath) {
        const fs = require('fs');
        const appsDir = path.join(process.cwd(), 'apps');
        
        if (!fs.existsSync(appsDir)) {
            console.error('❌ 未找到apps目录，请确保在项目根目录运行此命令');
            process.exit(1);
        }

        const apps = fs.readdirSync(appsDir)
            .filter(f => fs.statSync(path.join(appsDir, f)).isDirectory())
            .map(f => ({
                name: f,
                value: path.join(appsDir, f)
            }));

        if (apps.length === 0) {
            console.error('❌ 未找到任何应用，请先运行 npm start 同步应用');
            process.exit(1);
        }

        const { selectedApp } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedApp',
                message: '请选择要提取测试数据的应用：',
                choices: apps
            }
        ]);

        appPath = selectedApp;
    }

    // 验证应用路径
    const fs = require('fs');
    if (!fs.existsSync(appPath)) {
        console.error(`❌ 应用路径不存在: ${appPath}`);
        process.exit(1);
    }

    const configPath = path.join(appPath, 'config.json');
    const inputsPath = path.join(appPath, 'test', 'inputs.json');

    if (!fs.existsSync(configPath)) {
        console.error(`❌ 应用配置文件不存在: ${configPath}`);
        process.exit(1);
    }

    if (!fs.existsSync(inputsPath)) {
        console.error(`❌ 输入参数结构文件不存在: ${inputsPath}`);
        console.log('请先运行 npm run prepare 初始化应用');
        process.exit(1);
    }

    // 如果没有通过参数指定，询问用户
    if (args.length === 0) {
        const answers = await inquirer.prompt([
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
            }
        ]);

        maxTests = parseInt(answers.maxTests);
        days = parseInt(answers.days);
    }

    console.log(`\n📁 应用路径: ${appPath}`);
    console.log(`📊 提取数量: ${maxTests} 个测试用例`);
    console.log(`📅 时间范围: 最近 ${days} 天`);
    console.log('');

    try {
        const extractor = new DifyTestDataExtractor(appPath);
        await extractor.extractTestData(maxTests, days);
        
        console.log('\n✅ 测试数据提取完成！');
        console.log('📝 已自动过滤掉metadata.json和sys.开头的参数');
        console.log('现在可以使用以下命令测试新提取的数据：');
        console.log(`  cd ${appPath}`);
        console.log('  npm run test:workflow -- --inputs 1');
        
    } catch (error) {
        console.error('❌ 提取测试数据失败:', error.message);
        process.exit(1);
    }
}

function showHelp() {
    console.log(`
🔍 Dify测试数据提取工具

用法:
  node src/cli/extract-test-data.js [选项]

选项:
  --app-path <path>     指定应用路径
  --max-tests <number>  要提取的测试用例数量 (默认: 5)
  --days <number>       要获取最近几天的日志 (默认: 7)
  --help, -h           显示帮助信息

示例:
  # 交互式选择应用
  node src/cli/extract-test-data.js

  # 指定应用路径
  node src/cli/extract-test-data.js --app-path ./apps/my-app

  # 指定参数
  node src/cli/extract-test-data.js --max-tests 10 --days 3

注意:
  - 需要先运行 npm start 同步应用
  - 需要先运行 npm run prepare 初始化应用
  - 需要已登录 cloud.dify.ai 并配置了 Chrome LevelDB 路径
  - 自动过滤掉metadata.json和sys.开头的参数
`);
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ 程序执行失败:', error.message);
        process.exit(1);
    });
}

module.exports = { main }; 