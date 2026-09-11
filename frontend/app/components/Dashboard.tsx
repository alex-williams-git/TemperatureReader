"use client";

import { Activity } from "lucide-react";
import { useLocalStorageState } from "@/lib/useLocalStorageState";
import { useIsClient } from "@/lib/clientHooks";
import type { Unit } from "@/lib/format";
import { AmbientBackground } from "./AmbientBackground";
import { LiveReading } from "./LiveReading";
import { HistoryChart } from "./HistoryChart";
import { ThemeToggle } from "./ThemeToggle";
import { UnitToggle } from "./UnitToggle";
import { ClockTickSetter } from "./ClockTickSetter";

export function Dashboard() {
  const [unit, setUnit] = useLocalStorageState<Unit>("dht.unit", "c");
  const [tickSeconds, setTickSeconds] = useLocalStorageState<number>("dht.tickSeconds", 60);

  // This whole dashboard is live/clock/locale/localStorage-driven — nothing
  // here is meaningful to server-render. Gate on the client so the server and
  // the first client render agree (skeleton), then paint the real thing.
  const ready = useIsClient();

  return (
    <>
      <AmbientBackground />
      {!ready ? (
        <main className="mx-auto max-w-4xl px-4 py-8">
          <div className="h-10 w-48 animate-pulse rounded-lg bg-surface-2" />
          <div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface-2" />
          <div className="mt-6 h-160 animate-pulse rounded-2xl bg-surface-2" />
        </main>
      ) : (
        <DashboardBody unit={unit} setUnit={setUnit} tickSeconds={tickSeconds} setTickSeconds={setTickSeconds} />
      )}
    </>
  );
}

function DashboardBody({
  unit,
  setUnit,
  tickSeconds,
  setTickSeconds,
}: {
  unit: Unit;
  tickSeconds: number;
  setUnit: (u: Unit) => void;
  setTickSeconds: (seconds: number) => void;
}) {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-humidity text-white shadow-lg shadow-primary/30 ring-1 ring-white/15">
          <Activity size={20} />
        </span>
        <div className="mr-auto">
          <h1 className="text-lg font-semibold leading-tight">DHT11 Monitor</h1>
          <p className="text-xs text-muted">Temperature &amp; humidity · Arduino Uno</p>
        </div>
        <UnitToggle unit={unit} onChange={setUnit} />
        <ThemeToggle />
      </header>

      <ClockTickSetter tickSeconds={tickSeconds} onChange={setTickSeconds} />
      <LiveReading unit={unit} />
      <HistoryChart unit={unit} tickSeconds={tickSeconds}/>

      <footer className="pb-4 text-center text-xs text-muted">
        Polls the FastAPI backend · readings stored in SQLite
      </footer>
    </main>
  );
}
