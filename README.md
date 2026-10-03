# struggle-songlist-hub

多主播共用歌单，基于 SvelteKit、Svelte 和 Supabase。**一个 Vercel 项目 + 一个 Supabase 项目 + 按主播子域名分流**，程序部署一次，所有主播共同更新。

当前版本 `0.2.0`：已实现多主播隔离、账号授权、平台创建歌单、独立页面配置和按主播备份恢复，完成本地测试。线上迁移、Vercel 绑定和 xs0929.cn DNS 尚未执行。

## 域名与入口

主播名称前置，使用稳定英文标识作为子域名，显示昵称可单独修改。

| 入口           | 正式地址示例                                    |
| -------------- | ----------------------------------------------- |
| 平台目录       | `https://xs0929.cn/`                            |
| Siro0 歌单     | `https://siro0.xs0929.cn/`                      |
| Siro0 登录     | `https://siro0.xs0929.cn/admin/login`           |
| Siro0 后台     | `https://siro0.xs0929.cn/admin`                 |
| Siro0 备份接口 | `https://siro0.xs0929.cn/admin/database/export` |
| 薰薰兔歌单     | `https://xunxuntu.xs0929.cn/`                   |
| 平台登录       | `https://xs0929.cn/admin/login`                 |
| 主播与账号管理 | `https://xs0929.cn/admin/streamers`             |

`https://siro0/xs0929.cn` 会将 siro0 当作主机名，不能作为 xs0929.cn 的子域名。正确格式为 `https://siro0.xs0929.cn`。

本地支持 `http://siro0.localhost:5173/`，同时提供 `/s/siro0` 路径入口，便于不支持 localhost 子域名的环境和 Vercel 预览测试。正式分发地址优先使用子域名。

## 立即进行本地实验

使用 Node.js 20.19+ 或 22.12+（已在 Node.js 22.20.0 验证）：

```powershell
Set-Location D:\Github\struggle-songlist-hub
npm ci
npm run dev:local
```

该脚本覆盖连接变量，启动本机内存 PostgreSQL（PGlite）及模拟 Supabase Auth/Storage 服务，不读取正式数据库的数据，不需要 .env、Docker 或云平台账号。关闭进程后实验数据全部清空，重新运行恢复初始示例。

| 本地入口           | 地址                                                                         |
| ------------------ | ---------------------------------------------------------------------------- |
| 平台目录           | `http://127.0.0.1:5173/`                                                     |
| 平台管理登录       | `http://127.0.0.1:5173/admin/login`                                          |
| 平台主播与账号管理 | `http://127.0.0.1:5173/admin/streamers`                                      |
| Siro0 歌单         | `http://siro0.localhost:5173/` 或 `http://127.0.0.1:5173/s/siro0`            |
| Siro0 后台         | `http://siro0.localhost:5173/admin` 或 `http://127.0.0.1:5173/s/siro0/admin` |
| 薰薰兔歌单         | `http://xunxuntu.localhost:5173/` 或 `http://127.0.0.1:5173/s/xunxuntu`      |

本地测试账号密码均为 **`Local-only-0929!`**，仅用于这个内存实验环境：

| 账号                  | 权限                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `platform@local.test` | 平台管理员，创建歌单、创建/关联账号、分配/撤销授权、管理全部主播 |
| `siro0@local.test`    | 仅管理 Siro0                                                     |
| `xunxuntu@local.test` | 仅管理薰薰兔                                                     |
| `outsider@local.test` | 无任何歌单权限，用于拒绝访问测试                                 |

建议先登录平台管理员，创建新歌单并分配账号，再登录主播账号添加歌曲、修改外观、导出/恢复备份；检查另一个主播的数据不受影响。本地开发脚本只监听 127.0.0.1，不用于生产部署。

分配账号时选择“创建新账号”，填写邮箱和至少 12 位密码；已有账号则选择“关联现有账号”，填写 Supabase Authentication 中的完整用户 UUID，不能填写主播标识或昵称。分配结果显示在按钮旁，成功后下方授权列表自动更新。

授权列表显示邮箱与账号 UUID。dev:local 创建的账号仅存在本机测试环境，不写入正式 Supabase；连接真实项目后，平台后台创建账号会通过 Supabase Auth 自动生成用户并授予所选歌单权限，无需手动关联。把邮箱、密码和对应后台地址交给主播即可登录。

撤销授权和歌单右上角“删除歌单”均有确认弹窗。删除清除该歌单的数据与授权，但登录账号仍保留，其他歌单权限不受影响。旧版已运行的 dev:local 内存库支持按歌单兼容删除，无需重启清空其他实验数据；真实项目必须加载删除 RPC 迁移，不启用兼容删除。

## 保留与新增功能

