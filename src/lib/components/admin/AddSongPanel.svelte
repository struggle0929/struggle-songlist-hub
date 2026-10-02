<script lang="ts">
  import { enhance } from '$app/forms';
  import { isPending, pendingEnhance } from '$lib/pending.svelte';
  import { hasImportPreview, type AdminActionForm } from '$lib/admin/result';
  import Select from '$lib/components/ui/Select.svelte';
  import TagInput from './TagInput.svelte';
  import { songLanguageItems, songStatusItems } from '$lib/select-options';
  import { Tabs } from 'bits-ui';

  let {
    active = $bindable('manual'),
    form,
    tags = []
  }: {
    active?: string;
    form?: AdminActionForm;
    tags?: string[];
  } = $props();

  const musicInputEcho = $derived(
    hasImportPreview(form)
      ? form.importPreview.sourceInput
      : form?.kind === 'preview-parse-error'
        ? (form.musicInput ?? '')
        : ''
  );
</script>

<div class="panel-card min-w-0">
  <h2 class="text-lg font-semibold text-[var(--color-text)]">添加歌曲</h2>

  <Tabs.Root bind:value={active} class="mt-5 space-y-4">
    <Tabs.List class="admin-tabs-list grid grid-cols-2">
      <Tabs.Trigger value="manual" class="admin-tab-trigger">手动填写</Tabs.Trigger>
      <Tabs.Trigger value="music" class="admin-tab-trigger">歌曲软件导入</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="manual">
      <form method="POST" action="?/saveSong" class="space-y-4" use:enhance={pendingEnhance('save-new')}>
        <label class="field-label">
          <span>歌曲名</span>
          <input name="title" class="form-field" placeholder="例如：祝福" />
        </label>

        <label class="field-label">
          <span>原唱</span>
          <input name="artist" class="form-field" placeholder="例如：YOASOBI" />
        </label>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="field-label">
            <span>语言</span>
            <Select name="language" required value="其他" items={songLanguageItems} />
          </label>

          <label class="field-label">
            <span>状态</span>
            <Select name="status" value="ready" items={songStatusItems} />
          </label>
        </div>

        <TagInput suggestions={tags} />

        <label
          class="flex items-center gap-3 rounded-[14px] border border-[var(--color-border-soft)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-text-secondary)]"
        >
          <input
            name="isPublic"
            type="checkbox"
            class="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
            checked
          />
          <span>公开展示到前台歌单</span>
        </label>

        <button
          type="submit"
          class="button button-primary button-full"
          disabled={isPending('save-new')}
          data-pending={isPending('save-new') || undefined}
        >
          保存歌曲
        </button>
      </form>
    </Tabs.Content>

    <Tabs.Content value="music" class="space-y-4">
      <p class="text-sm leading-6 text-[var(--color-text-secondary)]">
        支持歌曲软件：网易云、酷狗、QQ音乐。在软件点击分享单曲或者歌单，复制链接。
      </p>
      <form
        method="POST"
        action="?/previewMusic"
        class="space-y-3"
        use:enhance={pendingEnhance('preview-music', undefined, { reset: false })}
      >
        <label class="field-label">
          <span>单曲或歌单分享链接</span>
          <input
            name="musicInput"
            class="form-field"
            value={musicInputEcho}
            required
            maxlength="4000"
            placeholder="粘贴单曲或歌单分享链接"
          />
        </label>
        <button
          type="submit"
          class="button button-secondary button-full"
          disabled={isPending('preview-music')}
          data-pending={isPending('preview-music') || undefined}>解析链接</button
        >
      </form>
    </Tabs.Content>
  </Tabs.Root>
</div>
