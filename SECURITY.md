# 歌单安全防护说明

## 2026-10-10 代码加固

本次只修改应用代码，不操作正式数据库、不修改域名。完成本地自检后提交推送，由 Vercel 的 Git 集成更新部署。现有共享数据库的 `consume_request_rate_limit` RPC 可直接复用，不需要新增迁移或环境变量。

- 登录限流使用数据库原子计数，所有实例、主播路径共享。10 分钟内同 IP 最多 30 次、同 IP 与账号组合最多 10 次、同账号所有 IP 合计最多 50 次尝试（成功和失败都计数）；触发后返回 429 和 Retry-After。邮箱统一小写，计数键保存哈希，不保存明文邮箱或 IP。限流服务不可用时拒绝登录并提示重试，已登录会话不受登录次数限制。
- 公开目录、主播首页及对应数据请求，在查询数据库之前按 IP 每实例每分钟最多 240 次。静态资源和后台页面不计入；计数表最多 10000 项，不会被随机 IP 无限制撑大。这是应用实例内的轻量防护，不是跨实例全局限流，不能替代 Vercel 边缘防火墙或 DDoS 防护。
- 保留原有愿望提交和解析的共享数据库限流。所有私人页面继续 `private, no-store`，本次未增加可能使歌单更新延迟的共享 HTML 缓存。
- 添加禁止 MIME 嗅探、禁止 iframe 嵌入、限制跨站 Referer，以及禁用相机/麦克风/定位的响应头。生产 CSP 禁止任意第三方脚本、插件对象和跨站嵌入；SvelteKit 为合法脚本生成 nonce，启动主题脚本同步使用 nonce。图片、样式、Supabase 上传下载和现有主题功能保留；开发模式允许 Vite 工作。
- 网易云查询加入每次网络请求 30 秒超时，保留单曲、歌单和批量导入逻辑。
- 更新并固定 SvelteKit 2.70.3、Svelte 5.57.2、Vite 8.3.4、Svelte Vite 插件 7.3.1、网易云 API 4.41.1、Supabase JS 2.117.3；锁文件更新兼容的间接依赖。使用 scoped override 将 SvelteKit 的 cookie 升至 0.7.2，并将 basic-ftp 升至 6.2.3，不跨到 SvelteKit 3。

## 剩余告警与边界

`npm audit` 与 `npm audit --omit=dev` 均剩 2 个 high 包告警，0 个 critical；两个包为 node-forge 和引用它的网易云 API，根因是同一个 RSA PKCS#1 v1.5 签名验证问题，目前审计显示无修复版本。已核对网易云 API 的 util/crypto.js：使用固定公钥解析及 encrypt('NONE')，未调用该告警涉及的签名 verify。保留导入功能，没有声称依赖风险归零。上游修复后仍应升级并复测。

GitHub Advisory：https://github.com/advisories/GHSA-86w9-cpqp-85rv

应用登录限流无法覆盖绕过网站直接访问 Supabase Auth 的请求；其防护依赖 Supabase Auth 自身的限流设置。管理员强密码、关闭公开注册、平台账号双重验证、数据库函数授权收紧、云端日志和流量监控仍是后台配置工作，本次未自动修改。

## 验证

- `npm run check`：类型和 Svelte 检查。
- `npm run test:security`：计数边界、过期、IP 隔离、内存上限及响应头。
- `npm run test:tenant-http`：本地 PostgreSQL/Auth/Storage 替身验证真实页面和接口，包括跨主播共享登录限流、429、哈希键、后台会话保留。
- 原有 appearance、backup、tags、music-import、tenant-sql、tenant-context 回归。
- `npm run test:tenant-ui`：开发环境浏览器回归。
- PowerShell 执行 `$env:SECURITY_PRODUCTION_TEST='true'; npm run test:tenant-ui`：自动用隔离本地后台构建生产包，验证真实 CSP、登录、配置、素材上传、备份恢复、授权撤销、账号删除及桌面/手机布局。测试结束后可 `Remove-Item Env:SECURITY_PRODUCTION_TEST`。

测试只使用隔离本地数据，不进行线上压力测试。公开页限流不保证抵御分布式攻击，阈值需结合上线后的实际访问量调整。

本次结果：类型检查 0 错误、0 警告，生产构建成功，功能回归 34 项、SQL 15 项、上下文 5 项、HTTP 14 项通过；开发模式和生产模式浏览器各 15 项通过，生产 CSP 的 script-src 与实际内联脚本 nonce 已核对。限流边界/容量测试及修改文件格式检查通过。
