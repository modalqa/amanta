"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function NavLinks({ groups }: { groups: Array<{ title: string; items: Array<{ href: string; label: string }> }> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <nav className="px-2 pb-4">
      <button type="button" className="btn btn-secondary mb-2 w-full lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open}>☰ Menu</button>
      <div className={`${open ? "block" : "hidden"} lg:block`}>
        {groups.filter((g) => g.items.length).map((g) => (
          <div key={g.title} className="mb-3">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{g.title}</div>
            {g.items.map((i) => {
              const active = i.href === "/app" ? path === "/app" : path.startsWith(i.href);
              return (
                <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className={`block rounded-md px-2 py-1.5 text-sm ${active ? "bg-brand-50 font-medium text-brand-700" : "text-gray-700 hover:bg-gray-50"}`}>
                  {i.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
