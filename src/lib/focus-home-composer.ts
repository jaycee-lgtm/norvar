import type { MouseEvent } from "react";

export function focusHomeComposerInput(
  e: MouseEvent,
  field: HTMLTextAreaElement | HTMLInputElement | null,
) {
  const target = e.target as HTMLElement;
  if (target.closest(".mode-selector-menu, button, a, input, textarea, select")) return;
  if (target.closest(".mode-selector-trigger")) return;
  field?.focus();
}
