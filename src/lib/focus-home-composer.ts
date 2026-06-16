import type { MouseEvent } from "react";

export function focusHomeComposerInput(
  e: MouseEvent,
  field: HTMLTextAreaElement | HTMLInputElement | null,
) {
  if ((e.target as HTMLElement).closest(".mode-selector, button, a, input, textarea, select")) return;
  field?.focus();
}
