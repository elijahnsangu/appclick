"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { FileUp, RotateCcw, X } from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useRef, useState } from "react";

type UploadQueueState =
  | "FAILED"
  | "QUEUED"
  | "READY"
  | "REMOVED"
  | "UPLOADING"
  | "VERIFYING";

interface UploadQueueItem {
  readonly context: string;
  readonly error: string | null;
  readonly file: File;
  readonly id: string;
  readonly progress: number;
  readonly state: UploadQueueState;
}

export interface ListingAssetUploadControls {
  readonly setProgress: (percentage: number) => void;
  readonly setVerifying: () => void;
  readonly signal: AbortSignal;
}

interface ListingAssetUploadQueueProperties {
  readonly accept: string;
  readonly collectionLabel: string;
  readonly context: string;
  readonly description: string;
  readonly disabled: boolean;
  readonly inputId: string;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onError: (error: unknown) => void;
  readonly upload: (
    file: File,
    context: string,
    controls: ListingAssetUploadControls
  ) => Promise<void>;
}

function uploadErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The upload failed. Retry or choose a replacement file.";
}

function statusText(item: UploadQueueItem) {
  if (item.state === "QUEUED") {
    return "Queued";
  }
  if (item.state === "UPLOADING") {
    return `Uploading ${item.progress}%`;
  }
  if (item.state === "VERIFYING") {
    return "Verifying upload";
  }
  if (item.state === "READY") {
    return "Ready and attached to draft";
  }
  if (item.state === "REMOVED") {
    return "Removed from upload queue";
  }
  return item.error ?? "Upload failed";
}

