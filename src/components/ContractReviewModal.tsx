"use client";

import { X } from "lucide-react";
import ContractReviewForm from "@/components/ContractReviewForm";

export default function ContractReviewModal({
  onClose,
  onDone,
  initialDocumentId,
}: {
  onClose:            () => void;
  onDone:             () => void;
  initialDocumentId?: string | null;
}) {
  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <div className="app-modal-panel app-modal-panel--wide" onClick={e => e.stopPropagation()}>
        <div className="app-modal-header">
          <span className="app-modal-title">New contract review</span>
          <button type="button" onClick={onClose} aria-label="Close" className="app-modal-close">
            <X size={16} />
          </button>
        </div>
        <ContractReviewForm
          variant="modal"
          initialDocumentId={initialDocumentId}
          onDone={() => { onDone(); onClose(); }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
