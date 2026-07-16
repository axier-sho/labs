import { useState } from "react";
import { useDashboard } from "../hooks/useDashboardData";
import { formatKg } from "../lib/format";
import { resourceColor } from "../lib/resources";

// Resource names the habitat commonly deals in; the input also accepts any
// free-text resource type, exactly like `habitat inventory add`.
const KNOWN_RESOURCES = [
  "basalt-composite",
  "silicate-glass",
  "ferrite",
  "ice-regolith",
  "water",
  "oxygen",
];

function AddForm() {
  const { addInventoryEntry, busy, inventory } = useDashboard();
  const [resource, setResource] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isBusy = Boolean(busy["inventory:add"]);

  const suggestions = Array.from(
    new Set([...inventory.map((entry) => entry.resource), ...KNOWN_RESOURCES]),
  );

  const submit = () => {
    const name = resource.trim();
    const qty = Number(quantity);
    if (name === "") {
      setError("Enter a resource name.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }
    setError(null);
    void addInventoryEntry(name, qty)
      .then(() => {
        setResource("");
        setQuantity("");
      })
      .catch(() => {
        // The provider already toasts the server's reason.
      });
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="text-input"
          style={{ flex: 1, minWidth: 0, padding: "7px 10px", fontSize: 12.5 }}
          placeholder="resource"
          aria-label="Resource to add"
          list="inventory-resources"
          value={resource}
          disabled={isBusy}
          onChange={(e) => {
            setResource(e.target.value);
            setError(null);
          }}
        />
        <datalist id="inventory-resources">
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <input
          className="text-input tabular"
          style={{ width: 70, padding: "7px 10px", fontSize: 12.5 }}
          placeholder="kg"
          inputMode="decimal"
          aria-label="Quantity in kilograms"
          value={quantity}
          disabled={isBusy}
          onChange={(e) => {
            setQuantity(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button
          className="pill"
          disabled={isBusy || resource.trim() === "" || quantity.trim() === ""}
          onClick={submit}
        >
          {isBusy ? <span className="spin" aria-label="Adding" /> : "Add"}
        </button>
      </div>
      {error && (
        <div role="alert" style={{ marginTop: 6, fontSize: 11.5, color: "var(--red)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

export function InventoryCard() {
  const { inventory } = useDashboard();

  return (
    <section className="card" aria-label="Inventory">
      <div className="section-label" style={{ marginBottom: 12 }}>
        Inventory
      </div>

      {inventory.length === 0 ? (
        <div
          style={{
            padding: "10px 0",
            textAlign: "center",
            fontSize: 13,
            color: "var(--faint)",
          }}
        >
          Nothing stored yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {inventory.map((entry) => (
            <div
              key={entry.resource}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "9px 0",
                borderBottom: "1px solid var(--border-soft)",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontSize: 13,
                  color: "var(--text-soft)",
                }}
              >
                <span
                  style={{ color: resourceColor(entry.resource), fontSize: 10 }}
                  aria-hidden="true"
                >
                  ●
                </span>
                {entry.resource}
              </span>
              <span className="tabular" style={{ fontSize: 13 }}>
                {formatKg(entry.quantity)} kg
              </span>
            </div>
          ))}
        </div>
      )}

      <AddForm />
    </section>
  );
}
