<script lang="ts">
  import { onMount } from 'svelte';
  import { parseTags } from '$lib/tags';

  let {
    name = 'tagsInput',
    value = $bindable(''),
    suggestions = [],
    label = '标签',
    muted = false
  }: { name?: string; value?: string; suggestions?: string[]; label?: string; muted?: boolean } = $props();
  let input: HTMLInputElement;
  const selected = $derived(parseTags(value));
  function toggle(tag: string) {
    value = (selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag]).join(', ');
  }
  onMount(() => {
    const form = input.form;
    const reset = () => {
      value = input.defaultValue;
    };
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  });
</script>

<div class="min-w-0 space-y-2">
  <label class="field-label">
    <span>{label}</span>
    <input
      bind:this={input}
      {name}
      bind:value
      class={muted ? 'form-field-muted' : 'form-field'}
      placeholder="输入新标签，逗号分隔"
      maxlength="240"
    />
  </label>
  {#if suggestions.length}
    <div class="flex max-h-40 flex-wrap gap-2 overflow-y-auto" aria-label="已有标签">
      {#each suggestions as tag (tag)}
        <label
          class="flex max-w-full min-w-0 items-center gap-2 rounded-md border border-[var(--color-border-soft)] px-2 py-1 text-sm text-[var(--color-text-secondary)]"
        >
          <input type="checkbox" class="admin-checkbox" checked={selected.includes(tag)} onchange={() => toggle(tag)} />
          <span class="break-all">{tag}</span>
        </label>
      {/each}
    </div>
  {/if}
</div>
