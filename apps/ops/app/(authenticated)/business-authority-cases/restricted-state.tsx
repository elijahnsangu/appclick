import { ShieldAlert } from "lucide-react";

export function RestrictedState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-marliket-line bg-marliket-bg-1 p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-marliket-bg-2">
        <ShieldAlert aria-hidden="true" className="size-5" />
      </div>
      <h1 className="font-semibold text-2xl">{title}</h1>
      <p className="mt-3 text-marliket-ink-2 leading-7">{description}</p>
    </section>
  );
}
