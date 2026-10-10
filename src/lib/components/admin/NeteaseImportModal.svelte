<script lang="ts">
  import { enhance, deserialize } from '$app/forms';
  import { untrack } from 'svelte';
  import { createLocalPending } from '$lib/pending.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import { songLanguageItems, songStatusItems } from '$lib/select-options';
  import type { ImportPreview } from '$lib/types';
  import { Dialog } from 'bits-ui';
  import { musicProviderLabel } from '$lib/music-import';
  import TagInput from './TagInput.svelte';

  let {
    preview,
    adminError,
    onClose,
    tags = []
  }: {
    preview: ImportPreview;
    adminError?: string;
    onClose: () => void;
    tags?: string[];
  } = $props();

  const submit = createLocalPending();
  type PreviewRow = ImportPreview['songs'][number] & { manual: boolean };
  let rows = $state<PreviewRow[]>([]);
  let identifying = $state(false);
  let completed = $state(0);
  let total = $state(0);
  let identificationError = $state('');
  const initiallyIdentified = $derived(
    preview.songs.filter((song) => song.languageSource === 'lyrics' || song.languageSource === 'metadata').length
  );
  let controller: AbortController | undefined;
  $effect(() => {
    rows = preview.songs.map((song) => ({ ...song, manual: false }));
    const list = untrack(() => rows);
    completed = 0;
    identificationError = '';
    const candidates =
      (preview.provider ?? 'netease') === 'netease'
        ? untrack(() =>
            list.filter(
              (song) => song.neteaseId && song.languageSource !== 'lyrics' && song.languageSource !== 'metadata'
            )
          )
        : [];
    total = candidates.length;
    const abort = new AbortController();
    controller = abort;
    identifying = candidates.length > 0;
    void (async () => {
      try {
        for (let i = 0; i < candidates.length && !abort.signal.aborted; i += 12) {
          const batch = candidates.slice(i, i + 12);
          const body = new FormData();
          body.set('ids', JSON.stringify(batch.map((song) => song.neteaseId)));
          const response = await fetch('?/identifyLanguages', {
            method: 'POST',
            body,
            signal: abort.signal,
            headers: { 'x-sveltekit-action': 'true' }
          });
          const result = deserialize(await response.text());
          if (result.type !== 'success' || !Array.isArray(result.data?.languageResults))
            throw new Error('歌词识别暂时中断，可重新打开预览重试，或手动核对后导入。');
          for (const item of result.data.languageResults as Array<{ id: string; language?: string }>) {
            if (!item.language) continue;
            for (const song of list) {
              if (song.neteaseId === item.id && !song.manual) {
                song.language = item.language;
                song.languageSource = 'lyrics';
              }
            }
          }
          completed += batch.length;
        }
      } catch (error) {
        if (!abort.signal.aborted)
          identificationError = error instanceof Error ? error.message : '歌词识别暂时不可用。';
      } finally {
        if (!abort.signal.aborted) identifying = false;
      }
    })();
    return () => abort.abort();
  });
  function stopIdentification() {
    controller?.abort();
    identifying = false;
  }
</script>

