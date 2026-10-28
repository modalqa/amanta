"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders server data periodically while background work (extraction/AI) is pending. */
export function AutoRefresh({ seconds = 3, label = "…" }: { seconds?: number; label?: string }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return <p className="mb-3 text-xs text-gray-500" aria-live="polite">{label}</p>;
}
