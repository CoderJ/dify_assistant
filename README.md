# dify_assistant

一个用于高效管理、开发和测试 Dify 应用工作流的命令行工具，支持本地 DSL 文件的导入导出、llm节点拆分与合并、自动化测试等，适合团队协作和版本控制。

## 主要功能
- 一键导出 Dify 应用 DSL（main.yml），并自动拆分所有 llm 节点为 Markdown+JSON 文件，便于本地编辑和审阅
- 自动分析必填变量，生成测试输入模板（test/inputs.json）
- 支持本地编辑 llm 节点后自动合并回主 DSL 文件
- 一键导入并自动发布到 Dify 应用
- 支持批量自动化测试和命令行对话测试，便于 prompt/工作流回归验证
- 多环境配置支持（如 config.json、config.test.json）

## 目录结构
```
├── cli.js              # 主命令行入口，支持 export/update
├── test.js             # 测试入口，支持批量和交互式测试
├── config.json         # 主环境配置（API Token、AppId等）
├── config.test.json    # 测试环境配置（可选）
├── package.json        # npm 脚本与依赖
├── DSL/
│   └── main.yml        # Dify 应用主 DSL 文件
├── prompts/
│   ├── xxx.md          # 每个llm节点的prompt（Markdown）
│   └── xxx.json        # 每个llm节点的参数（JSON）
├── test/
│   ├── testcases.json  # 批量测试用例
│   └── inputs.json     # 必填变量输入模板
└── ...
```

## 配置方法
1. 复制 `config.json`，填写你的 Dify 地址、API Token、AppId。
2. 如需多环境，创建 `config.test.json` 并填写测试环境参数。

## 常用命令

### 1. 导出并拆分 llm 节点
```bash
npm run export
# 或
node cli.js export
```
- 自动导出 DSL/main.yml、拆分 prompts/、生成 test/inputs.json

### 2. 合并 llm 节点并导入发布
```bash
npm run update
# 或
node cli.js update
```
- 自动合并 prompts/ 下所有 llm 节点，生成新 main.yml，并导入 Dify 自动发布

### 3. 批量自动化测试
```bash
npm run test
```
- 读取 test/testcases.json 和 test/inputs.json，自动调用 Dify 应用 API 进行批量验证

### 4. 命令行对话测试
```bash
npm run test:chat
```
- 支持与 Dify 应用实时对话，自动带上 test/inputs.json 的必填变量

### 5. 多环境支持
```bash
npm run export -- --config config.test.json
npm run update -- --config config.test.json
npm run test -- --config config.test.json
npm run test:chat -- --config config.test.json
```

## 测试用例与变量输入
- `test/testcases.json`：批量测试用例，支持 completion/chat 两种类型
- `test/inputs.json`：自动生成的必填变量模板，测试时自动合并

## 适用场景
- 本地高效开发 Dify 工作流，支持多人协作、版本管理
- prompt 工程、复杂多节点工作流的可读性和可维护性提升
- 自动化回归测试，保障每次修改都能被验证

## 迭代建议
- 可扩展支持更多 Dify API、更多测试类型
- 可集成 CI/CD 流程，实现自动化部署与测试
- 支持更丰富的用例管理、结果比对与报告输出

---
如有建议或需求，欢迎 issue 或 PR！

## License
MIT 