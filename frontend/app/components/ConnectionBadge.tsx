"use client";

import { Radio, TriangleAlert, WifiOff } from "lucide-react";
import type { Health } from "@/lib/api";

export function ConnectionBadge({
  health,
  error,
}: {
  health: Health | undefined;
  error: unknown;
}) {
  let tone = "text-muted";
  let dot = "bg-muted";
  let Icon = Radio;
  let label = "Connecting…";

  if (error) {
    tone = "text-bad";
    dot = "bg-bad";
    Icon = WifiOff;
    label = "API offline";
  } else if (health) {
    if (health.serial_connected) {
      tone = "text-ok";
      dot = "bg-ok";
      Icon = Radio;
      label = "Sensor live";
    } else {
      tone = "text-warn";
      dot = "bg-warn";
      Icon = TriangleAlert;
      label = "No sensor";
    }
  }

  const live = label === "Sensor live";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/70 px-2.5 py-1.5 text-xs font-medium backdrop-blur ${tone}`}
      title={
        health?.serial_last_error ??
        (error ? String(error) : undefined) ??
        `${health?.total_readings ?? 0} readings stored`
      }
    >
      <span
        className={`inline-flex h-2 w-2 rounded-full ${dot} ${live ? "badge-breathe" : ""}`}
      />
      <Icon size={13} />
      {label}
    </span>
  );
}
