export default function PublicVehicleLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading vehicle details"
      className="mx-auto max-w-7xl animate-pulse px-4 py-8 motion-reduce:animate-none sm:px-6 lg:px-8"
      role="status"
    >
      <span className="sr-only">Loading vehicle details</span>
      <div className="h-4 w-64 rounded bg-marliket-bg-2" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <div className="aspect-[4/3] rounded-3xl bg-marliket-bg-2" />
          <div className="h-10 w-3/4 rounded bg-marliket-bg-2" />
          <div className="h-48 rounded-3xl bg-marliket-bg-2" />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="aspect-[4/5] rounded-3xl bg-marliket-bg-2" />
            <div className="aspect-[4/5] rounded-3xl bg-marliket-bg-2" />
          </div>
        </div>
        <div className="h-72 rounded-3xl bg-marliket-bg-2" />
      </div>
    </main>
  );
}
