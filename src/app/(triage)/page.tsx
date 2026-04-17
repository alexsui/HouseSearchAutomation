import { fetchCandidateList } from "@/services/repositories/views";
import { Filters } from "@/ui/Filters";
import { ListingCard } from "@/ui/ListingCard";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; level?: string; district?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const rows = await fetchCandidateList({
    status: params.status,
    scoreLevel: params.level,
    district: params.district,
    sort: (params.sort as "notified" | "seen" | undefined) ?? "notified",
  });

  return (
    <div>
      <Filters />
      {rows.length === 0 ? (
        <p className="text-gray-500">No candidates yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <ListingCard key={r.listing_id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}
