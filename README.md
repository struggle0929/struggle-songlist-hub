# struggle-songlist-qk

通用单主播歌单。支持点击复制、筛选条件内随机选歌、手机端随机不跳转、愿望单直达、置顶置底、后台状态搜索、网易云/酷狗/QQ 音乐导入及移动端字体修复。

默认不含主播个人素材，使用系统鼠标指针。导航标题、副标题和网页描述通过部署环境变量配置；首页标题、头像、背景、Bilibili 地址、页面图标及静态/动态鼠标指针可在后台设置。多位主播共享代码，每位主播使用独立部署与独立数据库。

详细步骤见 [多主播部署指南](DEPLOYMENT.md)，配置示例见 [.env.example](.env.example)。

功能更新记录见 [更新日志](更新日志.md)。

## 歌曲软件导入

后台“添加歌曲 → 歌曲软件导入”支持网易云、酷狗和 QQ 音乐的单曲与公开歌单分享链接，包括官方分享短链接。粘贴链接或带链接的分享文字后点击“解析链接”，自动识别平台与单曲/歌单类型，无需手动选择平台。

解析后在统一预览中核对歌曲名、原唱、语言、状态及标签，勾选需要的歌曲并确认导入。关闭预览后保留原分享内容，方便再次解析。统一入口不接受无法确定平台的纯数字 ID，请复制官方分享链接。

单次最多导入 5000 首歌曲，仅读取歌曲信息，不下载音频。私密歌单、失效链接或平台访问限制可能导致解析失败；导入前请核对预览数量，酷狗可读取范围取决于官方分享页面返回的列表。QQ 音乐分批读取时会检查数量，避免静默导入不完整歌单。

## 后台标签与排序

- 手动添加、编辑歌曲及批量追加标签时，可以勾选已有标签，也可以输入新标签，支持中英文逗号分隔并自动去重。
- 歌曲列表勾选多首歌曲后，可统一追加标签；支持本页全选及全选过滤结果，保留原有标签，每首最多 8 个。
- 三个平台的单曲和歌单导入预览支持统一追加标签，仅应用于勾选导入的歌曲，并保留每首歌曲单独填写的标签。
- 后台支持默认排序、歌曲名排序、导入次序排序及升降序切换。导入次序降序可优先查看最近入库的歌曲。
- 编辑歌曲保存后保留表单内容，收起并重新展开无需刷新。

2026 年 10 月 2 日的标签、排序及音乐导入更新无需执行 SQL 迁移，已有站点更新代码并重新部署即可。首次启用此前的页面外观或数据库恢复功能时，仍需按部署指南执行对应迁移。

基于 QingKong Songlist，保留原作者声明及 LICENSE。

SvelteKit + Supabase 搭建的单主播歌单站。观众查歌、筛选、提交愿望单；主播后台管理曲库、导入网易云、酷狗和 QQ 音乐歌曲、处理请求。

前台 `/` · 后台登录 `/admin/login` · 后台 `/admin`

## 快速开始

```bash
npm install
cp .env.example .env   # 填入下方环境变量
# 在 Supabase SQL Editor 执行 supabase/schema.sql
npm run dev
```

要求 Node 20.19+ 或 22.12+（Vite 8）。

## 环境变量

| 变量                              | 说明                                                     |
| --------------------------------- | -------------------------------------------------------- |
| `PUBLIC_SUPABASE_URL`             | Supabase 项目 URL                                        |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key，格式为 `sb_publishable_...`             |
| `SUPABASE_SECRET_KEY`             | Secret key，格式为 `sb_secret_...`，仅服务端使用         |
| `AUTH_SECRET`                     | 用于签名 admin session cookie 的随机串，建议至少 32 字节 |

生成 `AUTH_SECRET` 示例：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

把输出结果填入本地 `.env` 和部署平台环境变量即可。

管理员登录走 Supabase Auth。**任何能在 Supabase 登录的账号都能进后台**，请只在 Auth 中创建受信任的账号。

## 脚本

| 命令                        | 作用                                       |
| --------------------------- | ------------------------------------------ |
| `npm run dev`               | 启动开发服务器                             |
| `npm run build`             | 生产构建                                   |
| `npm run preview`           | 预览生产构建                               |
| `npm run check`             | 类型 + Svelte 检查                         |
| `npm run test:appearance`   | 页面图标与鼠标指针存储测试                 |
| `npm run test:backup`       | 数据备份、恢复及素材切换测试               |
| `npm run test:tags`         | 标签解析、批量追加、导入与排序回归测试     |
| `npm run test:music-import` | 音乐平台识别、分享链接与解析回归测试       |
| `npm run db:types`          | 从 `.env` 对应 Supabase 项目生成数据库类型 |
| `npm run format`            | Prettier 格式化整个仓库                    |
| `npm run format:check`      | 只检查格式不写入                           |

提交时 husky pre-commit 会自动跑 `lint-staged`，对 staged 文件执行 `prettier --write`。`npm install` 会自动激活 hook。

首次生成数据库类型前，先执行 `npx supabase login` 登录 Supabase CLI。之后 `npm run db:types` 会从 `.env` 的 `PUBLIC_SUPABASE_URL` 自动提取 project ref，并更新 `src/lib/server/database.types.ts`。

## 随时进行本地测试

在项目目录配置好 `.env` 后执行 `npm run dev -- --host 127.0.0.1 --port 5173`，打开终端显示的本地地址（通常为 `http://127.0.0.1:5173`）。终端必须保持运行；退出终端或重启电脑后，重新执行命令即可恢复测试地址。

仅预览前台时可按部署指南启用 `LOCAL_DEMO=true`。需要测试后台添加、编辑、导入及恢复时，使用独立测试数据库并设置 `LOCAL_DEMO=false`；本地连接正式数据库时，后台操作也会修改正式数据。

开发缓存和自动测试缓存已分开，避免测试运行影响本地页面交互。浏览器回归脚本 `scripts/test-tags-ui.mjs` 需要另行安装 Playwright、启动本地服务，并准备含歌曲及已有标签的测试数据库；脚本会拦截并模拟所有 POST 请求。运行方式为 `node --env-file=.env scripts/test-tags-ui.mjs`。

统一音乐导入的浏览器回归脚本运行方式为 `node --env-file=.env scripts/test-music-import-ui.mjs`，同样需要 Playwright 和本地服务，使用模拟 POST 响应检查平台入口、预览、链接保留与手机布局。

## 部署

使用 `@sveltejs/adapter-auto`，Vercel / Netlify / Cloudflare Pages 等均可。部署前：

- 托管平台配置全部环境变量
- 在生产 Supabase 执行 `supabase/schema.sql`
- 在 Supabase Auth 中至少创建一个管理员账号

## 技术栈

SvelteKit 2 · Svelte 5 · Vite 8 · Tailwind CSS 4 · Supabase · Zod 4 · `@neteasecloudmusicapienhanced/api`

## 许可证

本项目采用 `Parity Public License 7.0.0` 授权，详见根目录 `LICENSE`。

如果你使用本软件开发、运行或分析其他软件，则相关软件也需要按照协议要求开放共享。
