#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const inquirer = require('inquirer');
const axios = require('axios');
const { getDifyTokensFromChrome } = require('./sync-chrome-tokens');

class AppManager {
  constructor() {
    this.appsDir = path.join(__dirname, 'apps');
    this.ensureAppsDir();
  }

  ensureAppsDir() {
    if (!fs.existsSync(this.appsDir)) {
      fs.mkdirSync(this.appsDir, { recursive: true });
    }
  }

  // 获取所有应用
  getApps() {
    if (!fs.existsSync(this.appsDir)) {
      return [];
    }
    
    return fs.readdirSync(this.appsDir)
      .filter(item => {
        const itemPath = path.join(this.appsDir, item);
        return fs.statSync(itemPath).isDirectory();
      })
      .map(appName => {
        const appPath = path.join(this.appsDir, appName);
        const dslPath = path.join(appPath, 'DSL', 'main.yml');
        let appInfo = {
          name: appName,
          path: appPath,
          displayName: appName,
          mode: 'unknown',
          initialized: false
        };

        if (fs.existsSync(dslPath)) {
          try {
            const dsl = yaml.load(fs.readFileSync(dslPath, 'utf-8'));
            appInfo.displayName = dsl?.app?.name || appName;
            appInfo.mode = dsl?.app?.mode || 'unknown';
            appInfo.initialized = true;
          } catch (e) {
            console.warn(`解析应用 ${appName} 的DSL失败:`, e.message);
          }
        }

        return appInfo;
      });
  }

