"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { analyses } from "@/lib/registry";

/** Shell navigation. Reads the registry — never references analysis internals. */
export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="px-2 pb-3 pt-1">
        <div className="text-sm font-medium text-slate-900">Frontier</div>
        <div className="text-[11px] text-slate-400">Financial analysis</div>
      </div>
      <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Analyses
      </div>
      {analyses.map((a) => {
        const href = `/analyses/${a.slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={a.slug}
            href={href}
            title={a.description}
            className={`rounded-md px-2 py-1.5 text-[13px] leading-tight ${
              active
                ? "bg-slate-100 font-medium text-slate-900"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {a.title}
            {a.tags && a.tags.length > 0 ? (
              <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                {a.tags.join(" · ")}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
