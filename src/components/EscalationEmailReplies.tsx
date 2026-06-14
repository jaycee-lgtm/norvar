"use client";

import { Mail } from "lucide-react";
import type { EscalationEmailReply } from "@/lib/escalation";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

type EscalationEmailRepliesProps = {
  replies: EscalationEmailReply[];
  className?: string;
};

export default function EscalationEmailReplies({ replies, className }: EscalationEmailRepliesProps) {
  if (!replies.length) return null;

  return (
    <div className={className ?? "remediation-escalation-replies"}>
      <div className="remediation-section-label">
        <Mail size={10} style={{ display: "inline", marginRight: 5, verticalAlign: "-1px" }} />
        Email responses
      </div>
      {replies.map(reply => (
        <div key={reply.id} className="remediation-escalation-reply">
          <div className="remediation-escalation-reply-meta">
            <span className="remediation-escalation-reply-from">
              {reply.from_name ?? reply.from_email}
            </span>
            <span className="remediation-escalation-reply-date">{fmtDate(reply.created_at)}</span>
          </div>
          {reply.from_name && (
            <div className="remediation-escalation-reply-email">{reply.from_email}</div>
          )}
          <p className="remediation-escalation-reply-body">{reply.body}</p>
        </div>
      ))}
    </div>
  );
}
