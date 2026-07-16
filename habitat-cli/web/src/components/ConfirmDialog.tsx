import { useEffect, useRef, type ReactNode } from "react";

type ConfirmDialogProps = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
        return;
      }
      // Minimal focus trap: keep Tab cycling inside the dialog.
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          "button, input, [tabindex]",
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [busy, onCancel]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 9, 7, 0.6)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="card reveal"
        style={{ maxWidth: 420, width: "100%", boxShadow: "var(--shadow)" }}
      >
        <div
          className="display"
          style={{ fontSize: 22, marginBottom: 10, color: "var(--text)" }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
          {children}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 22,
          }}
        >
          <button ref={cancelRef} className="pill" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spin" aria-label="Working" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
