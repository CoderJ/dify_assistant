#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline');

// 解析命令行参数
const args = process.argv.slice(2);
const isChatMode = args[0] === 'chat';
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
const BASE_URL = config.TEST_BASE_URL;
const API_KEY = config.TEST_API_KEY;

// 读取全局inputs.json
let globalInputs = {};
try {
  globalInputs = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'inputs.json'), 'utf-8'));
} catch (e) {
  // 没有inputs.json则忽略
}

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
const logFile = path.join(logsDir, `test-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
function logDetail(...args) {
  logStream.write(args.map(x => (typeof x === 'string' ? x : JSON.stringify(x, null, 2))).join(' ') + '\n');
}

// 单轮问答测试（用chat-messages接口，模拟单轮）
async function testCompletion(inputs) {
  const url = `${BASE_URL}/v1/chat-messages`;
  try {
    const mergedInputs = { ...globalInputs, ...inputs };
    const res = await axios.post(url, {
      inputs: mergedInputs,
      query: inputs.question || inputs.query,
      response_mode: 'blocking',
      conversation_id: '',
      user: 'test-user'
    }, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    return res.data.answer || res.data.choices?.[0]?.text || JSON.stringify(res.data);
  } catch (err) {
    return `Error: ${err.response ? JSON.stringify(err.response.data) : err.message}`;
  }
}

// 对话测试
async function testChat(conversation, caseIdx) {
  const url = `${BASE_URL}/v1/chat-messages`;
  let conversation_id = '';
  let answer = '';
  if (caseIdx) logDetail(`【Case ${caseIdx} - Chat】对话:`, conversation);
  for (const turn of conversation) {
    if (turn.role === 'user') {
      try {
        const mergedInputs = { ...globalInputs, ...(turn.inputs || {}) };
        const res = await axios.post(url, {
          inputs: mergedInputs,
          query: turn.content,
          response_mode: 'blocking',
          conversation_id,
          user: 'test-user'
        }, {
          headers: { 'Authorization': `Bearer ${API_KEY}` }
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

// 批量测试模式
async function runBatchTest() {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'testcases.json'), 'utf-8'));
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
        const res = await axios.post(`${BASE_URL}/v1/chat-messages`, {
          inputs: globalInputs,
          query: input,
          response_mode: 'blocking',
          conversation_id,
          user: 'cli-user'
        }, {
          headers: { 'Authorization': `Bearer ${API_KEY}` }
        });
        logDetail('你:', input, '\nAI:', res.data.answer);
        console.log('AI:', res.data.answer);
        conversation_id = res.data.conversation_id || conversation_id;
      } catch (err) {
        logDetail('你:', input, '\nAI:', err.response ? JSON.stringify(err.response.data) : err.message);
        console.log('AI:', err.response ? JSON.stringify(err.response.data) : err.message);
      }
      ask();
    });
  }
  ask();
}

if (isChatMode) {
  runChatCli();
} else {
  runBatchTest();
} 