"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const STATUSES = ["New", "Interested", "Contacted", "Viewing", "Rejected", "Archived"];
const LEVELS = ["strong", "normal", "loose"];

export function Filters() {
  const params = useSearchParams();
  const pathname = usePathname();

  function hrefWith(key: string, value: string | null) {
    const p = new URLSearchParams(params.toString());
    if (value === null) p.delete(key);
    else p.set(key, value);
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="mb-4 flex flex-wrap gap-4 text-sm">
      <div>
        <span className="mr-2 text-gray-500">Status:</span>
        <Link href={hrefWith("status", null)} className="mr-2 underline">
          All
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={hrefWith("status", s)} className="mr-2 underline">
            {s}
          </Link>
        ))}
      </div>
      <div>
        <span className="mr-2 text-gray-500">Level:</span>
        <Link href={hrefWith("level", null)} className="mr-2 underline">
          All
        </Link>
        {LEVELS.map((l) => (
          <Link key={l} href={hrefWith("level", l)} className="mr-2 underline">
            {l}
          </Link>
        ))}
      </div>
      <div>
        <span className="mr-2 text-gray-500">Sort:</span>
        <Link href={hrefWith("sort", "notified")} className="mr-2 underline">
          Notified
        </Link>
        <Link href={hrefWith("sort", "seen")} className="mr-2 underline">
          Seen
        </Link>
      </div>
    </div>
  );
}
