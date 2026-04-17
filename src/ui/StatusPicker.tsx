"use client";
import { useState } from "react";

const STATUSES = ["New", "Interested", "Contacted", "Viewing", "Rejected", "Archived"];

export function StatusPicker({
  listingId,
  current,
}: {
  listingId: string;
  current: string;
}) {
  const [status, setStatus] = useState(current);
  const [busy, setBusy] = useState(false);

  async function update(next: string) {
    setBusy(true);
    const prev = status;
    setStatus(next);
    const res = await fetch("/api/triage/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listing_id: listingId, status: next }),
    });
    if (!res.ok) setStatus(prev);
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {STATUSES.map((s) => (
        <button
          key={s}
          disabled={busy}
          onClick={() => update(s)}
          className={`rounded border px-3 py-1 text-sm ${s === status ? "bg-black text-white" : "bg-white"}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
