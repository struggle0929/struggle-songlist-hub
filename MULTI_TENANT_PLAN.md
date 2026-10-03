# 多主播实施清单

v0.2.0 已按用户要求实现多主播共用数据库与部署，本文件记录本次全部改动及边界。初次复制来自 91f5893；此次保留原有歌单功能，正式访问采用主播名称前置的子域名。

## 已完成部分

| 部分             | 文件与具体变更                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 子域名和预览路由 | 新增 src/lib/streamers.ts、src/hooks.ts，解析 siro0.xs0929.cn 与 siro0.localhost；/s/siro0 供本地/预览复用现有页面；冲突主播、未知或停用主播被拒绝                                                                                        |
| 请求隔离         | 新增 src/lib/server/tenant.ts，以 AsyncLocalStorage 保存各请求的主播/用户/权限上下文；并发不串歌单；素材路径和写权限检查                                                                                                                  |
| 身份和后台保护   | 修改 auth.ts、hooks.server.ts、app.d.ts，使用真实 Supabase 身份、签名 HttpOnly cookie、token 刷新、每次重新查询授权、来源校验和私有响应禁止缓存                                                                                           |
| 主播/授权服务    | 新增 server/streamers.ts，公开/授权目录、平台角色、主播创建编辑停用、账号创建/关联、授予撤销；新账号授权失败时清理本次账号                                                                                                                |
| 数据隔离         | songs.ts、requests.ts、settings.ts、catalog.ts 所有查询及操作按主播限制；修改别人的歌曲 ID 或批量夹带外部 ID 被拒绝，标签及统计也独立                                                                                                     |
| 素材和外观       | appearance.ts、settings.ts 按主播目录上传/删除，Siro0 保留原有素材键；独立浏览器标题、网页描述与首页说明新增到 appearance，原图标和两套指针保持兼容                                                                                       |
| 备份恢复         | 共享/服务端 database-backup.ts 与 DataSettingsModal.svelte：v2 备份标明来源、兼容 v1；目标始终由授权请求确定，素材上传/失败清理/恢复仅影响当前主播                                                                                        |
| 请求限流         | rate-limit.ts：每主播限流，同时保留同一客户端的平台总体防刷                                                                                                                                                                               |
| 布局和跳转       | 所有相关页面 load 和布局接入当前主播，导航与数据库接口带本地路径前缀，登录/退出跳转正确；显式追踪 URL，修复客户端切换主播时旧数据未刷新的问题                                                                                             |
| 目录和平台界面   | 新增 StreamerDirectory.svelte 和 admin/streamers 页面：目录、授权歌单列表、创建歌单、修改昵称、停用、创建/关联账号与撤权                                                                                                                  |
| 手机界面         | 复用原组件和样式，导航允许换行，新增管理页面在 390px 宽度下没有横向溢出                                                                                                                                                                   |
| 数据库           | 新增 20261003_multi_streamer.sql，增加 streamers、streamer_members、platform_admins；业务表增加主播外键及联合主键/外键、索引；RPC 事务按主播，删除旧危险重置/恢复签名；RLS 隐藏私有和停用数据；Storage 限制策略阻止旧宽松规则授权匿名写入 |
| 类型与初始化     | 更新 database.types.ts 和 schema.sql，保留 single-streamer-baseline.sql 仅供迁移测试；旧库增量迁移和空库初始化分开                                                                                                                        |
| 本地实验         | 新增 dev-local.mjs 和 lib/local-backend.mjs，用内存 PostgreSQL+Auth/Storage 测试替身提供两位主播及平台测试账号，不连接正式数据库                                                                                                          |
| 测试             | 原 33 项回归适配请求上下文；新增并发/域名、SQL、HTTP和真实浏览器测试；旧浏览器脚本改为真实登录，不再伪造旧管理员 cookie                                                                                                                   |
| 开发配置         | package/lock 版本更新为 0.2.0，增加 PGlite、Playwright 开发依赖和实验/测试脚本；.env.example 增加 PUBLIC_ROOT_DOMAIN；Vite 预构建 zod，避免打开备份时开发页面刷新                                                                         |
| 文档             | README、DEPLOYMENT、更新日志及本实施清单同步当前状态、全部改动、本地账号和上线迁移步骤                                                                                                                                                    |

## 数据与权限设计

