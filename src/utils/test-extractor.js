#!/usr/bin/env node

const path = require('path');
const DifyTestDataExtractor = require('./extract-test-data');

async function testExtractor() {
    console.log('🧪 测试Dify测试数据提取工具...\n');

    // 测试应用路径
    const testAppPath = path.join(process.cwd(), 'apps', 'Auto Speaker-TEST-beb96860-9c85-4b81-af2e-d1cba82d26d5');
    
    try {
        console.log('📁 测试应用路径:', testAppPath);
        
        // 创建提取器实例
        const extractor = new DifyTestDataExtractor(testAppPath);
        
        console.log('✅ 提取器创建成功');
        console.log('📋 应用配置:', extractor.appConfig);
        console.log('🌐 全局配置:', extractor.globalConfig);
        console.log('📝 输入参数结构:', extractor.inputsSchema);
        
        // 测试token获取
        console.log('\n🔑 测试token获取...');
        const tokens = await extractor.getToken();
        if (tokens && tokens.API_TOKEN) {
            console.log('✅ Token获取成功');
        } else {
            console.log('❌ Token获取失败');
        }
        
        console.log('\n🎉 测试完成！');
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error('堆栈:', error.stack);
    }
}

if (require.main === module) {
    testExtractor();
}

module.exports = { testExtractor }; 