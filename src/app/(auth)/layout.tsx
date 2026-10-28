import Link from "next/link";
import { Logo } from "@/components/marketing";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-white px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          {/* Back to the public site; signed-in users are sent on to /app by the home page. */}
          <Link href="/" aria-label="Amanta – beranda" className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"><Logo /></Link>
          <div className="mt-2 text-sm text-gray-600">Operasi Keamanan &amp; Mutu Pangan</div>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
