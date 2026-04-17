import Link from "next/link";
import type { CandidateListRow } from "@/services/repositories/views";

export function ListingCard({ row }: { row: CandidateListRow }) {
  return (
    <Link
      href={`/listings/${row.listing_id}`}
      className="block rounded border bg-white p-4 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{row.title}</div>
          <div className="text-sm text-gray-600">
            {row.district} · {row.layout} · TWD {row.rent_price.toLocaleString()}/mo
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium">{row.score_level ?? "?"}</div>
          <div className="text-gray-500">{row.triage_status}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        photo: {row.photo_review ?? "?"} · appliance: {row.appliance_review ?? "?"} ·
        notified: {row.last_notified_at ? new Date(row.last_notified_at).toLocaleString() : "—"}
      </div>
    </Link>
  );
}
