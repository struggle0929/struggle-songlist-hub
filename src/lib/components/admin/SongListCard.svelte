<script lang="ts">
  import { enhance } from '$app/forms';
  import { createSubmitConfirmation, isPending, pendingEnhance } from '$lib/pending.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import { songLanguageItems, songStatusItems } from '$lib/select-options';
  import { songStatusClasses } from '$lib/status-styles';
  import { songStatusLabels, type Song } from '$lib/types';
  import { SvelteSet } from 'svelte/reactivity';
  import TagInput from './TagInput.svelte';
  import { mergeTags } from '$lib/tags';
  import { sortAdminSongs, type AdminSongSort, type SongTitleSortDirection } from '$lib/songs';

  let { songs }: { songs: Song[] } = $props();

  let songSearch = $state('');
  let songPage = $state(1);
  let sortMode = $state<AdminSongSort>('default');
  let sortDirection = $state<SongTitleSortDirection>('asc');
  const songPageSize = 20;
  const selectedIds = new SvelteSet<string>();
  const tags = $derived(mergeTags(...songs.map((song) => song.tags)));

  const normalizedSearch = $derived(songSearch.trim().toLowerCase());
  const matchesAdminSongSearch = (song: Song) => {
    if (!normalizedSearch) return true;

    return [song.title, song.artist, song.language, song.status, songStatusLabels[song.status], ...song.tags].some(
      (value) => value.toLowerCase().includes(normalizedSearch)
    );
  };
  const filteredSongs = $derived(sortAdminSongs(songs.filter(matchesAdminSongSearch), sortMode, sortDirection));
  const totalPages = $derived(Math.max(1, Math.ceil(filteredSongs.length / songPageSize)));
  const safePage = $derived(Math.min(songPage, totalPages));
  const pagedSongs = $derived(filteredSongs.slice((safePage - 1) * songPageSize, safePage * songPageSize));
  const pagedSongIds = $derived(pagedSongs.map((s) => s.id));
  const allOnPageSelected = $derived(pagedSongIds.length > 0 && pagedSongIds.every((id) => selectedIds.has(id)));
  const someOnPageSelected = $derived(pagedSongIds.some((id) => selectedIds.has(id)));
  const songIds = $derived(new Set(songs.map((song) => song.id)));

  let lastSeenSearch = '';
  let lastSeenSort = 'default:asc';
  $effect(() => {
    const current = `${sortMode}:${sortDirection}`;
    if (current !== lastSeenSort) {
      lastSeenSort = current;
      songPage = 1;
    }
  });
  $effect(() => {
    if (normalizedSearch !== lastSeenSearch) {
      lastSeenSearch = normalizedSearch;
      songPage = 1;
      selectedIds.clear();
    }
  });

  $effect(() => {
    for (const id of [...selectedIds]) {
      if (!songIds.has(id)) {
        selectedIds.delete(id);
      }
    }
  });

  const toggleSong = (id: string) => {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
  };

  const togglePage = () => {
    if (allOnPageSelected) pagedSongIds.forEach((id) => selectedIds.delete(id));
    else pagedSongIds.forEach((id) => selectedIds.add(id));
  };

  const submitConfirmation = createSubmitConfirmation();

  const bulkActions = [
    {
      key: 'setPublic',
      label: '全部公开',
      btnClass: 'button button-secondary button-small',
      confirm: () => ({
        title: `确认公开 ${selectedIds.size} 首歌曲？`,
        confirmLabel: '确认公开'
      })
    },
    {
      key: 'setPrivate',
      label: '全部隐藏',
      btnClass: 'button button-secondary button-small',
      confirm: () => ({
        title: `确认隐藏 ${selectedIds.size} 首歌曲？`,
        confirmLabel: '确认隐藏'
      })
    },
    {
      key: 'delete',
      label: '批量删除',
      btnClass: 'button button-danger button-small',
      confirm: () => ({
        title: `确认删除 ${selectedIds.size} 首歌曲？`,
        description: '此操作不可撤销。',
        confirmLabel: '确认删除',
        tone: 'danger' as const
      })
    }
  ] as const;
</script>

