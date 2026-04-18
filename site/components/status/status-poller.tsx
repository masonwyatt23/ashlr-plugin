"use client";

/**
 * status-poller.tsx — Client component that polls /status/current every 30s
 * and updates the overall status indicator dot without a full page reload.
 */

import { useEffect, useState } from "react";
import type { OverallStatus } from "./types";

const API_BASE   = process.env["NEXT_PUBLIC_API_URL"] ?? "https://api.ashlr.ai";
const POLL_MS    = 30_000;

const STRIP_COLORS: Record<OverallStatus, string> = {
  operational:   "#4F5B3F",
  partial_outage: "#d9793a",
  major_outage:  "#8B2E1A",
  unknown:       "#4a5568",
};

const STRIP_LABELS: Record<OverallStatus, string> = {
  operational:   "All systems operational",
  partial_outage: "Partial outage",
  major_outage:  "Major outage",
  unknown:       "Status unknown",
};

interface StatusPollerProps {
  initialStatus: OverallStatus;
}

export default function StatusPoller({ initialStatus }: StatusPollerProps) {
  const [overall, setOverall] = useState<OverallStatus>(initialStatus);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/status/current`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json() as { overall?: OverallStatus };
          if (data.overall) setOverall(data.overall);
        }
      } catch {
        // silently ignore — stale indicator is better than a console error
      }
    }

    timer = setInterval(() => { void poll(); }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const color = STRIP_COLORS[overall] ?? STRIP_COLORS.unknown;
  const label = STRIP_LABELS[overall] ?? "Status unknown";

  return (
    <div
      style={{
        background: color,
        padding: "14px 0",
        textAlign: "center",
      }}
    >
      <div
        className="wrap"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.85)",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.05em",
            color: "rgba(255,255,255,0.95)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
