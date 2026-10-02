<script lang="ts">
  import { browser } from '$app/environment';
  import { branding } from '$lib/branding';
  import { page } from '$app/state';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { applyTheme, persistTheme } from '$lib/theme';

  let {
    isAdmin,
    icon = branding.icon,
    title,
    subtitle
  }: { isAdmin: boolean; icon?: string; title: string; subtitle: string } = $props();

  let isDark = $state(browser && document.documentElement.classList.contains('dark'));

  const toggleTheme = () => {
    isDark = !isDark;
    applyTheme(isDark);
    persistTheme(isDark);
  };

  const base = $derived(page.data.base || '');
  const isHome = $derived(page.url.pathname === base || page.url.pathname === base + '/');
  const isAdminPage = $derived(page.url.pathname.startsWith(base + '/admin'));
</script>

<header
  class="site-header sticky top-0 z-20 border-b border-[var(--color-border-soft)] bg-[var(--color-surface-overlay)] backdrop-blur-xl"
>
  <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 lg:px-6">
    <a href={base + '/'} class="flex min-w-0 flex-1 basis-40 items-center gap-3">
      {#if icon}
        <img src={icon} alt="" class="h-9 w-9 shrink-0 rounded-[12px] object-cover shadow-sm" width="36" height="36" />
      {:else}
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)] text-white"
          >歌</span
        >
      {/if}
      <span class="flex min-w-0 flex-col leading-tight">
        <span class="text-sm font-semibold [overflow-wrap:anywhere] break-words text-[var(--color-text)]">{title}</span>
        <span class="text-[11px] [overflow-wrap:anywhere] break-words text-[var(--color-text-muted)]">{subtitle}</span>
      </span>
    </a>

    <nav class="flex flex-wrap items-center justify-end gap-1 text-sm [&_a]:whitespace-nowrap">
      <button
        type="button"
        class="button button-ghost button-icon theme-toggle"
        aria-pressed={isDark}
        aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
        onclick={toggleTheme}
      >
        {#if isDark}
          <Icon name="sun" class="theme-toggle-icon" />
        {:else}
          <Icon name="moon" class="theme-toggle-icon" />
        {/if}
      </button>

      {#if page.data.isPlatformAdmin}<a href={base + '/admin/streamers'} class="button button-small">主播管理</a>{/if}
      {#if !isHome}
        <a href="/" class="button button-primary button-small">公开歌单</a>
      {/if}

      {#if !isAdminPage}
        {#if isAdmin}
          <a href={base + '/admin'} class="button button-primary button-small">后台管理</a>
        {:else}
          <a href={base + '/admin/login'} class="button button-primary button-small">后台管理</a>
        {/if}
      {/if}
    </nav>
  </div>
</header>

<style>
  :global(.theme-toggle-icon) {
    transition:
      transform 300ms ease,
      opacity 200ms ease;
  }

  .theme-toggle:hover :global(.theme-toggle-icon) {
    transform: rotate(15deg);
  }

  .theme-toggle[aria-pressed='true'] :global(.theme-toggle-icon) {
    color: var(--color-accent);
  }

  @supports (-webkit-touch-callout: none) {
    .site-header {
      background-color: var(--color-surface);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }
</style>
