const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getDifyTokensFromChrome } = require('./sync-chrome-tokens');

class DifyTestDataExtractor {
    constructor(appPath) {
        this.appPath = appPath;
        this.configPath = path.join(appPath, 'config.json');
        this.inputsPath = path.join(appPath, 'test', 'inputs.json');
        this.testInputsDir = path.join(appPath, 'test', 'inputs');
        
        // 读取配置
        this.appConfig = this.loadAppConfig();
        this.globalConfig = this.loadGlobalConfig();
        this.inputsSchema = this.loadInputsSchema();
    }

    loadAppConfig() {
        try {
            return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        } catch (error) {
            throw new Error(`无法读取应用配置: ${this.configPath}`);
        }
    }

    loadGlobalConfig() {
        const globalConfigPath = path.join(process.cwd(), 'config.json');
        try {
            return JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
        } catch (error) {
            throw new Error(`无法读取全局配置: ${globalConfigPath}`);
        }
    }

    loadInputsSchema() {
        try {
            return JSON.parse(fs.readFileSync(this.inputsPath, 'utf-8'));
        } catch (error) {
            throw new Error(`无法读取输入参数结构: ${this.inputsPath}`);
        }
    }

    async getToken() {
        const TOKEN_CACHE_FILE = path.join(process.cwd(), '.token_cache.json');
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

    async makeRequest(url, options = {}) {
        const tokens = await this.getToken();
        if (!tokens || !tokens.API_TOKEN) {
            throw new Error('无法获取有效的Dify token，请确保已登录cloud.dify.ai');
        }

        const config = {
            method: options.method || 'GET',
            url,
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'Authorization': `Bearer ${tokens.API_TOKEN}`,
                ...options.headers
            },
            ...options
        };

        try {
            return await axios(config);
        } catch (error) {
            if (error.response?.status === 401) {
                // token失效，重新获取
                const newTokens = await getDifyTokensFromChrome();
                if (newTokens && newTokens.API_TOKEN) {
                    const TOKEN_CACHE_FILE = path.join(process.cwd(), '.token_cache.json');
                    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(newTokens));
                    config.headers['Authorization'] = `Bearer ${newTokens.API_TOKEN}`;
                    return await axios(config);
                }
            }
            throw error;
        }
    }

    // 获取工作流日志列表
    async getWorkflowLogs(days = 7, limit = 10) {
        const appId = this.appConfig.APP_ID;
        const baseUrl = this.globalConfig.DIFY_BASE_URL;
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const params = new URLSearchParams({
            page: '1',
            limit: limit.toString(),
            created_at__after: startDate.toISOString(),
            created_at__before: endDate.toISOString()
        });

        const url = `${baseUrl}/console/api/apps/${appId}/workflow-app-logs?${params}`;
        const response = await this.makeRequest(url);
        return response.data;
    }

    // 获取工作流运行详情
    async getWorkflowRunDetail(runId) {
        const appId = this.appConfig.APP_ID;
        const baseUrl = this.globalConfig.DIFY_BASE_URL;
        
        const url = `${baseUrl}/console/api/apps/${appId}/workflow-runs/${runId}`;
        const response = await this.makeRequest(url);
        return response.data;
    }

    // 获取节点执行详情
    async getNodeExecutions(runId) {
        const appId = this.appConfig.APP_ID;
        const baseUrl = this.globalConfig.DIFY_BASE_URL;
        
        const url = `${baseUrl}/console/api/apps/${appId}/workflow-runs/${runId}/node-executions`;
        const response = await this.makeRequest(url);
        return response.data;
    }

    // 从工作流运行中提取输入数据
    extractInputsFromRun(runData) {
        const inputs = {};
        
        // 从graph.nodes中找到start节点的variables
        const startNode = runData.graph?.nodes?.find(n => n.data?.type === 'start');
        if (startNode?.data?.variables) {
            for (const variable of startNode.data.variables) {
                inputs[variable.variable] = null;
            }
        }

        // 从inputs字段中获取实际值
        if (runData.inputs) {
            Object.assign(inputs, runData.inputs);
        }

        return inputs;
    }

    // 从节点执行中提取输出数据
    extractOutputsFromExecutions(executions) {
        const outputs = {};
        
        // 找到end节点的输出
        const endExecution = executions.find(exec => exec.node_type === 'end');
        if (endExecution?.outputs) {
            Object.assign(outputs, endExecution.outputs);
        }

        return outputs;
    }

    // 创建测试数据目录
    createTestDataDir(testIndex) {
        const testDir = path.join(this.testInputsDir, testIndex.toString());
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        return testDir;
    }

    // 保存测试数据
    saveTestData(testDir, inputs, outputs, metadata) {
        // 保存输入数据
        for (const [key, value] of Object.entries(inputs)) {
            // 过滤掉sys.开头的参数
            if (key.startsWith('sys.')) {
                continue;
            }
            
            if (value !== null && value !== undefined) {
                const filePath = path.join(testDir, `${key}.txt`);
                fs.writeFileSync(filePath, String(value), 'utf-8');
            }
        }

        // 保存输出数据
        if (outputs && Object.keys(outputs).length > 0) {
            const outputsDir = path.join(this.appPath, 'test', 'outputs');
            if (!fs.existsSync(outputsDir)) {
                fs.mkdirSync(outputsDir, { recursive: true });
            }
            
            for (const [key, value] of Object.entries(outputs)) {
                // 过滤掉sys.开头的参数
                if (key.startsWith('sys.')) {
                    continue;
                }
                
                if (value !== null && value !== undefined) {
                    const testIndex = path.basename(testDir);
                    const filePath = path.join(outputsDir, `${testIndex}_${key}.txt`);
                    fs.writeFileSync(filePath, String(value), 'utf-8');
                }
            }
        }

        // 注意：不再保存metadata.json文件
        console.log(`📝 已过滤掉metadata.json和sys.开头的参数`);
    }

    // 主提取方法
    async extractTestData(maxTests = 5, days = 7) {
        console.log('🔍 开始从Dify日志中提取测试数据...');
        
        try {
            // 1. 获取日志列表
            console.log('📋 获取工作流日志列表...');
            const logsResponse = await this.getWorkflowLogs(days, maxTests * 2); // 获取更多日志，因为可能有些失败
            const logs = logsResponse.data || [];
            
            if (logs.length === 0) {
                console.log('❌ 未找到任何工作流日志');
                return;
            }

            console.log(`✅ 找到 ${logs.length} 条日志记录`);

            // 2. 处理每个日志
            let successCount = 0;
            for (let i = 0; i < Math.min(logs.length, maxTests); i++) {
                const log = logs[i];
                const runId = log.workflow_run?.id;
                
                if (!runId) {
                    console.log(`⚠️  跳过日志 ${i + 1}: 缺少run_id`);
                    continue;
                }

                console.log(`\n📊 处理日志 ${i + 1}/${Math.min(logs.length, maxTests)}: ${runId}`);

                try {
                    // 获取运行详情
                    const runDetail = await this.getWorkflowRunDetail(runId);
                    
                    // 获取节点执行详情
                    const executions = await this.getNodeExecutions(runId);
                    
                    // 提取输入和输出
                    const inputs = this.extractInputsFromRun(runDetail);
                    const outputs = this.extractOutputsFromExecutions(executions.data || []);
                    
                    // 创建测试数据目录
                    const testIndex = successCount + 1;
                    const testDir = this.createTestDataDir(testIndex);
                    
                    // 保存测试数据
                    const metadata = {
                        runId,
                        status: log.workflow_run?.status,
                        createdAt: log.workflow_run?.created_at,
                        elapsedTime: log.workflow_run?.elapsed_time,
                        totalTokens: log.workflow_run?.total_tokens
                    };
                    
                    this.saveTestData(testDir, inputs, outputs, metadata);
                    
                    console.log(`✅ 成功提取测试数据 ${testIndex}:`);
                    console.log(`   输入参数: ${Object.keys(inputs).join(', ')}`);
                    console.log(`   输出参数: ${Object.keys(outputs).join(', ')}`);
                    
                    successCount++;
                    
                    // 避免请求过于频繁
                    if (i < Math.min(logs.length, maxTests) - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                } catch (error) {
                    console.log(`❌ 处理日志 ${i + 1} 失败: ${error.message}`);
                }
            }

            console.log(`\n🎉 提取完成！成功提取了 ${successCount} 个测试用例`);
            console.log(`📁 测试数据保存在: ${this.testInputsDir}`);
            
        } catch (error) {
            console.error('❌ 提取测试数据失败:', error.message);
            throw error;
        }
    }
}

module.exports = DifyTestDataExtractor; 