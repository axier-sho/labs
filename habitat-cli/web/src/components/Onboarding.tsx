import { useState } from "react";
import { useDashboard } from "../hooks/useDashboardData";

export function Onboarding() {
  const { registerHabitat, busy } = useDashboard();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const registering = Boolean(busy.register);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the habitat a name first.");
      return;
    }
    setError(null);
    try {
      await registerHabitat(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="card reveal" style={{ maxWidth: 440, width: "100%", padding: 36 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--faint)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Habitat operations console
        </div>
        <div className="display" style={{ fontSize: 42, lineHeight: 1.1 }}>
          Meridian
        </div>
        <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "14px 0 26px" }}>
          This habitat is not registered with the Kepler planet server yet.
          Registering creates the remote habitat record and hydrates the starter
          modules and crew.
        </p>

        <label
          htmlFor="habitat-name"
          style={{
            display: "block",
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--faint)",
            marginBottom: 8,
          }}
        >
          Habitat name
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            id="habitat-name"
            className="text-input"
            style={{ flex: 1 }}
            placeholder="e.g. Meridian Base"
            value={name}
            disabled={registering}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <button
            className="btn-primary"
            disabled={registering || name.trim() === ""}
            onClick={() => void submit()}
          >
            {registering ? <span className="spin" aria-label="Registering" /> : "Register"}
          </button>
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 14, fontSize: 12.5, color: "var(--red)" }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
