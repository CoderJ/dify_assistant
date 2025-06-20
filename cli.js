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

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];
const configArgIdx = args.indexOf('--config');
const configFile = configArgIdx !== -1 ? args[configArgIdx + 1] : 'config.json';

// 读取配置
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, configFile), 'utf-8'));
} catch (e) {
  console.error(`请先在项目根目录创建 ${configFile} 配置文件！`);
  process.exit(1);
}
const { DIFY_BASE_URL, API_TOKEN, APP_ID } = config;

// 工具函数
function safeFileName(name) {
  return name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
}
function parsePromptMd(md) {
  const blocks = md.split(/---\s*/).map(b => b.trim()).filter(Boolean);
  const prompts = [];
  for (const block of blocks) {
    const match = block.match(/^\*\*(.+)\*\*:\s*([\s\S]*)$/);
    if (match) {
      prompts.push({ role: match[1].trim(), text: match[2].trim() });
    }
  }
  return prompts;
}

// 自动刷新token的请求封装
async function requestWithAutoRefresh(config, configPath, axiosConfig) {
  try {
    axiosConfig.headers = axiosConfig.headers || {};
    axiosConfig.headers['Authorization'] = `Bearer ${config.API_TOKEN}`;
    return await axios(axiosConfig);
  } catch (err) {
    if (err.response && err.response.status === 401 && config.API_REFRESH_TOKEN) {
      // token过期，自动刷新
      try {
        const res = await axios.post(
          `${config.DIFY_BASE_URL}/console/api/refresh-token`,
          { refresh_token: config.API_REFRESH_TOKEN },
          { headers: { 'Content-Type': 'application/json' } }
        );
        const { access_token, refresh_token } = res.data.data;
        config.API_TOKEN = access_token;
        config.API_REFRESH_TOKEN = refresh_token;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        axiosConfig.headers['Authorization'] = `Bearer ${access_token}`;
        return await axios(axiosConfig); // 重试
      } catch (refreshErr) {
        console.error('刷新API_TOKEN失败，请手动在config.json中更新API_TOKEN和API_REFRESH_TOKEN！');
        if (refreshErr.response) {
          console.error('刷新失败详情:', JSON.stringify(refreshErr.response.data));
        } else {
          console.error('刷新失败详情:', refreshErr.message);
        }
        process.exit(1);
      }
    }
    throw err;
  }
}

// 1. 导出主DSL并拆分llm节点
async function exportAndSplit() {
  // 导出主DSL
  try {
    const res = await requestWithAutoRefresh(config, path.join(__dirname, configFile), {
      method: 'get',
      url: `${DIFY_BASE_URL}/console/api/apps/${APP_ID}/export?include_secret=false`
    });
    const dslDir = path.join(__dirname, 'DSL');
    if (!fs.existsSync(dslDir)) fs.mkdirSync(dslDir);
    let yamlContent = res.data;
    if (typeof yamlContent === 'object' && yamlContent.data) yamlContent = yamlContent.data;
    const mainPath = path.join(dslDir, 'main.yml');
    fs.writeFileSync(mainPath, yamlContent, 'utf-8');
    console.log('导出成功，文件已保存为 DSL/main.yml');
    // 拆分llm节点
    const promptsDir = path.join(__dirname, 'prompts');
    if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir);
    const dsl = yaml.load(fs.readFileSync(mainPath, 'utf-8'));
    const nodes = dsl?.workflow?.graph?.nodes || [];
    // 自动生成inputs.json
    const testDir = path.join(__dirname, 'test');
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
    // 拆分llm节点
    let llmCount = 0;
    for (const node of nodes) {
      if (node?.data?.type === 'llm') {
        const title = node.data.title || `llm_${node.id}`;
        const safeTitle = safeFileName(title);
        // prompt_template -> markdown
        const prompts = node.data.prompt_template || [];
        let mdContent = `# ${title} Prompt\n\n`;
        for (const p of prompts) {
          mdContent += `**${p.role}**:\n\n${p.text}\n\n---\n`;
        }
        fs.writeFileSync(path.join(promptsDir, `${safeTitle}.md`), mdContent, 'utf-8');
        // 其它参数 -> json
        const { prompt_template, ...rest } = node.data;
        fs.writeFileSync(path.join(promptsDir, `${safeTitle}.json`), JSON.stringify(rest, null, 2), 'utf-8');
        llmCount++;
        console.log(`已导出: ${safeTitle}.md, ${safeTitle}.json`);
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
  // 合并llm节点
  const dslPath = path.join(__dirname, 'DSL', 'main.yml');
  const promptsDir = path.join(__dirname, 'prompts');
  const dsl = yaml.load(fs.readFileSync(dslPath, 'utf-8'));
  const nodes = dsl?.workflow?.graph?.nodes || [];
  let llmCount = 0;
  for (const node of nodes) {
    if (node?.data?.type === 'llm') {
      const title = node.data.title || `llm_${node.id}`;
      const safeTitle = safeFileName(title);
      const mdPath = path.join(promptsDir, `${safeTitle}.md`);
      const jsonPath = path.join(promptsDir, `${safeTitle}.json`);
      if (!fs.existsSync(mdPath) || !fs.existsSync(jsonPath)) {
        console.warn(`跳过 ${title}，因缺少 md 或 json 文件。`);
        continue;
      }
      const mdContent = fs.readFileSync(mdPath, 'utf-8');
      const prompt_template = parsePromptMd(mdContent);
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
    const res = await requestWithAutoRefresh(config, path.join(__dirname, configFile), {
      method: 'post',
      url: `${DIFY_BASE_URL}/console/api/apps/imports`,
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
    const publishRes = await requestWithAutoRefresh(config, path.join(__dirname, configFile), {
      method: 'post',
      url: `${DIFY_BASE_URL}/console/api/apps/${APP_ID}/workflows/publish`,
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
  exportAndSplit();
} else if (command === 'update') {
  mergeAndUpdate();
} else {
  console.log('用法: node cli.js export|update [--config config.test.json]');
  process.exit(1);
} 