保留搜索、语言与标签筛选、歌曲状态、点击复制、筛选内随机选歌、手机随机不跳转、愿望单直达、置顶置底、手机字体适配、歌曲编辑和批量标签、后台状态搜索及排序、网易云/酷狗/QQ 音乐单曲和歌单解析预览导入、愿望处理与限流、头像背景、导航文字、图标/favicon、静态/动态指针及热点、完整 JSON 备份恢复。

新增：

- 主播目录、子域名识别、路径预览入口，无效或停用歌单不读取其他主播。
- 平台后台创建/编辑/停用歌单、创建或关联账号、授予/撤销权限。
- 真实账号会话与每次请求重新授权；平台管理员和主播管理员分离。
- 歌曲、愿望、统计、标签、设置、素材、导入导出、重置和恢复全部按主播隔离。
- 各主播独立浏览器标题、网页描述与首页说明，在页面配置中设置，留空使用默认值。
- v2 备份包含来源主播信息，兼容 v1 旧歌单备份；导入目标由当前授权歌单决定，不信任备份中的主播 ID。

一次更新程序覆盖同一部署的全部主播；新增主播在后台创建记录和授权即可。数据库结构变更仍需对共享项目执行对应迁移。

## 权限与素材

登录会话使用签名 HttpOnly cookie，并向 Supabase 校验身份，支持 token 刷新。每次后台请求重新检查主播授权和平台角色，撤权后下次请求失效。cookie 不跨子域名共享，第一次进入另一个主播子域名需在该域名登录。

服务端特权查询显式限定主播 ID，匿名/普通登录数据库角色不能直接读取授权或愿望数据、调用修改 RPC。素材新路径为 `site-assets/<streamer UUID>/...`；Siro0 升级前的 profile/appearance/restores 旧路径只归属迁移后的 Siro0，避免旧图片失效。

## 使用真实测试数据库

复制 .env.example 为 .env，填写独立测试项目的变量，应用数据库脚本并初始化授权后运行 `npm run dev`。已有 .env 时不要覆盖。此模式的后台操作会真实修改连接的数据库。

| 变量                                | 用途                                 |
| ----------------------------------- | ------------------------------------ |
| `PUBLIC_SUPABASE_URL`               | 共享 Supabase URL                    |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY`   | 可公开的 publishable key             |
| `SUPABASE_SECRET_KEY`               | 仅服务端使用的 secret key            |
| `AUTH_SECRET`                       | 会话签名随机串，生产建议至少 32 字节 |
| `PUBLIC_ROOT_DOMAIN`                | 子域名主域，默认 xs0929.cn           |
| `PUBLIC_SITE_*` / `PUBLIC_CURSOR_*` | 平台品牌和指针默认值，主播设置优先   |
| `LOCAL_DEMO`                        | 原有只读演示，仅开发模式生效         |

空库初始化使用 supabase/schema.sql，已有 Siro0 使用 20261003_multi_streamer.sql 增量迁移，**不能重跑初始化脚本升级**。初始化平台管理员及线上切换见 [部署说明](DEPLOYMENT.md)。

## 验证命令

| 命令                                                                          | 用途                                                |
| ----------------------------------------------------------------------------- | --------------------------------------------------- |
| `npm run check`                                                               | TypeScript 与 Svelte 检查                           |
| `npm run build`                                                               | 生产构建                                            |
| `npm run test:appearance` / `test:backup` / `test:tags` / `test:music-import` | 原有 33 项回归                                      |
| `npm run test:tenants`                                                        | 上下文、PostgreSQL、HTTP 和浏览器多主播测试         |
| `npm run test:tenant-context`                                                 | 并发上下文、素材路径、域名边界                      |
| `npm run test:tenant-sql`                                                     | 迁移、事务、RLS 和跨主播约束                        |
| `npm run test:tenant-http`                                                    | 实际本地页面、账号权限及管理接口                    |
| `npm run test:tenant-ui`                                                      | 浏览器登录、配置、素材上传、备份恢复、桌面/手机布局 |

浏览器测试默认使用已安装的 Microsoft Edge；也可设置 PLAYWRIGHT_CHANNEL=chrome，或安装 Playwright Chromium 后设为 chromium。测试自动启动隔离服务，无需运行 dev:local。SQL/HTTP/UI 测试分别使用内存库，HTTP 和 UI 端口为 5193、5194，不改动实验环境的 5173 数据。

PGlite 与 Playwright 仅为开发依赖。Supabase Auth/Storage 的本地服务是测试替身，云端真实认证、对象存储和 DNS/HTTPS 仍需在正式迁移前联调。

完整代码改动及实施情况见 [多主播实施清单](MULTI_TENANT_PLAN.md)，历史见 [更新日志](更新日志.md)。原依赖审计的 18 项问题另行记录，尚未批量升级运行时依赖。

## 来源与许可证

从 struggle-songlist-qk 的 91f5893 导入代码及原有 7 个提交，保留 QingKong Songlist 原作者声明和 [Parity Public License 7.0.0](LICENSE)。原单主播库和个人歌单不会自动同步此仓库。
