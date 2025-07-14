# Dify测试数据提取工具

这个工具可以帮助你从Dify的工作流日志中提取真实的测试数据，用于本地DSL测试。

## 功能特点

- 🔍 自动从Dify API获取最近的工作流执行日志
- 🔎 支持关键词搜索特定日志
- 📊 提取真实的输入数据和期望输出
- 📁 自动创建结构化的测试数据目录
- 🔑 使用现有的Chrome token获取机制
- ⚡ 支持批量提取多个测试用例
- 🎯 集成到主程序中，方便使用

## 使用方法

### 方法一：通过主程序（推荐）

1. 运行主程序：
   ```bash
   npm start
   ```

2. 选择一个workflow类型的应用

3. 在菜单中选择 "从Dify日志提取测试数据"

4. 按提示输入要提取的测试用例数量和天数范围

### 方法二：直接使用CLI工具

```bash
# 交互式选择应用
node src/cli/extract-test-data.js

# 指定应用路径
node src/cli/extract-test-data.js --app-path ./apps/my-app

# 指定参数
node src/cli/extract-test-data.js --max-tests 10 --days 3

# 搜索特定关键词
node src/cli/extract-test-data.js --keyword "错误" --max-tests 5

# 组合使用
node src/cli/extract-test-data.js --keyword "summary" --max-tests 10 --days 7
```

## 工作原理

1. **获取日志列表**：调用Dify API获取最近的工作流执行日志（支持关键词搜索）
2. **提取运行详情**：获取每个工作流运行的详细信息和输入数据
3. **提取节点执行**：获取每个节点的执行结果和输出数据
4. **构建测试数据**：将输入和输出数据保存到对应的目录结构中

## 输出结构

提取的测试数据会保存在以下结构中：

```
apps/your-app/
├── test/
│   ├── inputs/
│   │   ├── 1/                    # 测试用例1
│   │   │   └── transcription.txt # 输入参数
│   │   ├── 2/                    # 测试用例2
│   │   └── ...
│   └── outputs/
│       ├── 1_text.txt            # 输出结果
│       └── ...
```

### 输入数据

- 每个输入参数保存为对应的 `.txt` 文件
- 文件名与 `inputs.json` 中定义的变量名一致
- 内容为实际的工作流输入数据

### 输出数据

- 每个输出参数保存为对应的 `.txt` 文件
- 文件名格式：`{测试用例编号}_{参数名}.txt`
- 内容为实际的工作流输出结果

### 数据过滤

提取过程中会自动过滤以下内容：
- `metadata.json` 文件（不再生成）
- `sys.` 开头的系统参数（如 `sys.user_id`, `sys.app_id` 等）

这样可以确保测试数据更加简洁，只包含业务相关的输入输出参数。

## 使用提取的测试数据

提取完成后，你可以使用现有的测试功能来验证DSL：

```bash
# 测试单个输入集
npm run test:workflow -- --inputs 1

# 测试所有输入集
npm run test:workflow -- --inputs all
```

## 注意事项

1. **前置条件**：
   - 需要先运行 `npm start` 同步应用
   - 需要先运行 `npm run prepare` 初始化应用
   - 需要已登录 cloud.dify.ai 并配置了 Chrome LevelDB 路径

2. **权限要求**：
   - 需要应用的管理员权限
   - 需要能够访问工作流日志API

3. **数据限制**：
   - 最多提取20个测试用例
   - 最多获取最近30天的日志
   - 建议提取5-10个测试用例以获得最佳效果

4. **网络要求**：
   - 需要能够访问Dify API
   - 提取过程中会有多个API请求

5. **数据过滤**：
   - 自动过滤掉 `metadata.json` 文件
   - 自动过滤掉 `sys.` 开头的系统参数
   - 只保留业务相关的输入输出数据

6. **关键词搜索**：
   - 支持搜索特定关键词的日志
   - 帮助找到特定的测试场景
   - 提高测试数据的针对性

## 故障排除

### 常见错误

1. **"无法获取有效的Dify token"**
   - 确保已登录 cloud.dify.ai
   - 检查 Chrome LevelDB 路径配置
   - 尝试重新登录Dify

2. **"未找到任何工作流日志"**
   - 检查应用是否有最近的工作流执行记录
   - 尝试增加天数范围
   - 确认应用ID正确

3. **"应用配置文件不存在"**
   - 先运行 `npm run prepare` 初始化应用
   - 检查应用路径是否正确

4. **"输入参数结构文件不存在"**
   - 确保应用是workflow类型
   - 先运行 `npm run prepare` 生成inputs.json

### 调试技巧

1. 检查日志文件：
   ```bash
   tail -f apps/your-app/logs/test-*.log
   ```

2. 验证API连接：
   ```bash
   node src/utils/sync-chrome-tokens.js
   ```

3. 手动测试API：
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        "https://your-dify-url/console/api/apps/YOUR_APP_ID/workflow-app-logs"
   ```

## 更新日志

- **v1.1.0**: 新增关键词搜索功能
  - 支持通过关键词搜索特定日志
  - 提高测试数据的针对性
  - 支持CLI和主程序两种使用方式

- **v1.0.0**: 初始版本，支持基本的测试数据提取功能
  - 集成到主程序菜单中
  - 支持CLI独立运行
  - 自动处理token认证
  - 智能提取输入输出数据 