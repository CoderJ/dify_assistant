const fs = require('fs');
const path = require('path');
const { getDifyTokensFromChrome } = require('./sync-chrome-tokens');

class TokenManager {
  constructor() {
    this.TOKEN_CACHE_FILE = path.join(process.cwd(), '.token_cache.json');
    this.tokenCache = null;
    this.lastTokenHash = null;
  }

  // 获取token的哈希值，用于比较
  getTokenHash(token) {
    if (!token) return null;
    return require('crypto').createHash('md5').update(token).digest('hex');
  }

  // 获取token（带缓存）
  async getToken() {
    if (this.tokenCache) return this.tokenCache;
    
    if (fs.existsSync(this.TOKEN_CACHE_FILE)) {
      try {
        this.tokenCache = JSON.parse(fs.readFileSync(this.TOKEN_CACHE_FILE, 'utf-8'));
        if (this.tokenCache && this.tokenCache.API_TOKEN) {
          this.lastTokenHash = this.getTokenHash(this.tokenCache.API_TOKEN);
          return this.tokenCache;
        }
      } catch (e) {}
    }
    
    return await this.refreshToken();
  }

  // 刷新token
  async refreshToken() {
    console.log('🔄 从Chrome同步最新token...');
    const newTokens = await getDifyTokensFromChrome();
    
    if (newTokens && newTokens.API_TOKEN) {
      const newTokenHash = this.getTokenHash(newTokens.API_TOKEN);
      
      // 检查token是否真的变了
      if (this.lastTokenHash && this.lastTokenHash === newTokenHash) {
        console.log('⚠️  Token未发生变化，请检查浏览器登录状态');
        console.log('💡 建议：请在浏览器中刷新Dify页面，确保登录状态正常');
        return null;
      }
      
      // 保存新token
      this.tokenCache = newTokens;
      this.lastTokenHash = newTokenHash;
      fs.writeFileSync(this.TOKEN_CACHE_FILE, JSON.stringify(newTokens));
      console.log('✅ Token已更新');
      return newTokens;
    } else {
      console.log('❌ 无法从Chrome获取有效token');
      return null;
    }
  }

  // 带重试的请求函数
  async requestWithTokenRetry(axiosConfig, maxRetries = 2) {
    let tokens = await this.getToken();
    if (!tokens || !tokens.API_TOKEN) {
      throw new Error('未能获取到有效的Dify token，请确保已登录Dify并在浏览器中保持登录状态');
    }

    axiosConfig.headers = axiosConfig.headers || {};
    axiosConfig.headers['Authorization'] = `Bearer ${tokens.API_TOKEN}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await require('axios')(axiosConfig);
      } catch (err) {
        if (err.response && err.response.status === 401 && attempt < maxRetries) {
          console.log(`🔄 Token已过期，尝试刷新... (第${attempt + 1}次重试)`);
          
          // 清除缓存，强制重新获取
          this.tokenCache = null;
          this.lastTokenHash = null;
          
          const newTokens = await this.refreshToken();
          if (newTokens && newTokens.API_TOKEN) {
            axiosConfig.headers['Authorization'] = `Bearer ${newTokens.API_TOKEN}`;
            continue; // 重试请求
          } else {
            throw new Error('Token刷新失败，请检查浏览器登录状态');
          }
        }
        throw err; // 其他错误或重试次数用完
      }
    }
  }

  // 清除token缓存
  clearCache() {
    this.tokenCache = null;
    this.lastTokenHash = null;
    if (fs.existsSync(this.TOKEN_CACHE_FILE)) {
      fs.unlinkSync(this.TOKEN_CACHE_FILE);
    }
  }
}

module.exports = TokenManager; 