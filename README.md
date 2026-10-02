# struggle-songlist-hub

多主播共用歌单平台的开发仓库，基于 SvelteKit、Svelte 和 Supabase。目标为 **一个 Vercel 项目 + 一个 Supabase 项目 + 同域名下不同主播路径**，统一更新程序，每位主播拥有独立歌曲、愿望单、页面配置和后台授权。

**当前阶段：代码复制完成，尚未实现多主播隔离。** 2026 年 10 月 3 日从 [struggle-songlist-qk](https://github.com/struggle0929/struggle-songlist-qk) 的 `91f58931ca4863765e94c3be0e2b30be8ec204eb` 导入代码及其 7 个提交。本次只更改项目名称和文档，`src/`、`static/`、`scripts/`、`supabase/` 与来源提交一致。

## 域名与目标入口

预计使用 `xs0929.cn`，以主播稳定英文标识作为路径：

| 入口       | 目标地址（尚未实现）                |
| ---------- | ----------------------------------- |
| 歌单目录   | `https://xs0929.cn/`                |
| Siro0 歌单 | `https://xs0929.cn/siro0`           |
| 薰薰兔歌单 | `https://xs0929.cn/xunxuntu`        |
| 主播后台   | `https://xs0929.cn/siro0/admin`     |
| 统一登录   | `https://xs0929.cn/admin/login`     |
| 平台管理   | `https://xs0929.cn/admin/streamers` |

`https://主播名称/xs0929.cn` 会把主播名称当作主机名，不是预期的地址。路径方案为 `https://xs0929.cn/主播标识`；子域名方案为 `https://主播标识.xs0929.cn`。本仓库按本次指定的路径方案规划，子域名识别留作可选扩展。

当前实际入口仍为前台 `/`、登录 `/admin/login`、后台 `/admin`，没有 `/siro0` 等主播路由。

## 保留功能

- 搜索、语言与标签筛选、排序、状态展示、点击复制、筛选内随机选歌。
- 手机布局与字体适配、手机随机不跳转、愿望单直达、置顶置底。
- 后台添加、编辑、删除、批量标签、已有标签选择、状态搜索与导入次序排序。
- 网易云、酷狗、QQ 音乐单曲及公开歌单分享链接识别、预览、选择导入，不下载音频。
- 愿望单提交、处理及请求限流。
- 首页标题、导航小标题与副标题、Bilibili 地址、头像、背景及 0～40px 模糊度。
- 导航图标、favicon、静态与动态鼠标指针、热点设置和自动回退。
- JSON 备份与恢复，包括歌曲、愿望单、页面配置及引用素材，不包含管理员账号。
- 本地只读演示与现有回归测试脚本。

## 当前权限与数据库边界

当前会话只记录管理员状态，没有用户 ID 和主播授权；任何可通过当前 Supabase Auth 登录的账号均可管理整个歌单。歌曲、愿望单没有主播归属，页面设置为全局配置，重置和恢复覆盖整库业务数据。

当前版本只适合单主播基线验证。不要将多个主播备份依次恢复到同一数据库，也不要在 Siro0 正式项目执行初始化、重置或恢复来试验多主播。全部隔离完成并验证后再迁移。

完整修改清单见 [多主播改造计划](MULTI_TENANT_PLAN.md)，部署与迁移顺序见 [部署说明](DEPLOYMENT.md)，本次实际修改和来源历史见 [更新日志](更新日志.md)。

## 本地开发

使用 Node.js 20.19+ 或 22.12+，本次初始化环境为 Node.js 22.20.0。

```powershell
Set-Location D:\Github\struggle-songlist-hub
npm ci
Copy-Item .env.example .env
npm run dev -- --host 127.0.0.1 --port 5173
```

首次复制 `.env` 后填写配置，已有 `.env` 时不要覆盖。源仓库的 `.env`、依赖目录、缓存及云平台绑定未复制。

没有测试数据库时，可在本地 `.env` 设置：

```dotenv
PUBLIC_SUPABASE_URL=https://example.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=local-demo-publishable-key
SUPABASE_SECRET_KEY=local-demo-secret-key
AUTH_SECRET=local-demo-only-replace-before-real-use
LOCAL_DEMO=true
```

演示仅在开发服务器生效，使用六首示例歌曲并阻止提交和登录。生产构建不启用演示；后台写操作须使用独立测试数据库或本地 Supabase。

## 环境变量

| 变量                                              | 用途                                           |
| ------------------------------------------------- | ---------------------------------------------- |
| `PUBLIC_SUPABASE_URL`                             | Supabase 项目 URL                              |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY`                 | 可公开的 publishable key                       |
| `SUPABASE_SECRET_KEY`                             | 仅服务端使用的 secret key                      |
| `AUTH_SECRET`                                     | 管理员会话签名随机串，真实环境建议至少 32 字节 |
| `LOCAL_DEMO`                                      | 开发服务器只读演示                             |
| `PUBLIC_SITE_TITLE` / `PUBLIC_SITE_SUBTITLE`      | 部署默认标题与导航副标题                       |
| `PUBLIC_SITE_DESCRIPTION` / `PUBLIC_SITE_TAGLINE` | 部署网页描述与首页说明                         |
| `PUBLIC_SITE_ICON`                                | 部署默认图标                                   |
| `PUBLIC_CUSTOM_CURSORS` / `PUBLIC_CURSOR_*`       | 可选部署默认动态指针                           |

完整示例见 [.env.example](.env.example)。当前品牌变量作用于整个部署；未来只作为平台默认值，各主播配置按主播 ID 读取。本次不新增尚未生效的主播环境变量。

真实环境生成会话密钥：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## 常用脚本

| 命令                                      | 用途                           |
| ----------------------------------------- | ------------------------------ |
| `npm run dev`                             | 开发服务器                     |
| `npm run check`                           | TypeScript 与 Svelte 检查      |
| `npm run build` / `npm run preview`       | 生产构建 / 构建预览            |
| `npm run test:appearance`                 | 页面外观与素材存储回归         |
| `npm run test:backup`                     | 备份恢复与素材回归             |
| `npm run test:tags`                       | 标签、批量追加及排序回归       |
| `npm run test:music-import`               | 音乐链接与解析回归             |
| `npm run db:types`                        | 生成当前 `.env` 对应数据库类型 |
| `npm run format` / `npm run format:check` | 格式化 / 格式检查              |

四项回归使用模拟数据库或请求。`scripts/test-*-ui.mjs` 浏览器脚本需额外准备 Playwright、本地服务器及测试配置，本次不新增浏览器依赖。Husky 提交钩子对暂存文件执行 Prettier。

## 统一更新与新增主播

多主播版完成后，程序更新并部署一次，所有主播同时获得更新；数据库结构变化仍须在共享项目执行一次迁移。

新增主播的目标流程为：平台管理员在后台创建歌单、配置标识、创建或选择账号、分配权限，无需新增仓库、Vercel 或 Supabase 项目。此管理流程尚未实现。

## 来源与许可证

基于 QingKong Songlist 和 `struggle-songlist-qk`，完整保留原作者声明及 [Parity Public License 7.0.0](LICENSE)。公开源码并保留通用库提交历史。原单主播库与个人歌单仓库不会自动跟随本仓库更新。
