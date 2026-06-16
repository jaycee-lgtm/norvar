import type { MouseEvent, TouchEvent } from "react";

const COMPOSER_FOCUS_IGNORE =
  "button, a, input, textarea, select, label, [role='button'], [role='menu'], [role='listbox'], " +
  ".mode-selector-trigger, .mode-selector-menu, .mode-selector-menu--floating, " +
  ".doc-picker-wrap, .attach-icon-btn, .doc-picker-menu, .doc-picker-popover, " +
  ".doc-picker-menu--floating, .doc-picker-popover--floating, " +
  ".sample-questions-menu, .contracts-clear-source, .redline-model-picker, .redline-model-trigger";

export function shouldIgnoreComposerFocusTap(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true;
  return !!target.closest(COMPOSER_FOCUS_IGNORE);
}

export function focusComposerField(
  e: MouseEvent | TouchEvent,
  field: HTMLTextAreaElement | HTMLInputElement | null,
) {
  if (shouldIgnoreComposerFocusTap(e.target) || !field || field.disabled) return;
  field.focus();
}

/** @deprecated Use focusComposerField */
export function focusHomeComposerInput(
  e: MouseEvent,
  field: HTMLTextAreaElement | HTMLInputElement | null,
) {
  focusComposerField(e, field);
}
