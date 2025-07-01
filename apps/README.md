# 多应用管理

这个文件夹用于管理多个Dify应用。每个应用都有独立的配置和文件夹结构。

## 应用结构

每个应用文件夹包含：
- `config.json` - 应用配置文件（包含APP_ID和TEST_API_KEY）
- `DSL/` - DSL定义文件
- `logs/` - 日志文件
- `prompts/` - 提示词文件（.md格式）
- `test/` - 测试文件
- `tmp/` - 临时文件

## 使用方法

### 1. 首次使用
```bash
npm start
```
选择"🔄 同步所有应用"，系统会自动：
- 下载所有应用的DSL配置
- 获取API Key
- 创建完整的应用结构
- 拆分LLM节点为.md文件
- 生成测试模板

### 2. 应用管理
- 运行 `npm start` 选择应用
- 选择操作：prepare、update、test、debug等
- 可以随时切换应用或重新同步

### 3. 手动创建应用
```bash
# 在apps目录下创建应用文件夹
mkdir apps/my-app-name
cd apps/my-app-name

# 创建标准结构
mkdir DSL logs prompts test tmp

# 创建配置文件
echo '{
  "APP_ID": "your-app-id",
  "TEST_API_KEY": "your-api-key"
}' > config.json

# 将DSL文件放入DSL目录
# 运行 npm start 选择应用进行初始化
```

## 配置文件说明

### 根目录 config.json（全局配置）
```json
{
  "DIFY_BASE_URL": "https://dify.votars.ai",
  "CHROME_LEVELDB_PATH": "",
  "TEST_BASE_URL": "https://dify.votars.ai"
}
```

### 应用目录 config.json（应用配置）
```json
{
  "APP_ID": "9e3fa6cb-23dc-4e2f-8739-308d9faf4557",
  "TEST_API_KEY": "app-AEwQjlofq0weeBnaVGcEauPb"
}
```

## 注意事项

- 应用文件夹命名格式：`应用名-Tag-APP_ID`
- 提示词文件使用.md格式，便于编辑
- 所有应用数据都在apps目录下，不会提交到Git
- 可以随时同步更新应用配置 