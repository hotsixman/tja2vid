<script lang="ts" module>
  export interface BusyState {
    title: string;
    detail?: string;
    /** 0..1, or undefined for an indeterminate spinner. */
    progress?: number;
    onCancel?: () => void;
  }
</script>

<script lang="ts">
  let { busy }: { busy: BusyState | null } = $props();

  // Only show the modal for work that takes noticeable time, to avoid flicker.
  let visible = $state(false);
  $effect(() => {
    if (!busy) {
      visible = false;
      return;
    }
    const t = setTimeout(() => (visible = true), 150);
    return () => clearTimeout(t);
  });
</script>

{#if busy}
  <!-- Blocks all interaction (even before it becomes visible) -->
  <div class="backdrop" class:visible role="presentation"></div>
  {#if visible}
    <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="busy-title" aria-busy="true">
      <div class="spinner" class:hidden={busy.progress !== undefined}></div>
      <h3 id="busy-title">{busy.title}</h3>
      {#if busy.progress !== undefined}
        <progress value={busy.progress} max="1"></progress>
        <span class="pct">{Math.floor(busy.progress * 100)}%</span>
      {/if}
      {#if busy.detail}<p>{busy.detail}</p>{/if}
      {#if busy.onCancel}<button onclick={busy.onCancel}>취소</button>{/if}
    </div>
  {/if}
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0);
    transition: background 0.2s;
    cursor: progress;
  }
  .backdrop.visible {
    background: rgba(0, 0, 0, 0.6);
  }
  .modal {
    position: fixed;
    z-index: 1001;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(440px, 90vw);
    background: var(--panel);
    border-radius: 14px;
    padding: 1.5rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
  }
  h3 {
    margin: 0;
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  progress {
    width: 100%;
  }
  .pct {
    font-variant-numeric: tabular-nums;
  }
  .spinner {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 4px solid #444;
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  .spinner.hidden {
    display: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
