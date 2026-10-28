import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card max-w-md text-center">
        <h1 className="mb-2 text-lg font-semibold">Tidak ditemukan / Not found</h1>
        <p className="mb-4 text-sm text-gray-600">Data tidak ada atau Anda tidak memiliki akses.</p>
        <Link className="btn btn-primary" href="/app">Ke dasbor</Link>
      </div>
    </main>
  );
}
