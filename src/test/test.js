#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline');
const yaml = require('js-yaml');

// 解析命令行参数
const args = process.argv.slice(2);
const isChatMode = args[0] === 'chat';
const isWorkflowMode = args[0] === 'workflow';
const configArgIdx = args.indexOf('--config');
const configFile = configArgIdx !== -1 ? args[configArgIdx + 1] : 'config.json';
const inputsArgIdx = args.indexOf('--inputs');
const inputsSet = inputsArgIdx !== -1 ? args[inputsArgIdx + 1] : '1';

// 获取应用路径（从环境变量或当前目录）
const appPath = process.env.APP_PATH || process.cwd();
const rootConfigPath = path.join(process.cwd(), 'config.json');

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
  appConfig = JSON.parse(fs.readFileSync(path.join(appPath, configFile), 'utf-8'));
} catch (e) {
  // 忽略，部分命令可能不需要
}

const APP_ID = appConfig.APP_ID || '';
const TEST_API_KEY = appConfig.TEST_API_KEY || '';
const DIFY_BASE_URL = globalConfig.DIFY_BASE_URL;
const TEST_BASE_URL = globalConfig.TEST_BASE_URL;

// 解析 DSL 获取 mode
function getDSLMode() {
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

// 读取全局inputs（txt文件版）
function readInputsFromDir(dir) {
  const inputs = {};
  if (!fs.existsSync(dir)) return inputs;
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.txt')) {
      const varName = file.replace(/\.txt$/, '');
      inputs[varName] = fs.readFileSync(path.join(dir, file), 'utf-8');
    }
  }
  return inputs;
}
const globalInputs = readInputsFromDir(path.join(appPath, 'test', 'inputs', inputsSet));

