"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import InboxMonitoringTab from "@/components/InboxMonitoringTab";
import HoverTip from "@/components/HoverTip";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { EscalationInboxMessage } from "@/lib/escalation";
import type { EscalationInboxFolder, InboxFolder, InboxFolderCounts, InboxListItem, InboxViewFolder } from "@/lib/inbox";
import { INBOX_FOLDERS, stripInboxMessageBody } from "@/lib/inbox";
import { normalizeGapSeverity } from "@/lib/risk-tiers";
import {
  Inbox, ArrowLeft, Loader2, Send, ExternalLink, Mail, MailOpen,
  Archive, Trash2, RotateCcw, Inbox as InboxIcon, ChevronDown,
  CheckSquare, Square, RefreshCw, Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type FolderCounts = InboxFolderCounts;

const FOLDER_ICONS: Record<(typeof INBOX_FOLDERS)[number]["icon"], LucideIcon> = {
  inbox:   Inbox,
  send:    Send,
  archive: Archive,
  trash:   Trash2,
  shield:  Shield,
};

type ThreadDetail = {
  remediation_id:      string;
  assessment_id:       string;
  escalation_token:    string | null;
  gap_title:           string;
  gap_id:              string | null;
  gap_severity:        string;
  project_title:       string | null;
  assessment_number:   string | null;
  created_at:          string | null;
  recipient_name:      string | null;
  recipient_email:     string | null;
  escalation_question: string | null;
  escalation_note:     string | null;
  folder:              EscalationInboxFolder;
  counts:              FolderCounts;
  messages:            EscalationInboxMessage[];
};

const SEV_COLORS: Record<string, string> = {
  high:   "var(--rh)",
  medium: "var(--rm)",
  low:    "var(--fg3)",
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function fmtIdentifiedDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtListDate(iso: string) {
  const d   = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return d.toLocaleDateString("en-GB", { weekday: "short" });
  }
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const AVATAR_COLORS = [
  "#5C6BC0", "#26A69A", "#EF5350", "#AB47BC", "#FFA726", "#42A5F5", "#66BB6A", "#8D6E63",
];

function avatarMeta(name: string | null | undefined, email: string) {
  const label = name?.trim() || email;
  const parts = label.split(/\s+/).filter(Boolean);
  const initial = parts.length >= 2
    ? `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
    : (label[0] ?? "?").toUpperCase();
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash + label.charCodeAt(i) * 17) % AVATAR_COLORS.length;
  return { initial, color: AVATAR_COLORS[hash] ?? AVATAR_COLORS[0] };
}

function parseFolder(value: string | null, tab: string | null): InboxViewFolder {
  if (value === "monitoring" || tab === "monitoring") return "monitoring";
  if (value === "sent" || value === "archived" || value === "trash") return value;
  return "received";
}

function inboxHref(folder: InboxViewFolder, threadId: string | null) {
  const params = new URLSearchParams();
  if (folder !== "received") params.set("folder", folder);
  if (threadId && folder !== "monitoring") params.set("thread", threadId);
  const q = params.toString();
  return q ? `/inbox?${q}` : "/inbox";
}

function InboxThreadRow({
  item,
  folder,
  active,
  selected,
  selectMode,
  isMobile,
  onToggleSelect,
}: {
  item:           InboxListItem;
  folder:         EscalationInboxFolder;
  active:         boolean;
  selected:       boolean;
  selectMode:     boolean;
  isMobile:       boolean;
  onToggleSelect: () => void;
}) {
  const sev = normalizeGapSeverity(item.gap_severity);
  const senderName = item.direction === "inbound"
    ? (item.from_name ?? item.from_email)
    : (item.recipient_name ?? item.recipient_email ?? "Recipient");
  const senderEmail = item.direction === "inbound" ? item.from_email : (item.recipient_email ?? "");
  const avatar = avatarMeta(senderName, senderEmail);

  const showCheckbox = isMobile || selectMode;
  const checkboxAtEnd = isMobile;
  const useLink = isMobile || !selectMode;

  const handleRowClick = () => {
    if (selectMode && !isMobile) onToggleSelect();
  };

  const rowClassName = `inbox-thread-row${active ? " active" : ""}${item.is_read ? "" : " unread"}`;

  const rowMain = (
    <>
      <div
        className="inbox-thread-avatar"
        style={{ background: `${avatar.color}22`, color: avatar.color }}
        aria-hidden
      >
        {avatar.initial}
      </div>

      <div className="inbox-thread-content">
        <div className="inbox-thread-line1">
          <span className="inbox-thread-sender">{senderName}</span>
          <span className="inbox-thread-date">{fmtListDate(item.created_at)}</span>
        </div>
        <div className="inbox-thread-subject">{item.gap_title}</div>
        <div className="inbox-thread-snippet">
          {item.body_preview}
          {item.project_title ? ` · ${item.project_title}` : ""}
        </div>
        {folder === "trash" && item.days_until_purge !== null && (
          <div className="inbox-purge-hint">
            Permanently removed in {item.days_until_purge} day{item.days_until_purge === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {!showCheckbox ? (
        <span
          className="inbox-thread-severity"
          style={{ background: SEV_COLORS[sev] ?? "var(--fg3)" }}
          title={`${sev} severity`}
          aria-hidden
        />
      ) : null}
    </>
  );

  const endCheckbox = showCheckbox && checkboxAtEnd ? (
    <label className="inbox-row-check inbox-row-check--end">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select message from ${senderName}`}
      />
    </label>
  ) : null;

  return (
    <li className={`inbox-thread-item${selected ? " selected" : ""}`}>
      <div className={`inbox-thread-row-inner${checkboxAtEnd ? " inbox-thread-row-inner--check-end" : ""}`}>
        {showCheckbox && !checkboxAtEnd && (
          <label
            className="inbox-row-check"
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              aria-label={`Select message from ${senderName}`}
            />
          </label>
        )}
        {useLink ? (
          <Link href={inboxHref(folder, item.remediation_id)} className={rowClassName}>
            {rowMain}
          </Link>
        ) : (
          <button
            type="button"
            className={rowClassName}
            onClick={handleRowClick}
          >
            {rowMain}
          </button>
        )}
        {endCheckbox}
      </div>
    </li>
  );
}

