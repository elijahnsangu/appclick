const InventorySkeletons = ["one", "two", "three", "four"];

export default function BusinessProfileLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading Business profile"
      className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:px-10"
      role="status"
    >
      <span className="sr-only">Loading Business profile</span>
      <div aria-hidden="true">
        <div className="h-4 w-56 animate-pulse rounded bg-marliket-bg-2 motion-reduce:animate-none" />
        <div className="mt-8 h-64 animate-pulse rounded-[2rem] bg-marliket-ink-0/90 motion-reduce:animate-none" />
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {InventorySkeletons.slice(0, 3).map((key) => (
            <div
              className="h-64 animate-pulse rounded-3xl bg-marliket-bg-2 motion-reduce:animate-none"
              key={key}
            />
          ))}
        </div>
        <div className="mt-12 h-9 w-80 max-w-full animate-pulse rounded bg-marliket-bg-2 motion-reduce:animate-none" />
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {InventorySkeletons.map((key) => (
            <div
              className="aspect-[4/5] animate-pulse rounded-3xl bg-marliket-bg-2 motion-reduce:animate-none"
              key={key}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