const logsDir = path.join(appPath, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
const logFile = path.join(logsDir, `test-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
function logDetail(...args) {
  logStream.write(args.map(x => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ') + '\n');
}

// 智能合并 inputs，优先使用 .txt 文件的值
function mergeInputs(globalInputs, testInputs) {
  const merged = { ...globalInputs };
  for (const [key, value] of Object.entries(testInputs)) {
    // 如果测试 inputs 中的值为 null，但全局 inputs 中有该字段的有效值，则保留全局值
    if ((value === null || value === undefined || value === '' || value === 0) && globalInputs[key] !== undefined) {
      continue; // 跳过，保留全局值
    }
    merged[key] = value;
  }
  return merged;
}

// 单轮问答测试（用chat-messages接口，模拟单轮）
async function testCompletion(inputs) {
  const url = `${TEST_BASE_URL}/v1/chat-messages`;
  try {
    const mergedInputs = mergeInputs(globalInputs, inputs);
    const res = await axios.post(url, {
      inputs: mergedInputs,
      query: inputs.question || inputs.query,
      response_mode: 'blocking',
      conversation_id: '',
      user: 'test-user'
    }, {
      headers: { 'Authorization': `Bearer ${TEST_API_KEY}` }
    });
    return res.data.answer || res.data.choices?.[0]?.text || JSON.stringify(res.data);
  } catch (err) {
    return `Error: ${err.response ? JSON.stringify(err.response.data) : err.message}`;
  }
}

// 对话测试
async function testChat(conversation, caseIdx) {
  const url = `${TEST_BASE_URL}/v1/chat-messages`;
  let conversation_id = '';
  let answer = '';
  if (caseIdx) logDetail(`【Case ${caseIdx} - Chat】对话:`, conversation);
  for (const turn of conversation) {
    if (turn.role === 'user') {
      try {
        const mergedInputs = mergeInputs(globalInputs, turn.inputs || {});
        const res = await axios.post(url, {
          inputs: mergedInputs,
          query: turn.content,
          response_mode: 'blocking',
          conversation_id,
          user: 'test-user'
        }, {
          headers: { 'Authorization': `Bearer ${TEST_API_KEY}` }
        });
        if (caseIdx) logDetail('用户:', turn.content, '\nAI:', res.data.answer);
        answer = res.data.answer;
        conversation_id = res.data.conversation_id || conversation_id;
      } catch (err) {
        if (caseIdx) logDetail('用户:', turn.content, '\nAI:', err.response ? JSON.stringify(err.response.data) : err.message);
        answer = `Error: ${err.response ? JSON.stringify(err.response.data) : err.message}`;
        break;
      }
    }
  }
  if (caseIdx) logDetail('期望:', conversation.expected, '\n');
  return answer;
}

// Workflow 测试
async function testWorkflow(inputs, caseIdx, inputSetName) {
  const url = `${TEST_BASE_URL}/v1/workflows/run`;
  try {
    const mergedInputs = mergeInputs(globalInputs, inputs);
    if (caseIdx) logDetail(`【Case ${caseIdx} - Workflow】输入:`, mergedInputs);
    
    const res = await axios.post(url, {
      inputs: mergedInputs,
      response_mode: 'blocking',
      user: 'test-user'
    }, {
      headers: { 'Authorization': `Bearer ${TEST_API_KEY}` }
    });
    
    const result = res.data.answer || res.data.output || JSON.stringify(res.data);
    if (caseIdx) logDetail('输出:', result);

    // 新增：保存 data.outputs.text 到 test/outputs/{inputSetName}.txt
    if (inputSetName) {
      const outputsDir = path.join(appPath, 'test', 'outputs');
      if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });
      let text = '';
      if (res.data && res.data.data && res.data.data.outputs && typeof res.data.data.outputs.text === 'string') {
        text = res.data.data.outputs.text;
      } else if (res.data && res.data.outputs && typeof res.data.outputs.text === 'string') {
        text = res.data.outputs.text;
      }
      fs.writeFileSync(path.join(outputsDir, `${inputSetName}.txt`), text, 'utf-8');
    }

    return result;
  } catch (err) {
    const errorMsg = `Error: ${err.response ? JSON.stringify(err.response.data) : err.message}`;
    if (caseIdx) logDetail('错误:', errorMsg);
    return errorMsg;
  }
}

// 批量测试模式
async function runBatchTest() {
  const cases = JSON.parse(fs.readFileSync(path.join(appPath, 'test', 'testcases.json'), 'utf-8'));
  logDetail('全局inputs:', globalInputs);
  for (const [i, tc] of cases.entries()) {
    let result;
    if (tc.type === 'completion') {
      result = await testCompletion(tc.inputs);
      logDetail(`【Case ${i+1} - Completion】输入:`, tc.inputs, '\n输出:', result, '\n期望:', tc.expected, '\n');
      console.log(`【Case ${i+1} - Completion】输入:`, tc.inputs, '\n输出:', result, '\n期望:', tc.expected, '\n');
    } else if (tc.type === 'chat') {
      result = await testChat(tc.conversation, i+1);
      console.log(`【Case ${i+1} - Chat】对话:`, tc.conversation, '\n输出:', result, '\n期望:', tc.expected, '\n');
    } else if (tc.type === 'workflow') {
      result = await testWorkflow(tc.inputs, i+1, tc.inputSetName);
      logDetail(`【Case ${i+1} - Workflow】输入:`, tc.inputs, '\n输出:', result, '\n期望:', tc.expected, '\n');
      console.log(`【Case ${i+1} - Workflow】输入:`, tc.inputs, '\n输出:', result, '\n期望:', tc.expected, '\n');
    } else {
      logDetail(`【Case ${i+1}】未知类型:`, tc.type);
      console.log(`【Case ${i+1}】未知类型:`, tc.type);
    }
  }
  logStream.end();
  console.log('详细日志已保存到:', logFile);
}

// 命令行对话模式
async function runChatCli() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let conversation_id = '';
  logDetail('全局inputs:', globalInputs);
  async function ask() {
    rl.question('你: ', async (input) => {
      if (input.trim().toLowerCase() === 'exit') {
        rl.close();
        logStream.end();
        console.log('详细日志已保存到:', logFile);
        return;
      }
      try {
        const res = await axios.post(`${TEST_BASE_URL}/v1/chat-messages`, {
          inputs: globalInputs,
          query: input,
          response_mode: 'blocking',
          conversation_id,
          user: 'test-user'
        }, {
          headers: { 'Authorization': `Bearer ${TEST_API_KEY}` }
        });
        const answer = res.data.answer || res.data.choices?.[0]?.text || JSON.stringify(res.data);
        conversation_id = res.data.conversation_id || conversation_id;
        logDetail('用户:', input, '\nAI:', answer);
        console.log('AI:', answer);
        ask();
      } catch (err) {
        const errorMsg = `Error: ${err.response ? JSON.stringify(err.response.data) : err.message}`;
        logDetail('用户:', input, '\nAI:', errorMsg);
        console.log('AI:', errorMsg);
        ask();
      }
    });
  }
  ask();
}

// Workflow 测试模式
async function runWorkflowTest() {
  const dslMode = getDSLMode();
  if (dslMode !== 'workflow') {
    console.log('当前 DSL mode 不是 workflow，无法进行 workflow 测试');
    return;
  }
  
  const inputsPath = path.join(appPath, 'test', 'inputs.json');
  if (!fs.existsSync(inputsPath)) {
    console.log('未找到 test/inputs.json，请先运行 prepare 生成');
    return;
  }
  
  const inputs = JSON.parse(fs.readFileSync(inputsPath, 'utf-8'));
  logDetail('全局inputs:', globalInputs);
  logDetail('测试inputs:', inputs);
  
  const result = await testWorkflow(inputs, null, inputsSet);
  console.log('Workflow 测试结果:', result);
  logDetail('Workflow 测试结果:', result);
  logStream.end();
  console.log('详细日志已保存到:', logFile);
}

// 主函数
if (isChatMode) {
  runChatCli();
} else if (isWorkflowMode) {
  runWorkflowTest();
} else {
  runBatchTest();
} 