<Dialog.Root
  open
  onOpenChange={(o) => {
    if (!o) onClose();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay class="dialog-overlay" />
    <Dialog.Content class="dialog-content dialog-content-lg">
      <div class="dialog-header">
        <div>
          <Dialog.Title class="dialog-title">{musicProviderLabel(preview.provider)}歌单导入</Dialog.Title>
          <Dialog.Description class="dialog-description">勾选需要导入的歌曲，核对语言和标签后提交</Dialog.Description>
        </div>
        <Dialog.Close class="dialog-close" aria-label="关闭">
          <Icon name="close" size={18} />
        </Dialog.Close>
      </div>

      {#if adminError}
        <div class="alert alert-danger mb-5">{adminError}</div>
      {/if}

      <form method="POST" action="?/importPlaylist" class="space-y-5" use:enhance={submit.enhance}>
        <input type="hidden" name="sourceInput" value={preview.sourceInput} />
        <input type="hidden" name="provider" value={preview.provider ?? 'netease'} />
        <TagInput
          name="sharedTagsInput"
          suggestions={tags}
          value={preview.sharedTagsInput ?? ''}
          label="统一追加标签"
        />

        <label class="field-label">
          <span>状态</span>
          <Select name="status" value={preview.status} items={songStatusItems} />
        </label>

        <div
          class="rounded-[18px] border border-[var(--color-accent-surface-border)] bg-[var(--color-accent-surface-bg)] px-4 py-3 text-sm text-[var(--color-text-secondary)]"
        >
          <p class="font-medium text-[var(--color-text)]">{preview.songs.length} 首待确认</p>
          <p class="mt-1 text-xs">混合语言歌曲按主要演唱语言判断。“待核对”表示依据不足，手动修改不会被自动识别覆盖。</p>
          {#if total > 0}
            <p class="mt-2 text-xs" aria-live="polite">
              {identifying ? '正在补充歌词检查' : '补充歌词检查'}：{completed}/{total}（歌单共 {preview.songs.length} 首）
            </p>
            <p class="mt-1 text-xs">
              初次解析已识别 {initiallyIdentified} 首，不计入本轮补充检查；检查完成后，“待核对”的歌曲仍需确认。
            </p>
          {/if}
          {#if identifying}
            <button type="button" class="mt-2 text-xs underline" onclick={stopIdentification}>停止识别，手动核对</button
            >
          {/if}
          {#if identificationError}<p class="mt-2 text-xs">{identificationError}</p>{/if}
        </div>

        <div class="max-h-[56vh] overflow-auto rounded-[18px] border border-[var(--color-border-soft)]">
          <table class="w-full min-w-[760px] text-left text-sm">
            <thead
              class="sticky top-0 bg-[var(--color-surface)] text-xs tracking-[0.12em] text-[var(--color-text-muted)] uppercase"
            >
              <tr>
                <th class="w-12 px-3 py-3">选</th>
                <th class="px-3 py-3">歌曲</th>
                <th class="px-3 py-3">原唱</th>
                <th class="px-3 py-3">语言</th>
                <th class="px-3 py-3">标签</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[var(--color-border-soft)] bg-[var(--color-surface)]">
              {#each rows as song, index}
                <tr>
                  <td class="px-3 py-3 align-middle">
                    <div class="flex justify-center">
                      <input
                        name="selectedSong"
                        type="checkbox"
                        value={index}
                        class="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                        checked
                      />
                    </div>
                    <input type="hidden" name="songTitle" value={song.title} />
                    <input type="hidden" name="songArtist" value={song.artist} />
                  </td>
                  <td class="px-3 py-3 text-[var(--color-text)]">{song.title}</td>
                  <td class="px-3 py-3 text-[var(--color-text-secondary)]">{song.artist}</td>
                  <td class="px-3 py-3">
                    <Select
                      name="songLanguage"
                      required
                      bind:value={
                        () => song.language,
                        (value) => {
                          song.language = value ?? '其他';
                          song.manual = true;
                        }
                      }
                      items={songLanguageItems}
                      triggerClass="form-field-muted min-w-28"
                    />
                    <p class="mt-1 text-xs text-[var(--color-text-muted)]">
                      {song.manual
                        ? '手动选择'
                        : song.languageSource === 'lyrics'
                          ? '歌词识别'
                          : song.languageSource === 'metadata'
                            ? '平台信息'
                            : song.languageSource === 'title'
                              ? '歌名推测'
                              : '待核对'}
                    </p>
                  </td>
                  <td class="px-3 py-3">
                    <input
                      name="songTagsInput"
                      class="form-field-muted min-w-48"
                      value={song.tagsInput}
                      placeholder="例如：流行"
                    />
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <button
          type="submit"
          class="button button-primary button-full"
          disabled={submit.pending || identifying}
          data-pending={submit.pending || undefined}
        >
          导入勾选歌曲
        </button>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
