import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  superviseWorkerProcess,
  workerProcessExitCode,
} from "./worker-process-lifecycle.ts";

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly kill = vi.fn((_signal: NodeJS.Signals) => true);
}

describe("superviseWorkerProcess", () => {
  it("closes infrastructure once when spawning the Worker fails", async () => {
    const child = new FakeChildProcess();
    const cleanup = vi.fn(() => Promise.resolve());
    const supervisor = superviseWorkerProcess(child, cleanup, 5);
    const spawnError = new Error("spawn failed");

    child.emit("error", spawnError);

    await expect(supervisor.completion).resolves.toEqual({
      error: spawnError,
      kind: "ERROR",
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("escalates an unresponsive Worker and bounds cleanup", async () => {
    const child = new FakeChildProcess();
    const cleanup = vi.fn(() => Promise.resolve());
    const supervisor = superviseWorkerProcess(child, cleanup, 5);

    await supervisor.stop();

    expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
    await expect(supervisor.completion).resolves.toEqual({ kind: "TIMEOUT" });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("uses close as the authoritative normal completion event", async () => {
    const child = new FakeChildProcess();
    const cleanup = vi.fn(() => Promise.resolve());
    const supervisor = superviseWorkerProcess(child, cleanup, 5);

    child.exitCode = 0;
    child.emit("close", 0, null);

    await expect(supervisor.completion).resolves.toEqual({
      code: 0,
      kind: "CLOSE",
      signal: null,
    });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("fails the run when the Worker survives escalation, even on a requested stop", () => {
    expect(workerProcessExitCode({ kind: "TIMEOUT" }, true)).toBe(1);
    expect(workerProcessExitCode({ kind: "TIMEOUT" }, false)).toBe(1);
    expect(
      workerProcessExitCode(
        { error: new Error("spawn failed"), kind: "ERROR" },
        true
      )
    ).toBe(1);
    expect(
      workerProcessExitCode(
        { code: null, kind: "CLOSE", signal: "SIGTERM" },
        true
      )
    ).toBe(0);
    expect(
      workerProcessExitCode({ code: 0, kind: "CLOSE", signal: null }, false)
    ).toBe(0);
    expect(
      workerProcessExitCode({ code: 1, kind: "CLOSE", signal: null }, false)
    ).toBe(1);
  });

  it("shares repeated stop requests and cleans up once", async () => {
    const child = new FakeChildProcess();
    const cleanup = vi.fn(() => Promise.resolve());
    const supervisor = superviseWorkerProcess(child, cleanup, 20);

    const firstStop = supervisor.stop();
    const secondStop = supervisor.stop();
    child.signalCode = "SIGTERM";
    child.emit("close", null, "SIGTERM");
    await Promise.all([firstStop, secondStop]);

    expect(child.kill.mock.calls).toEqual([["SIGTERM"]]);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
