<script lang="ts">
  import type { Streamer } from '$lib/streamers';
  let { streamers, managed = false }: { streamers: (Streamer & { href: string })[]; managed?: boolean } = $props();
</script>

<section class="space-y-6">
  <div>
    <h1 class="text-3xl font-semibold">{managed ? '我管理的歌单' : '主播歌单'}</h1>
    <p class="mt-2 text-[var(--color-text-secondary)]">
      {managed ? '选择获授权的主播进入后台。' : '选择主播，查找歌曲或提交愿望。'}
    </p>
  </div>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each streamers as streamer (streamer.id)}
      <a href={streamer.href} class="request-card block p-6">
        <h2 class="text-xl font-semibold">{streamer.name}</h2>
        <p class="mt-2 text-sm text-[var(--color-text-muted)]">{streamer.slug} · {managed ? '进入后台' : '查看歌单'}</p>
      </a>
    {/each}
  </div>
  {#if !streamers.length}<p class="text-[var(--color-text-secondary)]">
      {managed ? '当前账号尚未获得歌单授权，请联系平台管理员。' : '暂时没有公开歌单。'}
    </p>{/if}
</section>
