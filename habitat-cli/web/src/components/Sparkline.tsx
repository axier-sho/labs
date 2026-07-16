import { useId, useMemo, useState } from "react";
import type { BatteryPoint } from "../hooks/useDashboardData";
import { formatKw, formatSimTime } from "../lib/power";

const WIDTH = 232;
const HEIGHT = 48;
const PAD = 4;

// Session trace of the battery level reported by each tick run. Single series,
// labeled by the surrounding card; y-scale is anchored 0..capacity so the line
// reads as state-of-charge, not a zoomed data range.
export function Sparkline({ points }: { points: BatteryPoint[] }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const capacity = Math.max(...points.map((p) => p.capacityKwh), 0.001);
    const minTick = points[0].sessionTick;
    const maxTick = points[points.length - 1].sessionTick;
    const tickSpan = Math.max(maxTick - minTick, 1);
    const coords = points.map((p) => ({
      x: PAD + ((p.sessionTick - minTick) / tickSpan) * (WIDTH - PAD * 2),
      y: PAD + (1 - p.energyKwh / capacity) * (HEIGHT - PAD * 2),
      point: p,
    }));
    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
    const area = `${line} L${coords[coords.length - 1].x},${HEIGHT - PAD} L${coords[0].x},${HEIGHT - PAD} Z`;
    return { coords, line, area };
  }, [points]);

  if (!geometry) return null;

  const { coords, line, area } = geometry;
  const active = hover === null ? coords[coords.length - 1] : coords[hover];

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i].x - x) < Math.abs(coords[best].x - x)) best = i;
    }
    setHover(best);
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--faint)",
          }}
        >
          Battery · session trace
        </span>
        <span
          className="tabular"
          style={{ fontSize: 11, color: "var(--muted)" }}
          aria-live="off"
        >
          {formatSimTime(active.point.sessionTick)} ·{" "}
          {formatKw(active.point.energyKwh, 1)} kWh
        </span>
      </div>
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Battery level over this session, from ${formatKw(points[0].energyKwh, 1)} to ${formatKw(points[points.length - 1].energyKwh, 1)} kilowatt hours`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block", cursor: "crosshair" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={active.x}
          x2={active.x}
          y1={PAD}
          y2={HEIGHT - PAD}
          stroke="var(--pill-border)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={active.x}
          cy={active.y}
          r="3.5"
          fill="var(--accent)"
          stroke="var(--card)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