export function ListingAssetUploadQueue({
  accept,
  collectionLabel,
  context,
  description,
  disabled,
  inputId,
  onBusyChange,
  onError,
  upload,
}: ListingAssetUploadQueueProperties) {
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const previousStates = useRef(new Map<string, UploadQueueState>());
  const readyStatuses = useRef(new Map<string, HTMLParagraphElement>());
  const retryButtons = useRef(new Map<string, HTMLButtonElement>());
  const lifecycle = useRef({ mounted: true });
  const busy = items.some(
    (item) =>
      item.state === "QUEUED" ||
      item.state === "UPLOADING" ||
      item.state === "VERIFYING"
  );
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => {
    for (const item of items) {
      const previousState = previousStates.current.get(item.id);
      if (previousState === item.state) {
        continue;
      }
      if (item.state === "READY") {
        readyStatuses.current.get(item.id)?.focus();
      } else if (item.state === "FAILED") {
        retryButtons.current.get(item.id)?.focus();
      }
    }
    previousStates.current = new Map(
      items.map((item) => [item.id, item.state])
    );
  }, [items]);
  useEffect(() => {
    lifecycle.current.mounted = true;
    return () => {
      lifecycle.current.mounted = false;
      for (const controller of controllers.current.values()) {
        controller.abort();
      }
      controllers.current.clear();
    };
  }, []);

  function updateItem(id: string, patch: Partial<UploadQueueItem>) {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: React cleanup mutates this ref before pending upload callbacks resume.
    if (!lifecycle.current.mounted) {
      return;
    }
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  async function runUpload(id: string, file: File, uploadContext: string) {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: React cleanup mutates this ref before queued upload work begins.
    if (!lifecycle.current.mounted) {
      return;
    }
    const controller = new AbortController();
    controllers.current.set(id, controller);
    updateItem(id, {
      error: null,
      file,
      progress: 0,
      state: "UPLOADING",
    });
    try {
      await upload(file, uploadContext, {
        setProgress: (percentage) =>
          updateItem(id, {
            progress: Math.max(0, Math.min(100, Math.round(percentage))),
            state: "UPLOADING",
          }),
        setVerifying: () =>
          updateItem(id, { progress: 100, state: "VERIFYING" }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        updateItem(id, { error: null, state: "REMOVED" });
      } else {
        updateItem(id, { progress: 100, state: "READY" });
      }
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        updateItem(id, { error: null, state: "REMOVED" });
      } else {
        updateItem(id, { error: uploadErrorMessage(error), state: "FAILED" });
        onError(error);
      }
    } finally {
      controllers.current.delete(id);
    }
  }

  function enqueue(files: readonly File[]) {
    const queued = files.map((file) => ({
      context,
      error: null,
      file,
      id: crypto.randomUUID(),
      progress: 0,
      state: "QUEUED" as const,
    }));
    setItems((current) => [...current, ...queued]);
    for (const item of queued) {
      queueMicrotask(() => runUpload(item.id, item.file, item.context));
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    enqueue([...(event.currentTarget.files ?? [])]);
    event.currentTarget.value = "";
  }

  function handleDrop(event: DragEvent<HTMLFieldSetElement>) {
    event.preventDefault();
    if (!disabled) {
      enqueue([...event.dataTransfer.files]);
    }
  }

  return (
    <div className="space-y-4">
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: The labelled fieldset is the visual drop target and contains the equivalent native file input. */}
      <fieldset
        aria-label={`Drop ${collectionLabel} files`}
        className="rounded-xl border border-marliket-line border-dashed bg-marliket-bg-2 p-4"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="flex items-start gap-3">
          <FileUp aria-hidden="true" className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <Label htmlFor={inputId}>Choose {collectionLabel} files</Label>
            <p className="mt-1 text-marliket-ink-2 text-xs leading-5">
              {description} You can select multiple files or drag them here.
            </p>
            <Input
              accept={accept}
              className="mt-3"
              disabled={disabled}
              id={inputId}
              multiple
              onChange={handleFiles}
              type="file"
            />
          </div>
        </div>
      </fieldset>

      <ul aria-label={`${collectionLabel} upload queue`} className="space-y-3">
        {items.map((item) => {
          const active =
            item.state === "QUEUED" ||
            item.state === "UPLOADING" ||
            item.state === "VERIFYING";
          const replaceable =
            item.state === "FAILED" || item.state === "REMOVED";
          return (
            <li
              className="min-w-0 rounded-xl border border-marliket-line p-4"
              data-state={item.state.toLowerCase()}
              key={item.id}
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{item.file.name}</p>
                  <p
                    className={
                      item.state === "FAILED"
                        ? "mt-1 text-destructive text-sm"
                        : "mt-1 text-marliket-ink-2 text-sm"
                    }
                    ref={(node) => {
                      if (node) {
                        readyStatuses.current.set(item.id, node);
                      } else {
                        readyStatuses.current.delete(item.id);
                      }
                    }}
                    role={item.state === "FAILED" ? "alert" : "status"}
                    tabIndex={item.state === "READY" ? -1 : undefined}
                  >
                    {statusText(item)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {active ? (
                    <Button
                      aria-label={`Cancel ${item.file.name}`}
                      onClick={() => {
                        controllers.current.get(item.id)?.abort();
                        updateItem(item.id, { error: null, state: "REMOVED" });
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <X aria-hidden="true" />
                      Cancel
                    </Button>
                  ) : null}
                  {item.state === "FAILED" ? (
                    <Button
                      aria-label={`Retry ${item.file.name}`}
                      onClick={() =>
                        runUpload(item.id, item.file, item.context)
                      }
                      ref={(node) => {
                        if (node) {
                          retryButtons.current.set(item.id, node);
                        } else {
                          retryButtons.current.delete(item.id);
                        }
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RotateCcw aria-hidden="true" />
                      Retry
                    </Button>
                  ) : null}
                  {item.state === "READY" || item.state === "REMOVED" ? (
                    <Button
                      aria-label={`Dismiss ${item.file.name}`}
                      onClick={() =>
                        setItems((current) =>
                          current.filter(
                            (candidate) => candidate.id !== item.id
                          )
                        )
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Dismiss
                    </Button>
                  ) : null}
                </div>
              </div>
              {active ? (
                <progress
                  aria-label={`${item.file.name} upload progress`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={item.progress}
                  className="mt-3 h-2 w-full accent-marliket-red"
                  max={100}
                  value={item.progress}
                />
              ) : null}
              {replaceable ? (
                <div className="mt-3">
                  <Label htmlFor={`${inputId}-${item.id}-replacement`}>
                    Replace {item.file.name}
                  </Label>
                  <Input
                    accept={accept}
                    className="mt-2"
                    id={`${inputId}-${item.id}-replacement`}
                    onChange={(event) => {
                      const replacement = event.currentTarget.files?.[0];
                      if (replacement) {
                        runUpload(item.id, replacement, item.context);
                      }
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
