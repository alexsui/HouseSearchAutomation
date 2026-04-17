"use client";
import { useState } from "react";

export function NoteEditor({
  listingId,
  current,
}: {
  listingId: string;
  current: string | null;
}) {
  const [note, setNote] = useState(current ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    const res = await fetch("/api/triage/note", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listing_id: listingId, note }),
    });
    if (res.ok) setSaved(true);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="min-h-[100px] rounded border px-3 py-2 text-sm"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save note"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
      </div>
    </div>
  );
}
