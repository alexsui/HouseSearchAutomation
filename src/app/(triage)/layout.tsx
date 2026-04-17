export default function TriageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <h1 className="font-semibold">House Search Triage</h1>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="text-sm text-gray-600 hover:underline">
            Log out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
