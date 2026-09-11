"use client";

import { useState } from "react";

export function ClockTickSetter({
    tickSeconds,
    onChange,
}: {
    tickSeconds: number;
    onChange: (seconds: number) => void;
}){
    const [draft, setDraft] = useState(tickSeconds.toString());

    return(
        <div className="inline-flex overflow-hidden rounded-lg border border-border bg-surface text-sm">
            <form onSubmit={(e) => {e.preventDefault(); onChange(Number(getTickSeconds(Number(draft))));}}>
                <input type="text" value={draft} className="w-32" placeholder="5 - 60 seconds"
                    onChange={(e) => setDraft(e.target.value)} />
                <button type="submit" className="px-3 py-1.5 font-medium transition active:scale-95 text-muted hover:text-primary hover:bg-primary-soft/50">
                    Submit
                </button>
            </form>
        </div>
    );
}

function getTickSeconds(tickSeconds: number): string {
    if (Number.isNaN(tickSeconds)) return "60"; // Default to 60 seconds if input is not a number
    if (tickSeconds < 5) return "5"; // Minimum tick is 5 seconds. Anything below 0 would break.
    if (tickSeconds > 60) return "60"; // Maximum tick is 60 seconds

    return tickSeconds.toString();
}