# 生产环境保护机制

## 概述

为了防止误操作影响生产环境，系统对带有 `PRODUCTION` 标签的应用实施了特殊保护机制。

## 标签识别

系统通过应用文件夹名称来识别应用标签：

- **TEST 标签**: 文件夹名包含 `-TEST-` 
  - 示例: `MyApp-TEST-12345678-abcdef12`
  - 图标: 🟢
  - 状态: 允许所有操作

- **PRODUCTION 标签**: 文件夹名包含 `-PRODUCTION-`
  - 示例: `MyApp-PRODUCTION-12345678-abcdef12`
  - 图标: 🔴
  - 状态: 禁止 update 操作

## 保护机制

### 1. 用户界面保护

在应用选择列表中，系统会显示应用标签：
```
MyApp (MyApp-TEST-12345678) - workflow 🟢TEST
MyApp (MyApp-PRODUCTION-12345678) - workflow 🔴PRODUCTION
```

### 2. Update 操作限制

当选择带有 `PRODUCTION` 标签的应用时，系统会阻止 update 操作：

```
❌ 安全限制：检测到PRODUCTION标签的应用，不允许执行update操作！
📝 应用名称: MyApp-PRODUCTION-12345678-abcdef12
🔒 为了保护生产环境，PRODUCTION标签的应用禁止update操作
💡 如需更新，请先将应用标签改为TEST，或联系管理员
```

### 3. 双重保护

保护机制在两个层面实施：

1. **用户界面层** (`src/core/start.js`): 在选择操作时检查
2. **命令行层** (`src/cli/cli.js`): 在执行 update 命令时检查

## 使用方法

### 按环境选择应用

运行 `npm start` 时，系统会先显示环境选择列表：

```
请选择应用环境：
🟢 TEST (8个应用)
🔴 PRODUCTION (2个应用)
⚪ 无标签 (1个应用)
🔄 同步所有应用
```

选择环境后，会显示该环境下的所有应用：

```
📋 TEST 环境下的应用 (8个):
请选择 TEST 环境下的应用：
MyApp1 (MyApp1-TEST-12345678) - workflow 🟢TEST
MyApp2 (MyApp2-TEST-12345678) - advanced-chat 🟢TEST
⬅️ 返回环境选择
```

### 查看应用标签

选择应用后，系统会显示应用详细信息：

```
🎯 当前应用: MyApp (workflow)
🟢 应用标签: TEST
📁 路径: /path/to/apps/MyApp-TEST-12345678
```

### 安全更新流程

如需更新生产环境应用：

1. **临时方案**: 将应用标签从 `PRODUCTION` 改为 `TEST`
   - 重命名应用文件夹
   - 执行更新操作
   - 更新完成后改回 `PRODUCTION` 标签

2. **推荐方案**: 使用测试环境
   - 在测试环境中验证更改
   - 确认无误后再更新生产环境

## 技术实现

### 核心方法

`AppManager` 类提供了以下方法：

```javascript
// 检查是否为生产环境应用
isProductionApp(appPath)

// 检查是否为测试环境应用  
isTestApp(appPath)

// 获取应用标签
getAppTag(appPath) // 返回 'PRODUCTION', 'TEST', 或 null
```

### 检查逻辑

```javascript
// 文件夹名格式: 应用名-TAG-应用ID
const appName = path.basename(appPath);
const isProduction = appName.includes('-PRODUCTION-');
const isTest = appName.includes('-TEST-');
```

## 注意事项

1. **标签命名**: 标签必须严格按照 `-PRODUCTION-` 和 `-TEST-` 格式
2. **大小写敏感**: 标签名称区分大小写
3. **位置要求**: 标签必须位于应用名和应用ID之间
4. **唯一性**: 一个应用只能有一个标签

## 故障排除

### 常见问题

1. **标签未识别**
   - 检查文件夹名称格式是否正确
   - 确认标签拼写和大小写

2. **误报保护**
   - 确认应用确实需要保护
   - 检查是否有其他安全需求

3. **绕过保护**
   - 不建议绕过保护机制
   - 如需紧急操作，请联系系统管理员

## 最佳实践

1. **环境分离**: 严格区分测试和生产环境
2. **标签管理**: 及时更新应用标签
3. **操作确认**: 在执行重要操作前仔细确认
4. **备份策略**: 定期备份生产环境配置 