  // 获取Dify token
  async getToken() {
    const TOKEN_CACHE_FILE = path.join(__dirname, '.token_cache.json');
    let tokenCache = null;
    
    if (tokenCache) return tokenCache;
    if (fs.existsSync(TOKEN_CACHE_FILE)) {
      try {
        tokenCache = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf-8'));
        if (tokenCache && tokenCache.API_TOKEN) return tokenCache;
      } catch (e) {}
    }
    tokenCache = await getDifyTokensFromChrome();
    if (tokenCache && tokenCache.API_TOKEN) {
      fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(tokenCache));
      return tokenCache;
    }
    return null;
  }

  // 同步所有应用
  async syncAllApps() {
    console.log('🔄 开始同步Dify账号下的所有应用...');
    
    // 获取token
    const tokens = await this.getToken();
    if (!tokens || !tokens.API_TOKEN) {
      console.error('❌ 未能获取到有效的Dify token，请确保已登录cloud.dify.ai');
      return;
    }

    // 读取全局配置
    const rootConfigPath = path.join(__dirname, 'config.json');
    let globalConfig = {};
    try {
      globalConfig = JSON.parse(fs.readFileSync(rootConfigPath, 'utf-8'));
    } catch (e) {
      console.error('❌ 请先在项目根目录创建config.json全局配置文件！');
      return;
    }

    const DIFY_BASE_URL = globalConfig.DIFY_BASE_URL;
    if (!DIFY_BASE_URL) {
      console.error('❌ 请在config.json中配置DIFY_BASE_URL');
      return;
    }

    try {
      // 获取所有应用列表
      console.log('📋 获取应用列表...');
      const appsResponse = await axios.get(
        `${DIFY_BASE_URL}/console/api/apps?page=1&limit=100&name=&is_created_by_me=false`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const apps = appsResponse.data.data || [];
      console.log(`✅ 找到 ${apps.length} 个应用`);

      if (apps.length === 0) {
        console.log('📝 没有找到任何应用');
        return;
      }

      // 为每个应用创建文件夹并下载DSL
      for (const app of apps) {
        console.log(`\n📦 处理应用: ${app.name} (${app.mode})`);
        // 取tag
        let tagName = '';
        if (Array.isArray(app.tags) && app.tags.length > 0) {
          tagName = app.tags[0].name;
        }
        // 组装文件夹名
        let folderName = app.name;
        if (tagName) folderName += `-${tagName}`;
        folderName += `-${app.id}`;
        // 替换非法字符
        folderName = folderName.replace(/[\\/:*?"<>|]/g, '_');
        const appPath = path.join(this.appsDir, folderName);
        if (fs.existsSync(appPath)) {
          console.log(`⚠️  应用文件夹已存在，跳过: ${folderName}`);
          continue;
        }
        // 创建文件夹结构
        const folders = ['DSL', 'logs', 'prompts', 'test', 'tmp'];
        folders.forEach(folder => {
          fs.mkdirSync(path.join(appPath, folder), { recursive: true });
        });
        // 下载DSL
        try {
          console.log(`⬇️  下载DSL配置...`);
          const dslResponse = await axios.get(
            `${DIFY_BASE_URL}/console/api/apps/${app.id}/export?include_secret=false`,
            {
              headers: {
                'Authorization': `Bearer ${tokens.API_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }
          );
          let yamlContent = dslResponse.data;
          if (typeof yamlContent === 'object' && yamlContent.data) {
            yamlContent = yamlContent.data;
          }
          // 保存DSL文件
          const dslPath = path.join(appPath, 'DSL', 'main.yml');
          fs.writeFileSync(dslPath, yamlContent, 'utf-8');

          // 获取API Key
          let apiKey = '';
          try {
            console.log(`🔑 获取API Key...`);
            const apiKeyResponse = await axios.get(
              `${DIFY_BASE_URL}/console/api/apps/${app.id}/api-keys`,
              {
                headers: {
                  'Authorization': `Bearer ${tokens.API_TOKEN}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            
            const apiKeys = apiKeyResponse.data.data || [];
            if (apiKeys.length > 0) {
              apiKey = apiKeys[0].token;
              console.log(`✅ 获取到API Key: ${apiKey.substring(0, 10)}...`);
            } else {
              console.log(`⚠️  未找到API Key`);
            }
          } catch (error) {
            console.log(`⚠️  获取API Key失败: ${error.response?.data?.message || error.message}`);
          }

          // 创建配置文件
          const configPath = path.join(appPath, 'config.json');
          const config = {
            "APP_ID": app.id,
            "TEST_API_KEY": apiKey
          };
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

          // 自动执行拆分和初始化操作
          try {
            console.log(`🔧 执行拆分和初始化...`);
            await this.processDSLAndInitialize(appPath, yamlContent);
          } catch (error) {
            console.log(`⚠️  拆分和初始化失败: ${error.message}`);
          }

          console.log(`✅ 应用创建完成: ${folderName}`);
        } catch (error) {
          console.error(`❌ 下载应用 ${app.name} 失败:`, error.response?.data?.message || error.message);
          // 清理失败的文件夹
          if (fs.existsSync(appPath)) {
            fs.rmSync(appPath, { recursive: true, force: true });
          }
        }
      }

      console.log('\n🎉 同步完成！');
      console.log('📝 请检查apps目录下的应用，并手动填写每个应用的TEST_API_KEY');
      console.log('💡 运行 npm start 可以查看和管理所有应用');

    } catch (error) {
      console.error('❌ 同步失败:', error.response?.data?.message || error.message);
    }
  }

  // 创建新应用
  async createApp() {
    const prompt = inquirer.createPromptModule();
    const { appName } = await prompt([
      {
        type: 'input',
        name: 'appName',
        message: '请输入应用文件夹名称（临时名称，初始化后会重命名）：',
        validate: (input) => {
          if (!input.trim()) return '应用名称不能为空';
          if (fs.existsSync(path.join(this.appsDir, input))) {
            return '应用名称已存在';
          }
          return true;
        }
      }
    ]);

    const appPath = path.join(this.appsDir, appName);
    fs.mkdirSync(appPath, { recursive: true });

    // 创建标准文件夹结构
    const folders = ['DSL', 'logs', 'prompts', 'test', 'tmp'];
    folders.forEach(folder => {
      fs.mkdirSync(path.join(appPath, folder), { recursive: true });
    });

    // 创建默认配置文件
    const defaultConfig = {
      "APP_ID": "",
      "TEST_API_KEY": ""
    };

    fs.writeFileSync(
      path.join(appPath, 'config.json'),
      JSON.stringify(defaultConfig, null, 2)
    );

    console.log(`✅ 应用 ${appName} 创建成功！`);
    console.log(`📁 路径: ${appPath}`);
    console.log(`📝 请将DSL文件放入 ${path.join(appPath, 'DSL')} 文件夹`);
    console.log(`⚙️  请编辑 ${path.join(appPath, 'config.json')} 配置文件`);

    return appPath;
  }

  // 初始化应用（现在直接返回，不做任何操作）
  async initializeApp(appPath) {
    return appPath;
  }

  // 选择应用
  async selectApp() {
    const prompt = inquirer.createPromptModule();
    const apps = this.getApps();
    
    if (apps.length === 0) {
      console.log('📝 没有找到任何应用');
      const { sync } = await prompt([
        {
          type: 'confirm',
          name: 'sync',
          message: '是否同步所有应用？',
          default: true
        }
      ]);

      if (sync) {
        await this.syncAllApps();
        return await this.selectApp(); // 重新选择
      } else {
        process.exit(0);
      }
    }

    const choices = apps.map(app => ({
      name: `${app.displayName} (${app.name}) - ${app.mode}${app.initialized ? '' : ' - 未初始化'}`,
      value: app.path
    }));

    choices.push({ name: '🔄 同步所有应用', value: 'sync_all' });

    const { selectedApp } = await prompt([
      {
        type: 'list',
        name: 'selectedApp',
        message: '请选择应用：',
        choices
      }
    ]);

    if (selectedApp === 'sync_all') {
      await this.syncAllApps();
      return await this.selectApp(); // 重新选择
    }

    return selectedApp;
  }

  // 获取应用信息
  getAppInfo(appPath) {
    const appName = path.basename(appPath);
    const dslPath = path.join(appPath, 'DSL', 'main.yml');
    
    let appInfo = {
      name: appName,
      path: appPath,
      displayName: appName,
      mode: 'unknown',
      initialized: false
    };

    if (fs.existsSync(dslPath)) {
      try {
        const dsl = yaml.load(fs.readFileSync(dslPath, 'utf-8'));
        appInfo.displayName = dsl?.app?.name || appName;
        appInfo.mode = dsl?.app?.mode || 'unknown';
        appInfo.initialized = true;
      } catch (e) {
        console.warn(`解析应用 ${appName} 的DSL失败:`, e.message);
      }
    }

    return appInfo;
  }

  // 检查应用是否已初始化
  isAppInitialized(appPath) {
    const dslPath = path.join(appPath, 'DSL', 'main.yml');
    if (!fs.existsSync(dslPath)) {
      return false;
    }

    try {
      const dsl = yaml.load(fs.readFileSync(dslPath, 'utf-8'));
      const appName = dsl?.app?.name;
      const currentName = path.basename(appPath);
      return appName && appName === currentName;
    } catch (e) {
      return false;
    }
  }

  // 处理DSL并初始化应用
  async processDSLAndInitialize(appPath, yamlContent) {
    const yaml = require('js-yaml');
    
    // 解析DSL
    const dsl = yaml.load(yamlContent);
    const nodes = dsl?.workflow?.graph?.nodes || [];
    
    // 拆分llm节点
    const promptsDir = path.join(appPath, 'prompts');
    if (!fs.existsSync(promptsDir)) fs.mkdirSync(promptsDir);
    
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
    console.log(`  📝 已生成 test/inputs.json:`, inputs);
    
    // 自动生成inputs/1/变量txt模板
    const inputsDir = path.join(testDir, 'inputs', '1');
    if (!fs.existsSync(inputsDir)) fs.mkdirSync(inputsDir, { recursive: true });
    for (const v of variables) {
      const varFile = path.join(inputsDir, `${v.variable}.txt`);
      if (!fs.existsSync(varFile)) fs.writeFileSync(varFile, '');
    }
    console.log(`  📝 已生成 test/inputs/1/ 下的变量txt模板`);
    
    // 拆分llm节点
    let llmCount = 0;
    for (const node of nodes) {
      if (node?.data?.type === 'llm') {
        const title = node.data.title || `llm_${node.id}`;
        const safeTitle = this.safeFileName(title);
        
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
        console.log(`  📝 已导出: ${safeTitle}.[role].md, ${safeTitle}.json`);
      }
    }
    
    if (llmCount === 0) {
      console.log(`  📝 未找到任何 llm 节点`);
    } else {
      console.log(`  📝 共导出 ${llmCount} 个 llm 节点`);
    }
  }

  // 工具函数
  safeFileName(name) {
    return name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
  }
}

module.exports = AppManager; 