"use client";

import type { Unit } from "@/lib/format";

export function UnitToggle({
  unit,
  onChange,
}: {
  unit: Unit;
  onChange: (u: Unit) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border bg-surface text-sm">
      {(["c", "f"] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          aria-pressed={unit === u}
          className={
            "px-3 py-1.5 font-medium transition-colors " +
            (unit === u
              ? "bg-primary text-white"
              : "text-muted hover:text-primary")
          }
        >
          °{u.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
