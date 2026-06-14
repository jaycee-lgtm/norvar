"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

type SettingsSectionProps = {
  label:       string;
  title:       string;
  description?: string;
  defaultOpen?: boolean;
  loading?:    boolean;
  children?:   ReactNode;
};

export default function SettingsSection({
  label,
  title,
  description,
  defaultOpen = false,
  loading = false,
  children,
}: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`settings-section card${open ? " settings-section--open" : ""}`}>
      <button
        type="button"
        className="settings-section-toggle"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <span className="settings-section-heading">
          <span className="stag settings-section-label">{label}</span>
          <span className="settings-section-title">{title}</span>
          {description && !open && (
            <span className="settings-section-summary">{description}</span>
          )}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          className="settings-section-chevron"
          aria-hidden
        />
      </button>

      {open && (
        <div className="settings-section-body">
          {description && (
            <p className="settings-section-description">{description}</p>
          )}
          {loading ? (
            <div className="settings-section-loading">
              <Loader2 size={18} className="spin" color="var(--fg3)" />
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  );
}
