export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-white px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-brand-700">Amanta</div>
          <div className="text-sm text-gray-600">Operasi Keamanan &amp; Mutu Pangan</div>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
