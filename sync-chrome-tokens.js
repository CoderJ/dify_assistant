const { Level } = require('level');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

// 默认 Chrome LocalStorage LevelDB 路径（macOS）
const defaultDbPath = path.join(
  process.env.HOME,
  'Library/Application Support/Google/Chrome/Default/Local Storage/leveldb'
);

function getConfigDbPath() {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.CHROME_LEVELDB_PATH && fs.existsSync(config.CHROME_LEVELDB_PATH)) {
        return config.CHROME_LEVELDB_PATH;
      }
    } catch (e) {}
  }
  return defaultDbPath;
}

async function getDifyTokensFromChrome() {
  const chromeDbPath = getConfigDbPath();
  const tmpDbPath = path.join(__dirname, 'tmp', 'leveldb');
  const tokens = {};
  try {
    // 清理旧的临时目录
    if (fs.existsSync(tmpDbPath)) {
      await fse.remove(tmpDbPath);
    }
    await fse.copy(chromeDbPath, tmpDbPath);
    const db = new Level(tmpDbPath, { valueEncoding: 'utf8' });
    for await (const [key, value] of db.iterator()) {
      if (key.includes('cloud.dify.ai')) {
        if (key.includes('console_token')) tokens.API_TOKEN = value;
        if (key.includes('refresh_token')) tokens.API_REFRESH_TOKEN = value;
      }
    }
    await db.close();
    await fse.remove(tmpDbPath);
    // 清理控制字符
    function cleanToken(token) {
      return token.replace(/^[\x00-\x1F]+/, '');
    }
    if (tokens.API_TOKEN && tokens.API_REFRESH_TOKEN) {
      return {
        API_TOKEN: cleanToken(tokens.API_TOKEN),
        API_REFRESH_TOKEN: cleanToken(tokens.API_REFRESH_TOKEN)
      };
    } else {
      return null;
    }
  } catch (err) {
    return null;
  }
}

// 作为脚本运行时，输出 token
if (require.main === module) {
  (async () => {
    const tokens = await getDifyTokensFromChrome();
    if (tokens) {
      console.log(JSON.stringify(tokens, null, 2));
    } else {
      console.error('未能从 Chrome LevelDB 获取到有效的 Dify token');
      process.exit(1);
    }
  })();
}

// 作为模块导出
module.exports = { getDifyTokensFromChrome };