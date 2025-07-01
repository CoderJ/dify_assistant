const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = 3000;

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
  appConfig = JSON.parse(fs.readFileSync(path.join(appPath, 'config.json'), 'utf-8'));
} catch (e) {
  // 忽略
}

const APP_ID = appConfig.APP_ID || '';
const TEST_API_KEY = appConfig.TEST_API_KEY || '';
const DIFY_BASE_URL = globalConfig.DIFY_BASE_URL;
const TEST_BASE_URL = globalConfig.TEST_BASE_URL;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // 提供静态文件服务

// 提供调试页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'debug.html'));
});

// 处理AI聊天请求 - 流式响应
app.post('/api/chat', async (req, res) => {
  try {
    const { transcription, scene, role, function: functionParam, request_type, request_content, conversation_id } = req.body;
    
    console.log('收到流式请求:', {
      transcription_length: transcription?.length || 0,
      scene: scene,
      role: role,
      function: functionParam,
      request_type: request_type,
      request_content: request_content?.substring(0, 50) + '...'
    });

    // 设置SSE头部
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // 构建聊天应用的输入参数
    const inputs = {
      transcription: transcription || '',
      scene: scene || 'meeting',
      role: role || 'participant'
    };

    // 如果提供了function参数，添加到inputs中
    if (functionParam) {
      inputs.function = functionParam;
    }

    // 构建查询消息
    let query = '';
    if (request_type === 'discover_questions') {
      query = 'Discover Questions';
    } else if (request_type === 'ai_help') {
      query = 'AI Help Request';
    } else if (request_content) {
      query = request_content;
    } else {
      query = request_type || 'help'; // 确保query不为空
    }

    // 调用Dify Chat API - 流式模式
    const difyResponse = await axios.post(
      `${DIFY_BASE_URL}/v1/chat-messages`,
      {
        inputs: inputs,
        query: query,
        response_mode: "streaming", // 流式模式
        conversation_id: conversation_id || "",
        user: "debug-user"
      },
      {
        headers: {
          'Authorization': `Bearer ${TEST_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream' // 设置响应类型为流
      }
    );

    let conversationId = '';
    let messageId = '';
    let fullAnswer = '';

    // 处理流式响应
    difyResponse.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // 移除 'data: ' 前缀
          
          if (data === '[DONE]') {
            // 流结束
            res.write(`data: ${JSON.stringify({ type: 'done', conversation_id: conversationId, message_id: messageId })}\n\n`);
            res.end();
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.event === 'message') {
              // 保存conversation_id和message_id
              if (parsed.conversation_id) conversationId = parsed.conversation_id;
              if (parsed.id) messageId = parsed.id;
              
              // 处理答案内容
              if (parsed.answer) {
                fullAnswer += parsed.answer;
                res.write(`data: ${JSON.stringify({ 
                  type: 'content', 
                  content: parsed.answer,
                  conversation_id: conversationId,
                  message_id: messageId
                })}\n\n`);
              }
            } else if (parsed.event === 'error') {
              res.write(`data: ${JSON.stringify({ type: 'error', error: parsed.message })}\n\n`);
            }
          } catch (e) {
            console.log('解析流数据时出错:', e);
          }
        }
      }
    });

    difyResponse.data.on('end', () => {
      console.log('流式响应完成，总答案长度:', fullAnswer.length);
      res.write(`data: ${JSON.stringify({ type: 'done', conversation_id: conversationId, message_id: messageId })}\n\n`);
      res.end();
    });

    difyResponse.data.on('error', (error) => {
      console.error('流式响应错误:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('处理流式请求时出错:', error.response?.data || error.message);
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: `服务器错误: ${error.response?.data?.message || error.message}` 
    })}\n\n`);
    res.end();
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    config_loaded: !!appConfig,
    api_type: 'streaming_chat',
    dsl_version: '0.1.5',
    app_path: appPath
  });
});

app.listen(PORT, () => {
  console.log(`会议助手调试服务器启动成功！`);
  console.log(`访问地址: http://localhost:${PORT}`);
  console.log(`流式聊天API端点: http://localhost:${PORT}/api/chat`);
  console.log(`健康检查: http://localhost:${PORT}/api/health`);
  console.log(`当前应用路径: ${appPath}`);
  console.log('');
  console.log('使用说明:');
  console.log('1. 在浏览器打开 http://localhost:3000');
  console.log('2. 请确保config.json配置正确以使用真实的Dify Chat API');
  console.log('3. 支持新的DSL工作流：scene, role, function参数');
  console.log('4. 使用流式响应，AI回答会实时显示');
}); 