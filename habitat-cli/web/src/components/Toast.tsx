import { useDashboard } from "../hooks/useDashboardData";

export function Toasts() {
  const { toasts, dismissToast } = useDashboard();

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 60,
        maxWidth: 380,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="card reveal"
          style={{
            padding: "12px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            boxShadow: "var(--shadow)",
            borderColor: "var(--red)",
          }}
        >
          <span
            className="dot"
            style={{ background: "var(--red)", marginTop: 5 }}
            aria-hidden="true"
          />
          <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-soft)" }}>
            {toast.message}
          </span>
          <button
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            style={{
              border: "none",
              background: "transparent",
              color: "var(--faint)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: 2,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
