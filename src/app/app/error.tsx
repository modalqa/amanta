"use client";

/** Friendly error boundary for the app area. Details are logged server-side; only the digest is shown. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg text-center">
      <h1 className="mb-2 text-lg font-semibold">Terjadi kesalahan / Something went wrong</h1>
      <p className="mb-4 text-sm text-gray-600">Silakan coba lagi. Jika berulang, hubungi administrator dengan kode berikut.</p>
      {error.digest && <code className="mb-4 block text-xs text-gray-500">{error.digest}</code>}
      <button className="btn btn-primary" onClick={() => reset()}>Coba lagi</button>
    </div>
  );
}
