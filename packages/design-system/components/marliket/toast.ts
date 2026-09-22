// Re-export sonner's imperative `toast` API from the design system, so apps fire
// toasts through `@repo/design-system` rather than depending on `sonner`
// directly. The `<Toaster/>` itself is mounted globally in DesignSystemProvider
// (see ../ui/sonner.tsx); this is only the call-side API.

export { toast } from "sonner";
