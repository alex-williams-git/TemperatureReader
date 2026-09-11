"use client";

import useSWR from "swr";
import { fetcher, type Reading } from "@/lib/api";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// Map the live reading onto two 0..1 knobs the CSS reads:
//  - warmth: calibrated to this machine's observed range — 23-30°C at idle /
//    light load, 32-37°C under sustained load, ~44°C peak while gaming. So
//    everyday temps stay cool-ish and only a genuinely hot box glows amber.
//    Mapped on Celsius so the °C/°F toggle doesn't change the mood.
//  - mist: dry air (<35% RH) barely registers; ~75%+ gives a visible haze.
const warmth = (tempC: number) => clamp01((tempC - 23) / (44 - 23));
const mistFor = (humidity: number) => clamp01((humidity - 35) / 40);

export function AmbientBackground() {
  // Same SWR key as <LiveReading>, so this shares that poll — no extra request.
  const { data } = useSWR<Reading>("/readings/latest", fetcher, {
    refreshInterval: 5000,
    keepPreviousData: true,
  });

  const warmthLevel = data ? warmth(data.temp_c) : 0;
  const mist = data ? mistFor(data.humidity) : 0.12;

  return (
    <div
      className="ambient"
      aria-hidden
      style={
        {
          "--warmth": warmthLevel.toFixed(3),
          "--mist": mist.toFixed(3),
        } as React.CSSProperties
      }
    >
      <div className="ambient__wash" />
      <div className="ambient__mist ambient__mist--a" />
      <div className="ambient__mist ambient__mist--b" />
      <div className="ambient__mist ambient__mist--c" />
    </div>
  );
}
