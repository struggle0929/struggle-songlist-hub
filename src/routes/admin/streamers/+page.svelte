<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form?: ActionData } = $props();
</script>

<svelte:head><title>主播与账号管理 | {data.siteTitle}</title></svelte:head>
<div class="space-y-6">
  <h1 class="text-3xl font-semibold">主播与账号管理</h1>
  {#if form?.message}<p class="alert alert-success" role="status">{form.message}</p>{/if}
  {#if form?.error}<p class="alert alert-danger" role="alert">{form.error}</p>{/if}
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
    <form method="POST" action="?/assign" use:enhance class="mt-4 grid gap-4 sm:grid-cols-2">
      <label class="field-label"
        >歌单<select name="streamerId" class="form-field" required
          ><option value="">请选择</option>{#each data.streamers as s}<option value={s.id}>{s.name}（{s.slug}）</option
            >{/each}</select
        ></label
      >
      <label class="field-label"
        >现有账号 ID<input
          class="form-field"
          name="userId"
          placeholder="填写 Supabase 用户 UUID，或留空创建账号"
        /></label
      >
      <label class="field-label"
        >新账号邮箱<input class="form-field" name="email" type="email" autocomplete="off" /></label
      >
      <label class="field-label"
        >新账号密码<input
          class="form-field"
          name="password"
          type="password"
          minlength="12"
          autocomplete="new-password"
        /></label
      >
      <p class="text-sm text-[var(--color-text-secondary)] sm:col-span-2">
        关联现有账号时无需邮箱和密码。新账号密码至少 12 位，不会自动发送邮件；请自行将登录信息交给主播。
      </p>
      <button type="submit" class="button button-primary">分配管理权限</button>
    </form>
  </section>
  {#each data.streamers as s (s.id)}
    <section class="request-card space-y-4 p-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-xl font-semibold">{s.name} · {s.slug}</h2>
        {#if s.enabled}<a class="button" href={s.href}>进入后台</a>{/if}
      </div>
      <form method="POST" action="?/edit" use:enhance class="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={s.id} />
        <label class="field-label"
          >昵称<input class="form-field" name="name" value={s.name} required maxlength="80" /></label
        >
        <label><input type="checkbox" name="enabled" checked={s.enabled} /> 启用歌单</label>
        <button type="submit" class="button">保存</button>
      </form>
      <h3 class="font-semibold">已授权账号</h3>
      {#each data.members.filter((m) => m.streamer_id === s.id) as member (member.user_id)}
        <form method="POST" action="?/revoke" use:enhance class="flex flex-wrap items-center gap-3">
          <input type="hidden" name="streamerId" value={s.id} /><input
            type="hidden"
            name="userId"
            value={member.user_id}
          />
          <span class="text-sm break-all">{member.user_id}</span><button type="submit" class="button button-danger"
            >撤销授权</button
          >
        </form>
      {:else}<p class="text-sm text-[var(--color-text-muted)]">尚未分配账号。</p>{/each}
    </section>
  {/each}
</div>
