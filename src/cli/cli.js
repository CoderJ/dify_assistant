#!/usr/bin/env node
/**
 * dify-dsl-cli
 * 
 * 一个用于导入导出 Dify 应用 DSL 配置的命令行工具，方便本地编辑和批量管理 Dify 应用。
 * 
 * 用法：
 *   node cli.js export   # 导出 DSL
 *   node cli.js import   # 导入 DSL
 *
 * 配置请参考 config.json
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const axios = require('axios');
const TokenManager = require('../utils/token-manager');

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];
const configArgIdx = args.indexOf('--config');
const configFile = configArgIdx !== -1 ? args[configArgIdx + 1] : 'config.json';

// 获取应用路径（从环境变量或当前目录）
const appPath = process.env.APP_PATH || process.cwd();
const rootConfigPath = path.join(process.cwd(), 'config.json');

const tokenManager = new TokenManager();

// 确保缓存文件始终在项目根目录
function findProjectRoot() {
  let currentDir = process.cwd();
  console.log(`🔍 开始查找项目根目录，当前目录: ${currentDir}`);
  while (currentDir !== path.dirname(currentDir)) {
    console.log(`🔍 检查目录: ${currentDir}`);
    const configPath = path.join(currentDir, 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        // 检查是否包含全局配置（DIFY_BASE_URL）
        if (config.DIFY_BASE_URL) {
          console.log(`✅ 找到项目根目录: ${currentDir}`);
          return currentDir;
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
    currentDir = path.dirname(currentDir);
  }
  console.log(`⚠️ 未找到项目根目录，使用当前目录: ${process.cwd()}`);
  return process.cwd(); // 如果找不到，返回当前目录
}

const projectRoot = findProjectRoot();
const LAST_PROJECT_FILE = path.join(projectRoot, '.last_project');

function getLastProjectPath() {
  if (fs.existsSync(LAST_PROJECT_FILE)) {
    return fs.readFileSync(LAST_PROJECT_FILE, 'utf-8').trim();
  }
  return null;
}

function setLastProjectPath(projectPath) {
  console.log(`💾 缓存项目路径: ${projectPath}`);
  console.log(`📁 缓存文件位置: ${LAST_PROJECT_FILE}`);
  fs.writeFileSync(LAST_PROJECT_FILE, projectPath, 'utf-8');
  console.log(`✅ 项目路径已缓存到: ${LAST_PROJECT_FILE}`);
}

// 立即缓存当前项目路径（只有在应用目录下才缓存）
if (appPath !== projectRoot) {
  setLastProjectPath(appPath);
}

// 读取全局配置
let globalConfig = {};
try {
  globalConfig = JSON.parse(fs.readFileSync(rootConfigPath, 'utf-8'));
} catch (e) {
  console.error('请在项目根目录创建 config.json 全局配置文件！');
  process.exit(1);
}

// 读取app配置
let appConfig = {};
try {
  const configPath = path.join(appPath, configFile);
  console.log(`📁 读取配置文件: ${configPath}`);
  appConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log('📋 读取到的appConfig:', appConfig);
} catch (e) {
  console.error('❌ 读取app配置失败:', e.message);
  // 忽略，部分命令可能不需要
}

const APP_ID = appConfig.APP_ID || '';
const TEST_API_KEY = appConfig.TEST_API_KEY || '';
const DIFY_BASE_URL = globalConfig.DIFY_BASE_URL;
const TEST_BASE_URL = globalConfig.TEST_BASE_URL;

console.log('🔍 解析结果:');
console.log('  APP_ID:', APP_ID);
console.log('  TEST_API_KEY:', TEST_API_KEY ? TEST_API_KEY.substring(0, 10) + '...' : '');
console.log('  DIFY_BASE_URL:', DIFY_BASE_URL);
console.log('  TEST_BASE_URL:', TEST_BASE_URL);

// 使用正确的变量名
const api_key = TEST_API_KEY;
const api_base_url = DIFY_BASE_URL; // 这里应该是DIFY_BASE_URL，不是TEST_BASE_URL

async function getToken() {
  return await tokenManager.getToken();
}

async function requestWithTokenRetry(axiosConfig) {
  return await tokenManager.requestWithTokenRetry(axiosConfig);
}

// 工具函数
function safeFileName(name) {
  return name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
}
function parsePromptMd(md) {
  // 支持多行内容，---分隔
  const blocks = md.split(/---\s*\n?/).map(b => b.trim()).filter(Boolean);
  const prompts = [];
  for (const block of blocks) {
    // 支持**role**:（冒号后可有空格），内容可多行
    const match = block.match(/^\*\*(.+?)\*\*:\s*\n?([\s\S]*)$/);
    if (match) {
      prompts.push({ role: match[1].trim(), text: match[2].trim() });
    }
  }
  return prompts;
}

// 1. 导出主DSL并拆分llm节点
async function exportAndSplit() {
  // 导出主DSL
  try {
    const requestUrl = `${api_base_url}/console/api/apps/${APP_ID}/export?include_secret=false`;
    console.log(`🔗 请求URL: ${requestUrl}`);
    console.log(`📋 APP_ID: ${APP_ID}`);
    console.log(`🌐 API_BASE_URL: ${api_base_url}`);
    
    const res = await requestWithTokenRetry({
      method: 'get',
      url: requestUrl
    });
    const dslDir = path.join(appPath, 'DSL');
    if (!fs.existsSync(dslDir)) fs.mkdirSync(dslDir);
    let yamlContent = res.data;
    if (typeof yamlContent === 'object' && yamlContent.data) yamlContent = yamlContent.data;
    const mainPath = path.join(dslDir, 'main.yml');
    fs.writeFileSync(mainPath, yamlContent, 'utf-8');
    console.log('导出成功，文件已保存为 DSL/main.yml');
    // 拆分llm节点
    const promptsDir = path.join(appPath, 'prompts');
    if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir);
    const dsl = yaml.load(fs.readFileSync(mainPath, 'utf-8'));
    const nodes = dsl?.workflow?.graph?.nodes || [];
    // 自动生成inputs.json
    const testDir = path.join(appPath, 'test');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);
    const inputsPath = path.join(testDir, 'inputs.json');
    const startNode = nodes.find(n => n.data?.type === 'start');
    const variables = (startNode?.data?.variables || []).filter(v => v.required);
    const inputs = {};
    for (const v of variables) {
      if (v.type === 'number') inputs[v.variable] = 0;
      else if (v.type === 'text-input') inputs[v.variable] = '';
      else inputs[v.variable] = null;
    }
    fs.writeFileSync(inputsPath, JSON.stringify(inputs, null, 2), 'utf-8');
    console.log('已生成 test/inputs.json:', inputs);
    // 自动生成inputs/1/变量txt模板
    const inputsDir = path.join(testDir, 'inputs', '1');
    if (!fs.existsSync(inputsDir)) fs.mkdirSync(inputsDir, { recursive: true });
    for (const v of variables) {
      const varFile = path.join(inputsDir, `${v.variable}.txt`);
      if (!fs.existsSync(varFile)) fs.writeFileSync(varFile, '');
    }
    console.log('已生成 test/inputs/1/ 下的变量txt模板，可直接粘贴大段文本。');
    // 拆分llm节点
    let llmCount = 0;
    for (const node of nodes) {
      if (node?.data?.type === 'llm') {
        const title = node.data.title || `llm_${node.id}`;
        const safeTitle = safeFileName(title);
        // prompt_template -> 多md文件
        const prompts = node.data.prompt_template || [];
        for (let i = 0; i < prompts.length; i++) {
          const role = prompts[i].role;
          const fileName = `${safeTitle}.${role}.md`;
          fs.writeFileSync(path.join(promptsDir, fileName), prompts[i].text, 'utf-8');
        }
        // 其它参数 -> json
        const { prompt_template, ...rest } = node.data;
        fs.writeFileSync(path.join(promptsDir, `${safeTitle}.json`), JSON.stringify(rest, null, 2), 'utf-8');
        llmCount++;
        console.log(`已导出: ${safeTitle}.[role].md, ${safeTitle}.json`);
      }
    }
    if (llmCount === 0) {
      console.log('未找到任何 llm 节点。');
    } else {
      console.log(`共导出 ${llmCount} 个 llm 节点。`);
    }
  } catch (err) {
    console.error('导出或拆分失败:', err.response ? err.response.data : err.message);
    process.exit(1);
  }
}

// 2. 合并llm节点并导入+发布
async function mergeAndUpdate() {
  // 检查是否为PRODUCTION标签的应用
  const appName = path.basename(appPath);
  if (appName.includes('-PRODUCTION-')) {
    console.error('❌ 安全限制：检测到PRODUCTION标签的应用，不允许执行update操作！');
    console.error('📝 应用名称:', appName);
    console.error('🔒 为了保护生产环境，PRODUCTION标签的应用禁止update操作');
    console.error('💡 如需更新，请先将应用标签改为TEST，或联系管理员');
    process.exit(1);
  }

  // 合并llm节点
  const dslPath = path.join(appPath, 'DSL', 'main.yml');
  const promptsDir = path.join(appPath, 'prompts');
  const dsl = yaml.load(fs.readFileSync(dslPath, 'utf-8'));
  const nodes = dsl?.workflow?.graph?.nodes || [];
  let llmCount = 0;
  for (const node of nodes) {
    if (node?.data?.type === 'llm') {
      const title = node.data.title || `llm_${node.id}`;
      const safeTitle = safeFileName(title);
      const jsonPath = path.join(promptsDir, `${safeTitle}.json`);
      if (!fs.existsSync(jsonPath)) {
        console.warn(`跳过 ${title}，因缺少 json 文件。`);
        continue;
      }
      // 读取所有 .role.md 文件
      const prompt_template = [];
      const files = fs.readdirSync(promptsDir).filter(f => f.startsWith(`${safeTitle}.`) && f.endsWith('.md'));
      for (const file of files) {
        const m = file.match(/^.+\.(.+)\.md$/);
        if (m) {
          const role = m[1];
          const text = fs.readFileSync(path.join(promptsDir, file), 'utf-8');
          prompt_template.push({ role, text });
        }
      }
      // 按常见顺序排序（system, user, assistant, ...）
      const roleOrder = { system: 1, user: 2, assistant: 3 };
      prompt_template.sort((a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99));
      const rest = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      node.data = { ...rest, prompt_template };
      llmCount++;
      console.log(`已合并: ${safeTitle}`);
    }
  }
  fs.writeFileSync(dslPath, yaml.dump(dsl, { lineWidth: 120 }), 'utf-8');
  console.log(`已生成新的 main.yml，llm 节点共合并 ${llmCount} 个。`);
  // 导入+发布
  try {
    const yamlContent = fs.readFileSync(dslPath, 'utf-8');
    const res = await requestWithTokenRetry({
      method: 'post',
      url: `${api_base_url}/console/api/apps/imports`,
      data: {
        mode: 'yaml-content',
        yaml_content: yamlContent,
        app_id: APP_ID
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('导入成功:', res.data);
    // 自动发布
    const publishRes = await requestWithTokenRetry({
      method: 'post',
      url: `${api_base_url}/console/api/apps/${APP_ID}/workflows/publish`,
      data: { marked_name: '', marked_comment: '' },
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('发布成功:', publishRes.data);
  } catch (err) {
    console.error('导入或发布失败:', err.response ? err.response.data : err.message);
    process.exit(1);
  }
}

// 命令分发
if (command === 'export') {
  exportAndSplit().then(() => {
    setLastProjectPath(appPath);
  });
} else if (command === 'update') {
  mergeAndUpdate().then(() => {
    setLastProjectPath(appPath);
  });
} else {
  // 支持 --select 参数强制重新选择
  if (!args.includes('--select')) {
    const lastProject = getLastProjectPath();
    console.log(`🔍 检查自动切换: lastProject=${lastProject}, appPath=${appPath}`);
    if (lastProject && lastProject !== appPath) {
      console.log(`🔄 自动切换到上次调试的项目: ${lastProject}`);
      process.chdir(lastProject);
      // 自动执行 export，使用相对于项目根目录的路径
      const cliPath = path.relative(lastProject, path.join(projectRoot, 'src', 'cli', 'cli.js'));
      require('child_process').execSync(`node ${cliPath} export`, { stdio: 'inherit' });
      process.exit(0);
    } else {
      console.log(`ℹ️ 无需切换: lastProject=${lastProject}, appPath=${appPath}`);
    }
  }
  console.log('用法: node cli.js export|update [--config config.test.json]');
  process.exit(1);
} 