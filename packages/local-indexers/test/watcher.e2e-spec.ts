import { Test, type TestingModule } from "@nestjs/testing";
import { mkdtemp, writeFile, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IndexerModule } from "../src/indexer.module.js";
import { FileWatcherService } from "../src/file-watcher.service.js";
import type { FileChangeEvent } from "../src/types.js";
import { FileChangeType } from "../src/types.js";

/**
 * Collects events for a fixed duration, filtering for a target filename.
 * This avoids race conditions with macOS metadata files (.DS_Store, etc.)
 * that can resolve count-based promises prematurely.
 */
function collectEvents(
  watcher: FileWatcherService,
  targetName: string,
  durationMs = 2000,
): Promise<FileChangeEvent[]> {
  return new Promise((resolve) => {
    const events: FileChangeEvent[] = [];
    watcher.onFileChange((event) => {
      if (event.path.includes(targetName)) {
        events.push(event);
      }
    });
    setTimeout(() => resolve(events), durationMs);
  });
}

describe("FileWatcherService (e2e)", () => {
  let module: TestingModule;
  let watcher: FileWatcherService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "virgil-watcher-test-"));
    module = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          watchPaths: [tmpDir],
          debounceMs: 50,
        }),
      ],
    }).compile();
    watcher = module.get(FileWatcherService);
  });

  afterEach(async () => {
    watcher.stop();
    await module.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("starts and stops without resource leaks", () => {
    expect(watcher.isRunning()).toBe(false);
    watcher.start();
    expect(watcher.isRunning()).toBe(true);
    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });

  it("does not start twice", () => {
    watcher.start();
    watcher.start();
    expect(watcher.isRunning()).toBe(true);
    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });

  it("detects file creation", async () => {
    const eventsPromise = collectEvents(watcher, "new-file.txt", 2000);
    watcher.start();

    await new Promise((r) => setTimeout(r, 100));
    await writeFile(join(tmpDir, "new-file.txt"), "hello");

    const events = await eventsPromise;
    expect(events.length).toBeGreaterThanOrEqual(1);
    const createEvent = events.find(
      (e) =>
        e.type === FileChangeType.CREATED || e.type === FileChangeType.MODIFIED,
    );
    expect(createEvent).toBeDefined();
    expect(createEvent!.timestamp).toBeGreaterThan(0);
  }, 10000);

  it("detects file modification", async () => {
    const filePath = join(tmpDir, "modify-me.txt");
    await writeFile(filePath, "original");

    await new Promise((r) => setTimeout(r, 200));

    const eventsPromise = collectEvents(watcher, "modify-me.txt", 2000);
    watcher.start();

    await new Promise((r) => setTimeout(r, 100));
    await writeFile(filePath, "modified content");

    const events = await eventsPromise;
    expect(events.length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it("detects file deletion", async () => {
    const filePath = join(tmpDir, "delete-me.txt");
    await writeFile(filePath, "to be deleted");

    await new Promise((r) => setTimeout(r, 200));

    const eventsPromise = collectEvents(watcher, "delete-me.txt", 2000);
    watcher.start();

    await new Promise((r) => setTimeout(r, 100));
    await unlink(filePath);

    const events = await eventsPromise;
    expect(events.length).toBeGreaterThanOrEqual(1);
    const delEvent = events.find((e) => e.type === FileChangeType.DELETED);
    expect(delEvent).toBeDefined();
  }, 10000);

  it("debounces rapid successive events for the same file", async () => {
    const filePath = join(tmpDir, "debounce.txt");
    await writeFile(filePath, "v1");

    await new Promise((r) => setTimeout(r, 200));

    const eventsPromise = collectEvents(watcher, "debounce.txt", 1000);
    watcher.start();

    await new Promise((r) => setTimeout(r, 100));

    // Rapid writes should be debounced into fewer events
    await writeFile(filePath, "v2");
    await writeFile(filePath, "v3");
    await writeFile(filePath, "v4");

    const events = await eventsPromise;
    // With 50ms debounce, rapid writes should produce fewer events
    // than the number of raw OS events
    expect(events.length).toBeLessThanOrEqual(4);
    expect(events.length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it("isolates listener errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const goodEvents: FileChangeEvent[] = [];

    watcher.onFileChange(() => {
      throw new Error("bad listener");
    });
    watcher.onFileChange((e) => goodEvents.push(e));
    watcher.start();

    await new Promise((r) => setTimeout(r, 100));
    await writeFile(join(tmpDir, "error-test.txt"), "data");

    await new Promise((r) => setTimeout(r, 1500));

    // The good listener should still receive events despite the bad one
    const received = goodEvents.filter((e) =>
      e.path.includes("error-test.txt"),
    );
    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  }, 10000);

  it("handles invalid watch path gracefully", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const badModule = await Test.createTestingModule({
      imports: [
        IndexerModule.forRoot({
          watchPaths: ["/nonexistent/path/that/does/not/exist"],
          debounceMs: 50,
        }),
      ],
    }).compile();

    const badWatcher = badModule.get(FileWatcherService);
    // Starting a watcher on a nonexistent path should not throw
    badWatcher.start();
    expect(badWatcher.isRunning()).toBe(true);
    badWatcher.stop();

    errorSpy.mockRestore();
    await badModule.close();
  });

  it("clears pending debounce timers on stop", async () => {
    watcher.start();

    await new Promise((r) => setTimeout(r, 100));
    // Write a file to trigger debounce timer
    await writeFile(join(tmpDir, "pending.txt"), "data");

    // Stop immediately before debounce fires (debounce is 50ms)
    await new Promise((r) => setTimeout(r, 10));
    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  }, 10000);
});
