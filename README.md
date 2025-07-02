# Dify Assistant

一个用于高效管理、开发和测试多个 Dify 应用的工具，支持多应用管理、本地 DSL 文件的导入导出、llm节点拆分与合并、自动化测试等，适合团队协作和版本控制。

## 🚀 主要功能

### 多应用管理
- **一键同步所有应用**：自动从 Dify 账号下载所有应用的 DSL 配置和 API Key
- **独立应用管理**：每个应用都有独立的配置、DSL、测试文件等
- **智能文件夹命名**：`应用名-Tag-APP_ID` 格式，避免重名冲突
- **应用切换**：在多个应用间快速切换，进行开发、测试、调试

### DSL 管理
- **自动拆分**：将 llm 节点的 prompt_template 拆分为 Markdown 文件，便于编辑
- **自动合并**：编辑完成后自动合并回主 DSL 文件
- **一键发布**：自动导入并发布到 Dify 应用

### 测试功能
- **批量测试**：支持批量自动化测试，验证 prompt 和工作流
- **交互式测试**：命令行对话测试，实时验证应用效果
- **Workflow 测试**：专门针对 workflow 模式的测试
- **网页调试**：提供 Web 界面进行应用调试

## 📁 项目结构

```
dify_assistant/
├── apps/                    # 多应用管理目录
│   ├── README.md           # 应用管理说明
│   ├── 应用名-Tag-ID/      # 每个应用的独立目录
│   │   ├── config.json     # 应用配置（APP_ID, TEST_API_KEY）
│   │   ├── DSL/
│   │   │   └── main.yml    # 应用 DSL 文件
│   │   ├── prompts/        # 拆分的 prompt 文件（.md格式）
│   │   ├── test/           # 测试文件
│   │   ├── logs/           # 日志文件
│   │   └── tmp/            # 临时文件
│   └── ...
├── config.json             # 全局配置（DIFY_BASE_URL等）
├── start.js                # 多应用管理器入口
├── app-manager.js          # 应用管理核心逻辑
├── cli.js                  # DSL 导入导出工具
├── test.js                 # 测试工具
├── debug-server.js         # 网页调试服务器
└── package.json            # 项目配置
```

## ⚙️ 配置方法

### 1. 全局配置（config.json）
```json
{
  "DIFY_BASE_URL": "https://cloud.dify.ai",
  "CHROME_LEVELDB_PATH": "",
  "TEST_BASE_URL" : "https://api.dify.ai",
}
```

### 2. 应用配置（apps/应用名/config.json）
```json
{
  "APP_ID": "your-app-id",
  "TEST_API_KEY": "your-api-key"
}
```

## 🎯 使用方法

### 1. 首次使用
```bash
npm start
```
选择"🔄 同步所有应用"，系统会自动：
- 下载所有应用的 DSL 配置
- 获取每个应用的 API Key
- 创建完整的应用结构
- 拆分 LLM 节点为 .md 文件
- 生成测试模板

### 2. 日常使用
```bash
npm start
```
- 先选择应用环境（TEST/PRODUCTION/无标签）
- 再选择该环境下的具体应用
- 选择操作：prepare、update、test、debug等
- 可以随时切换应用或重新同步

### 3. 常用命令

#### 初始化本地开发环境（prepare）
```bash
# 在选中的应用目录下执行
npm run prepare
```
- 导出 DSL/main.yml
- 拆分 prompts/ 下的 .md 文件
- 生成 test/inputs.json 和测试模板

#### 合并并发布（update）
```bash
npm run update
```
- 合并 prompts/ 下的所有 .md 文件
- 生成新的 main.yml
- 导入并发布到 Dify

#### 批量测试（test）
```bash
npm run test
```
- 读取 test/testcases.json
- 自动调用 Dify API 进行批量验证

#### 交互式测试（test:chat）
```bash
npm run test:chat
```
- 支持实时对话测试
- 自动带上 test/inputs.json 的变量

#### Workflow 测试（test:workflow）
```bash
npm run test:workflow
```
- 专门针对 workflow 模式的测试
- 使用 test/inputs.json 中的变量

#### 网页调试（debug）
```bash
npm run debug
```
- 启动 Web 调试服务器
- 提供可视化调试界面

## 🔧 开发流程

### 1. 应用开发
1. 运行 `npm start` 选择应用
2. 选择 "prepare" 导出 DSL 和拆分 prompt
3. 编辑 `prompts/` 下的 .md 文件
4. 选择 "update" 合并并发布

### 2. 应用测试
1. 运行 `npm start` 选择应用
2. 选择 "test" 进行批量测试
3. 或选择 "test:chat" 进行交互式测试
4. 或选择 "debug" 启动 Web 调试

### 3. 多应用管理
1. 运行 `npm start` 选择 "🔄 同步所有应用"
2. 先选择应用环境，再选择该环境下的具体应用
3. 选择 "切换应用" 在不同应用间切换（同样按环境分组）

## 📝 文件说明

### Prompt 文件（.md格式）
- `prompts/节点名.system.md` - 系统提示词
- `prompts/节点名.user.md` - 用户提示词
- `prompts/节点名.assistant.md` - 助手提示词
- `prompts/节点名.json` - 节点其他参数

### 测试文件
- `test/inputs.json` - 必填变量模板
- `test/inputs/1/` - 变量输入文件
- `test/testcases.json` - 批量测试用例

## 🎉 特性优势

- **多应用管理**：支持同时管理多个 Dify 应用
- **环境分组**：按 TEST/PRODUCTION 标签分组管理应用
- **智能同步**：一键同步所有应用配置和 API Key
- **Markdown 编辑**：prompt 文件使用 .md 格式，便于编辑
- **独立配置**：每个应用有独立的配置和测试环境
- **自动化测试**：支持批量测试和交互式测试
- **版本控制友好**：应用数据不提交到 Git，保证安全性

## 🔒 安全性

- `apps/` 目录下的应用数据不会提交到 Git
- 每个应用有独立的 API Key 配置
- 支持多环境配置管理
- **生产环境保护**：带有 `PRODUCTION` 标签的应用禁止 update 操作，防止误操作

## 🛡️ 生产环境保护

系统对带有 `PRODUCTION` 标签的应用实施特殊保护：

### 标签识别
- **TEST 标签** 🟢: 允许所有操作
- **PRODUCTION 标签** 🔴: 禁止 update 操作

### 保护机制
1. **用户界面保护**: 应用选择时显示标签，update 操作时检查
2. **命令行保护**: 直接执行 update 命令时检查
3. **双重验证**: 确保生产环境安全

### 使用示例
```
🎯 当前应用: MyApp (workflow)
🔴 应用标签: PRODUCTION
📁 路径: /path/to/apps/MyApp-PRODUCTION-12345678

❌ 安全限制：检测到PRODUCTION标签的应用，不允许执行update操作！
```

详细说明请参考 [生产环境保护机制](docs/production-protection.md)

## 📄 License

MIT 