function InboxListSection({
  title,
  icon: SectionIcon,
  items,
  folder,
  threadId,
  open,
  onToggle,
  selectMode,
  isMobile,
  selectedIds,
  onToggleSelect,
  emptyLabel,
}: {
  title:          string;
  icon:           LucideIcon;
  items:          InboxListItem[];
  folder:         EscalationInboxFolder;
  threadId:       string | null;
  open:           boolean;
  onToggle:       () => void;
  selectMode:     boolean;
  isMobile:       boolean;
  selectedIds:    Set<string>;
  onToggleSelect: (messageId: string) => void;
  emptyLabel?:    string;
}) {
  return (
    <section className="inbox-list-section">
      <button
        type="button"
        className="inbox-list-section-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`inbox-list-section-chevron${open ? " open" : ""}`}
        />
        <SectionIcon size={13} strokeWidth={1.75} className="inbox-list-section-icon" />
        <span className="inbox-list-section-label">{title}</span>
        <span className="inbox-list-section-count">{items.length}</span>
      </button>
      {open && (
        items.length > 0 ? (
          <ul className="inbox-thread-list inbox-thread-list--section">
            {items.map(item => (
              <InboxThreadRow
                key={item.message_id}
                item={item}
                folder={folder}
                active={item.remediation_id === threadId}
                selected={selectedIds.has(item.message_id)}
                selectMode={selectMode}
                isMobile={isMobile}
                onToggleSelect={() => onToggleSelect(item.message_id)}
              />
            ))}
          </ul>
        ) : emptyLabel ? (
          <p className="inbox-list-section-empty">{emptyLabel}</p>
        ) : null
      )}
    </section>
  );
}

function InboxContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const isMobile     = useIsMobile();
  const threadId     = searchParams.get("thread");
  const folder       = parseFolder(searchParams.get("folder"), searchParams.get("tab"));
  const isMonitoring = folder === "monitoring";

  const [items, setItems]             = useState<InboxListItem[]>([]);
  const [counts, setCounts]           = useState<FolderCounts>({
    received: 0, sent: 0, archived: 0, trash: 0, unread_received: 0,
  });
  const [monitoringCount, setMonitoringCount] = useState(0);
  const [thread, setThread]           = useState<ThreadDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [actionBusy, setActionBusy]   = useState<string | null>(null);
  const [reply, setReply]             = useState("");
  const [sending, setSending]         = useState(false);
  const [error, setError]             = useState("");
  const [unreadOpen, setUnreadOpen]   = useState(true);
  const [readOpen, setReadOpen]       = useState(false);
  const [selectMode, setSelectMode]   = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy]       = useState(false);

  const unreadItems = items.filter(i => !i.is_read);
  const readItems   = items.filter(i => i.is_read);
  const groupByRead = folder === "received";

  useEffect(() => {
    if (searchParams.get("tab") !== "monitoring") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    params.set("folder", "monitoring");
    router.replace(`/inbox?${params.toString()}`);
  }, [router, searchParams]);

  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [folder]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/monitor/signals?limit=200")
      .then(res => res.json())
      .then(({ signals }) => {
        if (cancelled) return;
        const unhandled = ((signals ?? []) as Array<{ user_dismissed?: boolean }>)
          .filter(signal => !signal.user_dismissed).length;
        setMonitoringCount(unhandled);
      })
      .catch(() => {
        if (!cancelled) setMonitoringCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!groupByRead) return;
    if (unreadItems.length > 0) {
      setUnreadOpen(true);
      setReadOpen(false);
    } else {
      setUnreadOpen(false);
      setReadOpen(true);
    }
  }, [groupByRead, unreadItems.length]);

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (isMonitoring) return;
    if (!opts?.silent) setLoadingList(true);
    try {
      const res  = await fetch(`/api/escalation-inbox?folder=${folder}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load inbox");
      setItems(data.items ?? []);
      if (data.counts) setCounts(data.counts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load inbox");
    } finally {
      if (!opts?.silent) setLoadingList(false);
    }
  }, [folder, isMonitoring]);

  const loadThread = useCallback(async (id: string, activeFolder: EscalationInboxFolder) => {
    setLoadingThread(true);
    setError("");
    try {
      const res  = await fetch(`/api/escalation-inbox?thread=${id}&folder=${activeFolder}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load thread");
      const nextThread = data.thread ?? null;
      if (!nextThread?.messages?.length) {
        setThread(null);
        setReply("");
        router.replace(inboxHref(activeFolder, null));
        if (data.counts) setCounts(data.counts);
        await loadList({ silent: true });
        return;
      }
      setThread(nextThread);
      if (data.counts) setCounts(data.counts);
      await loadList({ silent: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load thread");
      setThread(null);
    } finally {
      setLoadingThread(false);
    }
  }, [loadList, router]);

  useEffect(() => {
    if (isMonitoring) {
      setLoadingList(false);
      return;
    }
    void loadList();
  }, [loadList, isMonitoring]);

  useEffect(() => {
    if (isMonitoring || !threadId) {
      if (!threadId) setThread(null);
      return;
    }
    void loadThread(threadId, folder as EscalationInboxFolder);
  }, [threadId, folder, loadThread, isMonitoring]);

  const toggleMessageSelect = (messageId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const visibleMessageIds = items.map(i => i.message_id);
  const allSelected = visibleMessageIds.length > 0
    && visibleMessageIds.every(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(visibleMessageIds));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const bulkActionForFolder = (): "delete" | "purge" | "restore" => {
    if (folder === "trash") return "purge";
    return "delete";
  };

  const patchMessages = async (messageIds: string[], action: string) => {
    if (messageIds.length === 0) return;
    setBulkBusy(true);
    setError("");
    try {
      const res  = await fetch("/api/escalation-inbox", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message_ids: messageIds, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update messages");
      exitSelectMode();
      await loadList();
      if (threadId && !isMonitoring) await loadThread(threadId, folder);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update messages");
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    const ids = [...selectedIds];
    const action = bulkActionForFolder();
    if (action === "purge") {
      if (!window.confirm(`Permanently delete ${ids.length} message${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    } else {
      if (!window.confirm(`Move ${ids.length} message${ids.length === 1 ? "" : "s"} to the recycle bin?`)) return;
    }
    await patchMessages(ids, action);
  };

  const bulkRestore = async () => {
    const ids = [...selectedIds];
    await patchMessages(ids, "restore");
  };

  const patchMessage = async (messageId: string, action: string) => {
    if (action === "delete" && !window.confirm("Move this message to the recycle bin?")) return;
    if (action === "purge" && !window.confirm("Permanently delete this message? This cannot be undone.")) return;

    setActionBusy(messageId);
    setError("");
    try {
      const res  = await fetch("/api/escalation-inbox", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message_id: messageId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update message");
      await loadList();
      if (threadId && !isMonitoring) await loadThread(threadId, folder);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update message");
    } finally {
      setActionBusy(null);
    }
  };

  const sendReply = async () => {
    if (!threadId || !reply.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const res  = await fetch("/api/escalation-inbox", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ remediation_id: threadId, message: reply.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send reply");

      setReply("");
      await Promise.all([
        !isMonitoring ? loadThread(threadId, folder) : Promise.resolve(),
        loadList(),
      ]);

      if (data.email_sent === false && data.email_error) {
        setError(`Saved in Norvar, but email failed: ${data.email_error}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not send reply");
    } finally {
      setSending(false);
    }
  };

  const showList  = isMonitoring || !threadId;
  const showPanel = !isMonitoring && !!threadId;
  const canCompose = !isMonitoring && (folder === "received" || folder === "sent");
  const listHref = inboxHref(folder, null);
  const activeFolderLabel = isMonitoring
    ? "Monitoring"
    : INBOX_FOLDERS.find(f => f.id === folder)?.label ?? "Inbox";

  const closeThread = () => {
    setThread(null);
    setReply("");
    setError("");
    router.replace(listHref);
  };

  const emptyCopy: Record<EscalationInboxFolder, { title: string; sub: string }> = {
    received: { title: "No received messages", sub: "Replies to escalations appear here." },
    sent:     { title: "No sent messages", sub: "Messages you send from Norvar appear here." },
    archived: { title: "No archived messages", sub: "Archive messages to keep threads tidy." },
    trash:    { title: "Recycle bin is empty", sub: "Deleted messages stay here for 90 days." },
  };

  const folderNav = (
    <nav className="inbox-folder-nav" aria-label="Inbox folders">
      {INBOX_FOLDERS.map(f => {
        const FolderIcon = FOLDER_ICONS[f.icon];
        return (
          <Link
            key={f.id}
            href={inboxHref(f.id, null)}
            className={`inbox-folder-tab${folder === f.id ? " active" : ""}`}
          >
            <FolderIcon size={14} strokeWidth={1.75} className="inbox-folder-tab-icon" />
            <span>{f.label}</span>
            {f.id === "monitoring" && monitoringCount > 0 ? (
              <span className="inbox-folder-count">{monitoringCount}</span>
            ) : f.id === "received" && counts.unread_received > 0 ? (
              <span className="inbox-folder-count inbox-folder-count--unread">
                {counts.unread_received}
              </span>
            ) : f.id !== "monitoring" && counts[f.id] > 0 ? (
              <span className="inbox-folder-count">{counts[f.id]}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const threadGapHref = thread?.escalation_token
    ? `/escalation/${thread.escalation_token}`
    : threadId
      ? `/remediation?gap=${threadId}`
      : "/remediation";

  const listToolbar = !isMobile && !isMonitoring ? (
    <div className="inbox-list-toolbar">
      <HoverTip label={selectMode ? "Exit selection mode" : "Select messages"}>
        <button
          type="button"
          className="inbox-toolbar-btn"
          aria-label={selectMode ? "Exit selection mode" : "Select messages"}
          disabled={loadingList || items.length === 0}
          onClick={() => {
            if (selectMode) exitSelectMode();
            else setSelectMode(true);
          }}
        >
          {selectMode ? <CheckSquare size={16} strokeWidth={1.75} /> : <Square size={16} strokeWidth={1.75} />}
        </button>
      </HoverTip>
      <HoverTip label="Refresh">
        <button
          type="button"
          className="inbox-toolbar-btn"
          aria-label="Refresh"
          disabled={loadingList}
          onClick={() => { void loadList(); }}
        >
          <RefreshCw size={16} strokeWidth={1.75} className={loadingList ? "spin" : undefined} />
        </button>
      </HoverTip>
      <span className="inbox-list-toolbar-spacer" />
      <span className="inbox-list-range">
        {items.length > 0 ? `1–${items.length}` : "0"} of {items.length}
      </span>
    </div>
  ) : null;

  const monitoringFeed = (
    <div className="inbox-monitoring-scroll">
      <InboxMonitoringTab />
    </div>
  );

  const escalationFolder = folder as EscalationInboxFolder;

  const listScroll = isMonitoring ? monitoringFeed : (
    <>
      {loadingList && (
        <div className="inbox-empty">
          <Loader2 size={16} className="spin" />
        </div>
      )}

      {!loadingList && items.length === 0 && (
        <div className="inbox-empty">
          <Mail size={22} color="var(--fg4)" />
          <p>{emptyCopy[escalationFolder].title}</p>
          <p className="inbox-empty-sub">{emptyCopy[escalationFolder].sub}</p>
        </div>
      )}

      {!loadingList && items.length > 0 && groupByRead && (
        <div className="inbox-list-sections">
          <InboxListSection
            title="Unread"
            icon={Mail}
            items={unreadItems}
            folder={escalationFolder}
            threadId={threadId}
            open={unreadOpen}
            onToggle={() => setUnreadOpen(v => !v)}
            selectMode={selectMode}
            isMobile={isMobile}
            selectedIds={selectedIds}
            onToggleSelect={toggleMessageSelect}
            emptyLabel="No unread messages"
          />
          <InboxListSection
            title="Everything else"
            icon={MailOpen}
            items={readItems}
            folder={escalationFolder}
            threadId={threadId}
            open={readOpen}
            onToggle={() => setReadOpen(v => !v)}
            selectMode={selectMode}
            isMobile={isMobile}
            selectedIds={selectedIds}
            onToggleSelect={toggleMessageSelect}
            emptyLabel="No other messages"
          />
        </div>
      )}

      {!loadingList && items.length > 0 && !groupByRead && (
        <ul className="inbox-thread-list">
          {items.map(item => (
            <InboxThreadRow
              key={item.message_id}
              item={item}
              folder={escalationFolder}
              active={item.remediation_id === threadId}
              selected={selectedIds.has(item.message_id)}
              selectMode={selectMode}
              isMobile={isMobile}
              onToggleSelect={() => toggleMessageSelect(item.message_id)}
            />
          ))}
        </ul>
      )}
    </>
  );

  const listBody = (
    <>
      {listScroll}
      {!isMonitoring && selectedIds.size > 0 && (
        <div className="inbox-bulk-bar">
          <button
            type="button"
            className="inbox-bulk-select-all"
            onClick={toggleSelectAll}
            disabled={bulkBusy}
          >
            {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <span className="inbox-bulk-count">
            {selectedIds.size} selected
          </span>
          <div className="inbox-bulk-actions">
            {folder === "trash" && (
              <button
                type="button"
                className="inbox-bulk-btn"
                disabled={bulkBusy}
                onClick={() => void bulkRestore()}
              >
                <RotateCcw size={12} />
                Restore
              </button>
            )}
            <button
              type="button"
              className="inbox-bulk-btn danger"
              disabled={bulkBusy}
              onClick={() => void bulkDelete()}
            >
              {bulkBusy ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
              {folder === "trash" ? "Delete forever" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <main className={`main-area inbox-page${isMobile ? " inbox-page--mobile" : ""}`}>
      <div className={`inbox-layout${!isMobile && threadId ? " inbox-layout--thread-open" : ""}`}>
        {showList && isMobile && (
          <aside className="inbox-list-pane">
            <div className="inbox-list-head">
              <Inbox size={14} color="var(--fg3)" />
              <h1 className="inbox-list-title">Inbox</h1>
            </div>
            {folderNav}
            {folder === "trash" && !isMonitoring && (
              <p className="inbox-trash-note">Deleted messages are kept for 90 days, then removed permanently.</p>
            )}
            {listBody}
          </aside>
        )}

        {!isMobile && (
          <aside className="inbox-sidebar">
            <div className="inbox-sidebar-head">
              <h1 className="inbox-sidebar-title">Inbox</h1>
            </div>
            {folderNav}
            {folder === "trash" && !isMonitoring && (
              <p className="inbox-trash-note">Deleted messages are kept for 90 days, then removed permanently.</p>
            )}
          </aside>
        )}

        {showList && !isMobile && (
            <section className="inbox-list-main">
              {listToolbar}
              <div className="inbox-list-scroll">{listScroll}</div>
              {!isMonitoring && selectMode && selectedIds.size > 0 && (
                <div className="inbox-bulk-bar">
                  <button
                    type="button"
                    className="inbox-bulk-select-all"
                    onClick={toggleSelectAll}
                    disabled={bulkBusy}
                  >
                    {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                  <span className="inbox-bulk-count">
                    {selectedIds.size} selected
                  </span>
                  <div className="inbox-bulk-actions">
                    {folder === "trash" && (
                      <button
                        type="button"
                        className="inbox-bulk-btn"
                        disabled={bulkBusy}
                        onClick={() => void bulkRestore()}
                      >
                        <RotateCcw size={12} />
                        Restore
                      </button>
                    )}
                    <button
                      type="button"
                      className="inbox-bulk-btn danger"
                      disabled={bulkBusy}
                      onClick={() => void bulkDelete()}
                    >
                      {bulkBusy ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                      {folder === "trash" ? "Delete forever" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </section>
        )}

        {showPanel && (
          <section className="inbox-thread-pane">
            {threadId && loadingThread && (
              <div className="inbox-thread-placeholder">
                <Loader2 size={20} className="spin" />
              </div>
            )}

            {threadId && !loadingThread && thread ? (
              <>
                <header className="inbox-thread-head">
                  <div className={`inbox-thread-nav${!isMobile ? " inbox-thread-nav--desktop" : ""}`}>
                    <HoverTip label="Back to inbox">
                      <Link
                        href={listHref}
                        className="inbox-back-btn"
                        aria-label="Back to inbox"
                        onClick={e => {
                          e.preventDefault();
                          closeThread();
                        }}
                      >
                        <ArrowLeft size={18} strokeWidth={2} />
                      </Link>
                    </HoverTip>
                    {isMobile && (
                      <span className="inbox-thread-nav-label">{activeFolderLabel}</span>
                    )}
                  </div>

                  <div className="inbox-thread-head-body">
                    <div className="inbox-thread-title-row">
                      <h1 className="inbox-thread-title">{thread.gap_title}</h1>
                      <Link href={threadGapHref} className="inbox-open-gap">
                        View gap
                        <ExternalLink size={12} strokeWidth={2} />
                      </Link>
                    </div>
                    <div className="inbox-thread-meta-row">
                      <span className="inbox-thread-meta-recipient">
                        {thread.recipient_name ?? thread.recipient_email ?? "Recipient"}
                        {thread.recipient_email && thread.recipient_name && (
                          <span className="inbox-thread-email">&lt;{thread.recipient_email}&gt;</span>
                        )}
                      </span>
                    </div>
                  </div>
                </header>

                <div className="inbox-messages">
                  <div className="inbox-thread-context">
                    {thread.project_title && (
                      <div className="inbox-context-item">
                        <span className="inbox-context-label">Assessment</span>
                        <p>{thread.project_title}</p>
                      </div>
                    )}
                    {thread.assessment_number && (
                      <div className="inbox-context-item">
                        <span className="inbox-context-label">Number</span>
                        <p>{thread.assessment_number}</p>
                      </div>
                    )}
                    {thread.gap_id && (
                      <div className="inbox-context-item">
                        <span className="inbox-context-label">Gap ID</span>
                        <p style={{ fontFamily: "monospace", fontSize: 12 }}>{thread.gap_id}</p>
                      </div>
                    )}
                    <div className="inbox-context-item">
                      <span className="inbox-context-label">Gap</span>
                      <p>{thread.gap_title}</p>
                    </div>
                    {thread.created_at && (
                      <div className="inbox-context-item">
                        <span className="inbox-context-label">Identified</span>
                        <p>{fmtIdentifiedDate(thread.created_at)}</p>
                      </div>
                    )}
                    {thread.escalation_question && (
                      <div className="inbox-context-item">
                        <span className="inbox-context-label">Question</span>
                        <p>{thread.escalation_question}</p>
                      </div>
                    )}
                    {thread.escalation_note && (
                      <div className="inbox-context-item">
                        <span className="inbox-context-label">Context</span>
                        <p>{thread.escalation_note}</p>
                      </div>
                    )}
                  </div>

                  {thread.messages.length === 0 && (
                    <p className="inbox-messages-empty">No messages in this folder for this thread.</p>
                  )}
                  {thread.messages.map(msg => {
                    const isOutbound = msg.direction === "outbound";
                    const senderName = isOutbound
                      ? (msg.from_name ?? "You")
                      : (msg.from_name ?? msg.from_email);
                    const senderEmail = msg.from_email;
                    const avatar = avatarMeta(senderName, senderEmail);
                    const messageText = stripInboxMessageBody(msg.body);

                    return (
                      <article
                        key={msg.id}
                        className={`inbox-chat-msg${isOutbound ? " outbound" : " inbound"}${msg.is_read === false ? " unread" : ""}`}
                      >
                        <div className="inbox-chat-col">
                          <div className="inbox-chat-meta">
                            {msg.is_read === false && !isOutbound && (
                              <span className="inbox-unread-dot" aria-hidden />
                            )}
                            <time className="inbox-chat-time" dateTime={msg.created_at}>
                              {fmtDate(msg.created_at)}
                            </time>
                            <div className="inbox-chat-actions">
                                {folder === "trash" && (
                                  <>
                                    <button
                                      type="button"
                                      className="inbox-msg-action"
                                      disabled={actionBusy === msg.id}
                                      title="Restore"
                                      onClick={() => void patchMessage(msg.id, "restore")}
                                    >
                                      <RotateCcw size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      className="inbox-msg-action danger"
                                      disabled={actionBusy === msg.id}
                                      title="Delete permanently"
                                      onClick={() => void patchMessage(msg.id, "purge")}
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </>
                                )}
                                {folder === "archived" && (
                                  <>
                                    <button
                                      type="button"
                                      className="inbox-msg-action"
                                      disabled={actionBusy === msg.id}
                                      title="Move back to inbox"
                                      onClick={() => void patchMessage(msg.id, "unarchive")}
                                    >
                                      <InboxIcon size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      className="inbox-msg-action danger"
                                      disabled={actionBusy === msg.id}
                                      title="Delete"
                                      onClick={() => void patchMessage(msg.id, "delete")}
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </>
                                )}
                                {(folder === "received" || folder === "sent") && (
                                  <>
                                    <button
                                      type="button"
                                      className="inbox-msg-action"
                                      disabled={actionBusy === msg.id}
                                      title="Archive"
                                      onClick={() => void patchMessage(msg.id, "archive")}
                                    >
                                      <Archive size={11} />
                                    </button>
                                    <button
                                      type="button"
                                      className="inbox-msg-action danger"
                                      disabled={actionBusy === msg.id}
                                      title="Delete"
                                      onClick={() => void patchMessage(msg.id, "delete")}
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          <div className="inbox-chat-row">
                            <div
                              className="inbox-chat-avatar"
                              style={{ background: `${avatar.color}22`, color: avatar.color }}
                              aria-label={senderName}
                              title={senderName}
                            >
                              {avatar.initial}
                            </div>
                            <div className="inbox-chat-bubble">
                              <p className="inbox-chat-text">{messageText}</p>
                            </div>
                          </div>
                            {msg.deleted_at && folder === "trash" && (
                              <p className="inbox-chat-purge">
                                Permanently removed in {Math.max(0, Math.ceil((new Date(msg.deleted_at).getTime() + 90 * 86_400_000 - Date.now()) / 86_400_000))} days
                              </p>
                            )}
                          </div>
                      </article>
                    );
                  })}
                </div>

                {canCompose && (
                  <div className="inbox-compose">
                    <div className="inbox-compose-box">
                      <textarea
                        className="inbox-compose-input"
                        placeholder={`Reply to ${thread.recipient_name ?? thread.recipient_email}…`}
                        value={reply}
                        rows={isMobile ? 4 : 3}
                        disabled={sending}
                        onChange={e => setReply(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            void sendReply();
                          }
                        }}
                      />
                      <div className="inbox-compose-actions">
                        <span className="inbox-compose-hint">⌘/Ctrl + Enter to send</span>
                        <button
                          type="button"
                          className="inbox-compose-send"
                          disabled={sending || !reply.trim()}
                          onClick={() => void sendReply()}
                        >
                          {sending ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
                          Send reply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}

            {error && <p className="inbox-error">{error}</p>}
          </section>
        )}
      </div>
    </main>
  );
}

export default function InboxPage() {
  return (
    <AppShell>
      <Suspense fallback={
        <main className="main-area inbox-page">
          <div className="inbox-thread-placeholder">
            <Loader2 size={20} className="spin" />
          </div>
        </main>
      }>
        <InboxContent />
      </Suspense>
    </AppShell>
  );
}