<section class="panel-card min-w-0">
  <div class="flex flex-wrap items-center justify-between gap-4">
    <h2 class="text-lg font-semibold text-[var(--color-text)]">歌曲列表</h2>
    <span
      class="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs text-[var(--color-text-secondary)]"
    >
      {#if normalizedSearch}
        {filteredSongs.length} / {songs.length} 首
      {:else}
        共 {songs.length} 首
      {/if}
    </span>
  </div>

  <div class="mt-5 flex flex-wrap items-center gap-3">
    <label class="admin-search">
      <Icon name="search" />
      <input
        type="search"
        bind:value={songSearch}
        placeholder="搜索歌名、原唱、标签或状态"
        class="admin-search-input"
      />
      {#if songSearch}
        <button type="button" class="admin-search-clear" onclick={() => (songSearch = '')} aria-label="清空">
          ×
        </button>
      {/if}
    </label>
  </div>

  {#if selectedIds.size > 0}
    <div class="admin-bulk-bar mt-4">
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-sm font-medium text-[var(--color-text)]">已选 {selectedIds.size} 首</span>
        <button type="button" class="button button-ghost button-small" onclick={() => selectedIds.clear()}>
          取消选择
        </button>
        {#if selectedIds.size < filteredSongs.length}
          <button
            type="button"
            class="button button-ghost button-small"
            onclick={() => filteredSongs.forEach((s) => selectedIds.add(s.id))}
          >
            全选过滤结果（{filteredSongs.length}）
          </button>
        {/if}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#each bulkActions as action}
          <form
            method="POST"
            action="?/bulkUpdateSongs"
            use:enhance={pendingEnhance(`bulk-${action.key}`, submitConfirmation.before(action.confirm))}
          >
            {#each [...selectedIds] as id}
              <input type="hidden" name="id" value={id} />
            {/each}
            <input type="hidden" name="bulkAction" value={action.key} />
            <button
              type="submit"
              class={action.btnClass}
              disabled={isPending(`bulk-${action.key}`)}
              data-pending={isPending(`bulk-${action.key}`) || undefined}
            >
              {action.label}
            </button>
          </form>
        {/each}
      </div>
      <form
        method="POST"
        action="?/bulkTagSongs"
        class="w-full space-y-3"
        use:enhance={pendingEnhance(
          'bulk-tags',
          submitConfirmation.before(() => ({
            title: `确认给 ${selectedIds.size} 首歌曲追加标签？`,
            description: '保留原有标签，重复标签不会重复添加。',
            confirmLabel: '追加标签'
          }))
        )}
      >
        {#each [...selectedIds] as id}
          <input type="hidden" name="id" value={id} />
        {/each}
        <TagInput suggestions={tags} label="批量追加标签" />
        <button
          type="submit"
          class="button button-secondary button-small"
          disabled={isPending('bulk-tags')}
          data-pending={isPending('bulk-tags') || undefined}>追加到已选 {selectedIds.size} 首</button
        >
      </form>
    </div>
  {/if}

  {#if pagedSongs.length === 0}
    <div class="admin-empty mt-5">
      {#if songs.length === 0}
        <p class="text-sm font-medium text-[var(--color-text-secondary)]">还没有歌曲，先添加一首吧</p>
      {:else}
        <p class="text-sm font-medium text-[var(--color-text-secondary)]">没有符合条件的歌曲</p>
        <p class="mt-1 text-xs text-[var(--color-text-muted)]">换个关键词试试</p>
      {/if}
    </div>
  {:else}
    <div class="admin-list-head mt-4 flex-wrap gap-3">
      <label class="admin-select-all">
        <input
          type="checkbox"
          class="admin-checkbox"
          checked={allOnPageSelected}
          indeterminate={!allOnPageSelected && someOnPageSelected}
          onchange={togglePage}
        />
        <span>本页全选</span>
      </label>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <div class="w-44 shrink-0">
          <Select
            bind:value={sortMode}
            placeholder="排序方式"
            triggerClass="form-field-muted whitespace-nowrap"
            items={[
              { value: 'default', label: '默认排序' },
              { value: 'title', label: '歌曲名排序' },
              { value: 'import', label: '导入次序排序' }
            ]}
          />
        </div>
        <button
          type="button"
          class="button button-ghost button-small"
          aria-label={sortDirection === 'asc' ? '当前升序，切换为降序' : '当前降序，切换为升序'}
          title={sortDirection === 'asc' ? '升序：点击切换为降序' : '降序：点击切换为升序'}
          onclick={() => (sortDirection = sortDirection === 'asc' ? 'desc' : 'asc')}
        >
          <Icon name="arrow-down-up" />{sortDirection === 'asc' ? '升序' : '降序'}
        </button>
        <span class="text-xs text-[var(--color-text-muted)]">第 {safePage} / {totalPages} 页</span>
      </div>
    </div>

    <div class="mt-3 space-y-3">
      {#each pagedSongs as song (song.id)}
        <details
          class="group rounded-[20px] border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] p-5 transition-colors open:bg-[var(--color-surface)] hover:bg-[var(--color-surface)]"
        >
          <summary class="flex cursor-pointer list-none items-center justify-between gap-4">
            <span class="admin-row-check">
              <input
                type="checkbox"
                class="admin-checkbox"
                checked={selectedIds.has(song.id)}
                onclick={(e) => e.stopPropagation()}
                onchange={() => toggleSong(song.id)}
              />
            </span>
            <div class="min-w-0 flex-1">
              <h3 class="truncate text-base font-semibold text-[var(--color-text)]">{song.title}</h3>
              <p class="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
                {song.artist} · {song.language}{#if !song.isPublic}
                  · <span class="text-[var(--color-text-muted)]">未公开</span>
                {/if}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <span class={`status-badge ${songStatusClasses[song.status]}`}>{songStatusLabels[song.status]}</span>
              <Icon name="chevron-down" class="song-chevron" />
            </div>
          </summary>

          <form
            id="save-song-{song.id}"
            method="POST"
            action="?/saveSong"
            class="mt-5 grid gap-4 sm:grid-cols-2"
            use:enhance={pendingEnhance(`save-${song.id}`, undefined, { reset: false })}
          >
            <input type="hidden" name="id" value={song.id} />

            <label class="field-label sm:col-span-2">
              <span>歌曲名</span>
              <input name="title" value={song.title} class="form-field-muted" />
            </label>

            <label class="field-label">
              <span>原唱</span>
              <input name="artist" value={song.artist} class="form-field-muted" />
            </label>

            <label class="field-label">
              <span>语言</span>
              <Select
                name="language"
                required
                value={song.language}
                items={songLanguageItems}
                triggerClass="form-field-muted"
              />
            </label>

            <label class="field-label">
              <span>状态</span>
              <Select name="status" value={song.status} items={songStatusItems} triggerClass="form-field-muted" />
            </label>

            <div class="sm:col-span-2">
              <TagInput suggestions={tags} value={song.tags.join(', ')} muted />
            </div>

            <label
              class="flex items-center gap-3 rounded-[14px] border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-text-secondary)] sm:col-span-2"
            >
              <input
                name="isPublic"
                type="checkbox"
                class="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                checked={song.isPublic}
              />
              <span>在公开歌单展示</span>
            </label>
          </form>

          <div class="detail-actions">
            <form
              method="POST"
              action="?/deleteSong"
              use:enhance={pendingEnhance(
                `delete-${song.id}`,
                submitConfirmation.before({
                  title: '确认删除这首歌？',
                  description: '删除后无法恢复。',
                  confirmLabel: '确认删除',
                  tone: 'danger'
                })
              )}
            >
              <input type="hidden" name="id" value={song.id} />
              <button
                type="submit"
                class="button button-danger button-small"
                disabled={isPending(`delete-${song.id}`)}
                data-pending={isPending(`delete-${song.id}`) || undefined}
              >
                删除
              </button>
            </form>
            <button
              type="submit"
              form="save-song-{song.id}"
              class="button button-primary"
              disabled={isPending(`save-${song.id}`)}
              data-pending={isPending(`save-${song.id}`) || undefined}
            >
              保存修改
            </button>
          </div>
        </details>
      {/each}
    </div>

    <div class="mt-5">
      <Pagination current={safePage} total={totalPages} onChange={(p) => (songPage = p)} />
    </div>
  {/if}
</section>

<ConfirmDialog
  bind:open={submitConfirmation.open}
  title={submitConfirmation.title}
  description={submitConfirmation.description}
  confirmLabel={submitConfirmation.confirmLabel}
  tone={submitConfirmation.tone}
  onConfirm={submitConfirmation.confirm}
/>
