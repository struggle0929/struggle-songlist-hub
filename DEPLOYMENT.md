# 部署与迁移说明

## 当前状态

v0.2.0 已实现并完成本地多主播实验。此次没有修改 Vercel/Supabase 线上项目、迁移正式数据或绑定域名。正式目标：一个 Vercel 项目、一个 Supabase 项目，主域 xs0929.cn，主播子域 siro0.xs0929.cn 等。

## 本地实验

运行 `npm ci`、`npm run dev:local`，使用 README 的本地地址和测试账号。数据、认证与素材均在本机内存，退出后清空，不需要配置云项目。实验与当前线上歌单互不影响。

本地 PostgreSQL SQL、HTTP 和浏览器测试已覆盖隔离，但 Auth/Storage 服务是测试替身，不等于实际 Supabase/Vercel 的部署验收。

## 数据库脚本

| 情况                      | 执行脚本                                                                |
| ------------------------- | ----------------------------------------------------------------------- |
| 全新空库                  | `supabase/schema.sql`（包括基线及多主播结构，默认建立 Siro0）           |
| 当前通用歌单/Siro0 已有库 | `supabase/migrations/20261003_multi_streamer.sql`，仅一次               |
| 本地测试旧结构            | `supabase/single-streamer-baseline.sql`，仅测试基线，不用于共享生产部署 |

已有库须先具备两份 20260905 页面外观和备份恢复迁移。多主播迁移会增加主播、授权和平台角色表，将旧歌曲、愿望与设置归属到 Siro0，调整联合主键/外键，并移除危险的旧全局重置/恢复 RPC。旧部署不能继续写迁移后的数据库。

默认 Siro0 ID：`00000000-0000-4000-8000-000000000001`。保留已有素材存储键及其引用，不直接改 storage.objects.name；旧路径仅允许 Siro0 读取与清理。新上传按主播 ID 分目录。

## 初始化真实账号与授权

关闭公开注册，在 Supabase Auth 中创建受信任的账号。迁移不会把全部旧 Auth 账号自动升级为管理员。先查出需要授权账号的 UUID，再显式执行：

```sql
-- 将下方示例 UUID 替换为真实平台管理员用户 ID。
insert into public.platform_admins(user_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- 若旧主播账号只需管理 Siro0，替换为该账号真实 UUID。
insert into public.streamer_members(streamer_id,user_id)
values ('00000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
```

平台角色仅在受控 SQL/服务端维护，不向主播开放提升权限入口。平台管理员登录主域 /admin/login 后，在 /admin/streamers 创建主播、创建或关联账号并授权。新账号密码至少 12 位，后台不自动发送邮件。

## 一个 Vercel 项目的子域名分流

1. 将一个项目连接本仓库 main，设置共享 Supabase 连接变量、新随机 AUTH_SECRET 和 PUBLIC_ROOT_DOMAIN=xs0929.cn。
2. 在同一个项目添加 xs0929.cn 与 \*.xs0929.cn，所有主播子域都指向这个部署。根域和通配域分别配置；通配记录不替代根域记录。
3. 按 Vercel 控制台给出的记录处理 DNS、所有权验证和 HTTPS。通配证书使用 Vercel Nameservers，或按官方说明委派 \_acme-challenge 证书验证；不要只添加普通 CNAME 就认定通配证书已配置好。
4. 验证 siro0.xs0929.cn、xunxuntu.xs0929.cn、对应 /admin 和未知主播 404，再切换正式入口。
5. 此后新增主播只在后台创建数据及授权，无需新增仓库、部署、数据库或每主播 DNS 记录。

如果暂时逐个绑定子域名，应用仍可运行，但新增主播也须手动添加域名绑定；要满足“新增只操作后台”，须完成通配域配置。

核对日期：2026 年 10 月 3 日。以 [Vercel 官方域名与通配证书配置](https://vercel.com/docs/domains/working-with-domains/add-a-domain) 为准，不在仓库硬编码 DNS IP。数据库 API 保留 Supabase 项目地址，无需付费 API 自定义域名。

## Siro0 正式切换顺序

1. 完整导出 Siro0 歌单、配置和素材，验证可恢复。JSON 不包含 Auth 账号，另行保留账号 ID、授权方案、数据库结构与云配置。
2. 使用独立测试库验证 SQL 迁移、旧备份导入及真实 Supabase Auth/Storage，检查权限、token 刷新、signed upload、素材可读和失败清理。
3. 保存旧代码和部署配置，安排切换窗口；暂停旧后台写入、再次备份后执行增量迁移与角色初始化。
4. 连接并部署新代码，绑定根域和通配子域，验证两个账号及两个主播。原旧 cookie 不再有效，需要重新登录。
5. 验证完整功能和备份后，再决定迁入薰薰兔及处理旧部署。迁入其他主播须先创建目标歌单，再在其授权后台导入旧 v1 备份；不会覆盖其他主播。
6. 失败时按已验证方案恢复数据库结构/数据和旧部署。只回退 Vercel 代码不会自动回退数据库。

当前测试不执行上述线上切换。

## 免费策略与当前边界

所有主播共享项目资源，并不会每增加主播获得一份免费配额。继续使用用户选择的 Supabase Free 与 Vercel Hobby。免费项目限额及个人非商业适用条件见 [Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase) 和 [Vercel Hobby](https://vercel.com/docs/plans/hobby)，以账号控制台和官方最新政策为准。

保留现有功能；新增数据库迁移需要执行一次。当前运行时依赖审计的 18 项问题已记录，未采用强制升级。生产上线前还须真实云服务联调、迁移回退验证和依赖问题评估。
