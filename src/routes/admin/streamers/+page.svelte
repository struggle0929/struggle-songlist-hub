<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form?: ActionData } = $props();
  let accountMode = $state('create');
  let assigning = $state(false);
</script>

<svelte:head><title>主播与账号管理 | {data.siteTitle}</title></svelte:head>
<div class="space-y-6">
  <h1 class="text-3xl font-semibold">主播与账号管理</h1>
  {#if form?.message && form.section !== 'assign' && form.section !== 'accounts'}<p
      class="alert alert-success"
      role="status"
    >
      {form.message}
    </p>{/if}
  {#if form?.error && form.section !== 'assign' && form.section !== 'delete' && form.section !== 'accounts'}<p
      class="alert alert-danger"
      role="alert"
    >
      {form.error}
    </p>{/if}
  <section class="request-card p-6">
    <h2 class="text-xl font-semibold">创建歌单</h2>
    <form method="POST" action="?/create" use:enhance class="mt-4 grid gap-4 sm:grid-cols-2">
      <label class="field-label"
        >主播标识<input
          class="form-field"
          name="slug"
          required
          maxlength="32"
          pattern="[a-z0-9][a-z0-9-]*"
          placeholder="siro0"
        /></label
      >
      <label class="field-label"
        >主播昵称<input class="form-field" name="name" required maxlength="80" placeholder="Siro0" /></label
      >
      <p class="text-sm text-[var(--color-text-secondary)] sm:col-span-2">
        标识用于子域名，创建后保持稳定；昵称可随时修改。新歌单自动初始化页面配置。
      </p>
      <button type="submit" class="button button-primary">创建歌单</button>
    </form>
  </section>
  <section class="request-card p-6">
    <h2 class="text-xl font-semibold">分配账号</h2>
    <form
      method="POST"
      action="?/assign"
      use:enhance={() => {
        assigning = true;
        return async ({ update }) => {
          try {
            await update({ reset: false });
          } finally {
            assigning = false;
          }
        };
      }}
      class="mt-4 grid gap-4 sm:grid-cols-2"
    >
      <label class="field-label sm:col-span-2"
        >账号方式<select name="mode" class="form-field" bind:value={accountMode}>
          <option value="create">创建新账号</option>
          <option value="existing">关联现有账号</option>
        </select></label
      >
      <label class="field-label"
        >歌单<select name="streamerId" class="form-field" required
          ><option value="">请选择</option>{#each data.streamers as s}<option value={s.id}>{s.name}（{s.slug}）</option
            >{/each}</select
        ></label
      >
      {#if accountMode === 'existing'}
        <label class="field-label"
          >现有账号 ID<input
            class="form-field"
            name="userId"
            required
            placeholder="例如 bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
          /></label
        >
        <p class="text-sm text-[var(--color-text-secondary)] sm:col-span-2">
          填写 Supabase Authentication 中该用户的完整 UUID，不是主播标识、昵称或邮箱。
        </p>
      {:else}
        <label class="field-label"
          >新账号邮箱<input class="form-field" name="email" type="email" required autocomplete="off" /></label
        >
        <label class="field-label"
          >新账号密码<input
            class="form-field"
            name="password"
            type="password"
            minlength="12"
            required
            autocomplete="new-password"
          /></label
        >
        <p class="text-sm text-[var(--color-text-secondary)] sm:col-span-2">
          新账号密码至少 12 位，不会自动发送邮件；请自行将登录信息交给主播。
        </p>
      {/if}
      {#if form?.section === 'assign' && form.error}<p class="alert alert-danger sm:col-span-2" role="alert">
          {form.error}
        </p>{/if}
      {#if form?.section === 'assign' && form.message}<p class="alert alert-success sm:col-span-2" role="status">
          {form.message}
        </p>{/if}
      <button type="submit" class="button button-primary" disabled={assigning}
        >{assigning ? '正在分配…' : '分配管理权限'}</button
      >
    </form>
  </section>
  {#each data.streamers as s (s.id)}
    <section class="request-card space-y-4 p-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-xl font-semibold">{s.name} · {s.slug}</h2>
        <div class="flex flex-wrap items-center gap-3">
          {#if s.enabled}<a class="button" href={s.href}>进入后台</a>{/if}
          <form
            method="POST"
            action="?/delete"
            use:enhance={({ cancel }) => {
              if (
                !window.confirm(
                  `是否确认删除歌单“${s.name}（${s.slug}）”？\n此操作将永久删除该歌单的歌曲、愿望、页面配置和授权，无法撤销，请先备份。\n登录账号仍保留，但会失去此歌单的管理权限；其他歌单权限不受影响。`
                )
              )
                cancel();
            }}
          >
            <input type="hidden" name="id" value={s.id} />
            <button type="submit" class="button button-danger">删除歌单</button>
          </form>
        </div>
      </div>
      {#if form?.section === 'delete' && 'targetId' in form && form.targetId === s.id && form.error}
        <p class="alert alert-danger" role="alert">{form.error}</p>
      {/if}
      <form
        method="POST"
        action="?/edit"
        use:enhance={() =>
          async ({ update }) => {
            await update({ reset: false });
          }}
        class="flex flex-wrap items-center gap-3"
      >
        <input type="hidden" name="id" value={s.id} />
        <label class="field-label"
          >昵称<input class="form-field" name="name" value={s.name} required maxlength="80" /></label
        >
        <label><input type="checkbox" name="enabled" checked={s.enabled} /> 启用歌单</label>
        <button type="submit" class="button">保存</button>
      </form>
      <h3 class="font-semibold">已授权账号</h3>
      {#each data.members.filter((m) => m.streamer_id === s.id) as member (member.user_id)}
        <form
          method="POST"
          action="?/revoke"
          use:enhance={({ cancel }) => {
            if (
              !window.confirm(
                `是否确认撤销授权？\n歌单：${s.name}（${s.slug}）\n账号：${member.email || member.user_id}\n撤销后该账号将无法管理此歌单。`
              )
            )
              cancel();
          }}
          class="flex flex-wrap items-center gap-3"
        >
          <input type="hidden" name="streamerId" value={s.id} /><input
            type="hidden"
            name="userId"
            value={member.user_id}
          />
          <span class="text-sm break-all"
            >{#if member.email}<span class="block">{member.email}</span>{/if}<span
              class="text-[var(--color-text-muted)]">{member.user_id}</span
            ></span
          ><button type="submit" class="button button-danger">撤销授权</button>
        </form>
      {:else}<p class="text-sm text-[var(--color-text-muted)]">尚未分配账号。</p>{/each}
    </section>
  {/each}
  <section class="request-card space-y-4 p-6" id="accounts">
    <h2 class="text-xl font-semibold">登录账号管理</h2>
    <p class="text-sm text-[var(--color-text-secondary)]">
      撤销授权或删除歌单会保留登录账号。确认不再使用后，可在此永久删除无任何歌单授权的账号。平台管理员不能删除；停用歌单的授权也需先撤销。
    </p>
    {#if data.accountError}<p class="alert alert-danger" role="alert">{data.accountError}</p>{/if}
    {#if form?.section === 'accounts' && form.error}<p class="alert alert-danger" role="alert">{form.error}</p>{/if}
    {#if form?.section === 'accounts' && form.message}<p class="alert alert-success" role="status">
        {form.message}
      </p>{/if}
    {#each data.accounts.users as account (account.id)}
      {@const grants = data.members.filter((member) => member.user_id === account.id).length}
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4"
        data-account-id={account.id}
      >
        <div class="min-w-0 text-sm break-all">
          <p>{account.email || '无邮箱账号'}</p>
          <p class="text-[var(--color-text-muted)]">{account.id}</p>
          <p>
            {account.isPlatformAdmin
              ? '平台管理员（受保护）'
              : grants
                ? `管理 ${grants} 个歌单，需先撤销全部授权`
                : '无歌单授权，可删除'}
          </p>
        </div>
        {#if !account.isPlatformAdmin && grants === 0}
          <form
            method="POST"
            action="?/deleteAccount"
            use:enhance={({ cancel }) => {
              if (
                !window.confirm(
                  `是否确认永久删除登录账号？\n邮箱：${account.email || '无邮箱'}\n账号 ID：${account.id}\n账号将从 Supabase Auth 删除，无法再登录。此操作无法撤销。`
                )
              )
                cancel();
            }}
          >
            <input type="hidden" name="userId" value={account.id} />
            <button type="submit" class="button button-danger">删除登录账号</button>
          </form>
        {/if}
      </div>
    {/each}
    <nav class="flex flex-wrap items-center gap-3" aria-label="账号列表分页">
      {#if data.accounts.page > 1}<a class="button" href={`?accountPage=${data.accounts.page - 1}#accounts`}>上一页</a
        >{/if}
      <span class="text-sm">第 {data.accounts.page} 页 · 每页最多 25 个账号</span>
      {#if data.accounts.hasNext}<a class="button" href={`?accountPage=${data.accounts.page + 1}#accounts`}>下一页</a
        >{/if}
    </nav>
  </section>
</div>