- 一个账号可被授权多个主播；平台管理员管理全部主播，普通主播不能创建平台角色或给自己授权。
- 主播标识为 1～32 位小写英文/数字/连字符，排除系统保留字。显示昵称独立，标识创建后保持稳定。
- 歌曲与愿望采用 (streamer_id,id) 主键，允许旧备份中相同 UUID 分别导入多个主播。愿望关联通过联合外键强制属于同一主播。
- 配置主键为 (streamer_id,key)，包括原有五个设置。新增页面文字沿用 appearance，不需要额外的键或第二套外观存储。
- 服务端 service_role 客户端不依赖 RLS 自动过滤，显式按请求主播限制；匿名角色仅公开读取启用主播和公开配置/歌曲。
- 旧单主播管理员 cookie 已失效。新 cookie 保留账号会话但不固化权限，撤权和停用在下一次请求生效；子域之间不共享 cookie。
- 素材新路径为主播 UUID 前缀，只有默认迁移后的 Siro0 允许其既有 profile/appearance/restores 键，禁止任意其他主播路径与目录穿越。

## 验证与上线边界

本地完成 TypeScript/Svelte 检查、生产构建、原功能回归、PostgreSQL 迁移/事务/RLS、HTTP 权限和浏览器电脑/手机验证。具体次数和结果见更新日志。

实际 Supabase Auth/Storage 与 Vercel/DNS 未在此阶段操作，生产迁移前须使用真实测试项目联调、备份并验证回退。待执行事项仅为云端部署、数据切换、通配域证书配置和原依赖问题评估。

## 本次完整文件清单

以下为相对于初次导入提交 d496109 的所有新增/修改文件（不含本地依赖、缓存及测试截图）：

- `.env.example`
- `DEPLOYMENT.md`
- `MULTI_TENANT_PLAN.md`
- `README.md`
- `package-lock.json`
- `package.json`
- `scripts/dev-local.mjs`
- `scripts/lib/local-backend.mjs`
- `scripts/lib/ui-login.mjs`
- `scripts/test-appearance.mjs`
- `scripts/test-database-backup.mjs`
- `scripts/test-music-import-ui.mjs`
- `scripts/test-page-settings-ui.mjs`
- `scripts/test-tags-ui.mjs`
- `scripts/test-tags.mjs`
- `scripts/test-tenant-context.mjs`
- `scripts/test-tenant-http.mjs`
- `scripts/test-tenant-sql.mjs`
- `scripts/test-tenant-ui.mjs`
- `src/app.d.ts`
- `src/hooks.server.ts`
- `src/hooks.ts`
- `src/lib/appearance.ts`
- `src/lib/components/Header.svelte`
- `src/lib/components/StreamerDirectory.svelte`
- `src/lib/components/admin/AppearanceSettings.svelte`
- `src/lib/components/admin/DataSettingsModal.svelte`
- `src/lib/components/admin/OverviewCard.svelte`
- `src/lib/components/public/Hero.svelte`
- `src/lib/database-backup.ts`
- `src/lib/server/appearance.ts`
- `src/lib/server/auth.ts`
- `src/lib/server/catalog.ts`
- `src/lib/server/database-backup.ts`
- `src/lib/server/database.types.ts`
- `src/lib/server/rate-limit.ts`
- `src/lib/server/requests.ts`
- `src/lib/server/settings.ts`
- `src/lib/server/songs.ts`
- `src/lib/server/streamers.ts`
- `src/lib/server/tenant.ts`
- `src/lib/streamers.ts`
- `src/routes/+layout.server.ts`
- `src/routes/+layout.svelte`
- `src/routes/+page.server.ts`
- `src/routes/+page.svelte`
- `src/routes/admin/+page.server.ts`
- `src/routes/admin/+page.svelte`
- `src/routes/admin/login/+page.server.ts`
- `src/routes/admin/login/+page.svelte`
- `src/routes/admin/streamers/+page.server.ts`
- `src/routes/admin/streamers/+page.svelte`
- `supabase/migrations/20261003_multi_streamer.sql`
- `supabase/migrations/20261003_delete_streamer.sql`
- `supabase/migrations/20261003_account_deletion_guard.sql`
- `supabase/schema.sql`
- `supabase/single-streamer-baseline.sql`
- `vite.config.ts`
- `更新日志.md`
