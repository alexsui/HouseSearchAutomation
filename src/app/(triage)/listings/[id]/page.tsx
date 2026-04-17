import { notFound } from "next/navigation";
import { fetchCandidateDetail } from "@/services/repositories/views";
import { StatusPicker } from "@/ui/StatusPicker";
import { NoteEditor } from "@/ui/NoteEditor";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchCandidateDetail(id);
  if (!detail) notFound();

  const { listing, reviews, notifications, changes, triage } = detail;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <a href={listing.source_url} className="text-sm text-blue-600 underline" target="_blank" rel="noopener noreferrer">
          Open 591 listing ↗
        </a>
        <h2 className="mt-1 text-xl font-semibold">{listing.title}</h2>
        <p className="text-sm text-gray-600">
          {listing.district} · {listing.layout} · TWD {listing.rent_price.toLocaleString()} ·{" "}
          {listing.area_ping ?? "?"} ping · {listing.floor ?? "?"}
        </p>
        <p className="mt-1 text-sm text-gray-500">{listing.address_summary}</p>
      </div>

      <section>
        <h3 className="mb-2 font-medium">Triage</h3>
        <StatusPicker listingId={listing.id} current={triage.status} />
        <div className="mt-3">
          <NoteEditor listingId={listing.id} current={triage.note} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Reviews</h3>
        <ul className="flex flex-col gap-2 text-sm">
          {reviews.map((r) => (
            <li key={r.id} className="rounded border bg-white p-3">
              <div className="text-gray-500">{new Date(r.reviewed_at).toLocaleString()}</div>
              <div>
                <b>{r.score_level}</b> · photo {r.photo_review} · appliance {r.appliance_review}
              </div>
              <div>Seen: {r.appliances_seen.join(", ") || "—"}</div>
              <div>Unknown: {r.appliances_missing_or_unknown.join(", ") || "—"}</div>
              <div>Reason: {r.recommendation_reason}</div>
              {r.concerns.length > 0 && <div>Concerns: {r.concerns.join("; ")}</div>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Notifications</h3>
        <ul className="text-sm">
          {notifications.map((n) => (
            <li key={n.id}>
              {new Date(n.created_at).toLocaleString()} · {n.event_type} ·{" "}
              <span className={n.status === "sent" ? "text-green-700" : "text-red-600"}>
                {n.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Changes</h3>
        <ul className="text-sm">
          {changes.map((c) => (
            <li key={c.id}>
              {new Date(c.created_at).toLocaleString()} · {c.change_type} — {c.change_summary}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
