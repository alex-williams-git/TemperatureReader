"use client";

import { useEffect, useState } from "react";
import { Check, Timer } from "lucide-react";
import { getTickSeconds } from "@/lib/format";

export function ClockTickSetter({
    tickSeconds,
    onChange,
}: {
    tickSeconds: number;
    onChange: (seconds: number) => void;
}){
    const [draft, setDraft] = useState(tickSeconds.toString());
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!saved) return;
        const id = setTimeout(() => setSaved(false), 1500);
        return () => clearTimeout(id);
        }, [saved]);

    return(
        <section className="panel flex flex-wrap items-center gap-3 p-4">
            <label htmlFor="tick-seconds" className="flex items-center gap-2 text-sm font-medium text-muted">
                <Timer size={16} className="text-primary" />
                Live update interval
            </label>

            <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    onChange(Number(getTickSeconds(Number(draft))));
                    setSaved(true);
                }}
            >
                <input
                    id="tick-seconds"
                    type="text"
                    inputMode="numeric"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="5–60"
                    className="w-20 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm tabular-nums text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-xs text-muted">sec</span>

                <button
                    type="submit"
                    className={
                        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-sm transition active:scale-95 " +
                        (saved ? "bg-ok" : "bg-primary hover:bg-primary-hover")
                    }
                >
                    {saved ? <Check size={14} /> : null}
                    {saved ? "Saved" : "Submit"}
                </button>
            </form>
        </section>
    );
}
