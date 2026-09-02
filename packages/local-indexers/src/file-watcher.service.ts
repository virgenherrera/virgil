import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import {
  type FileChangeEvent,
  FileChangeType,
  type IndexerModuleOptions,
  INDEXER_OPTIONS,
  createTimestamp,
} from "./types.js";

export type FileChangeListener = (event: FileChangeEvent) => void;

@Injectable()
export class FileWatcherService implements OnModuleDestroy {
  private readonly watchers: FSWatcher[] = [];
  private readonly debounceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly listeners: FileChangeListener[] = [];
  private readonly debounceMs: number;
  private running = false;

  constructor(
    @Inject(INDEXER_OPTIONS)
    private readonly options: IndexerModuleOptions,
  ) {
    this.debounceMs = options.debounceMs ?? 500;
  }

  onModuleDestroy(): void {
    this.stop();
  }

  onFileChange(listener: FileChangeListener): void {
    this.listeners.push(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    for (const watchPath of this.options.watchPaths) {
      try {
        const watcher = watch(
          watchPath,
          { recursive: true },
          (eventType, filename) => {
            if (!filename) return;
            const fullPath = watchPath.endsWith("/")
              ? `${watchPath}${filename}`
              : `${watchPath}/${filename}`;
            this.debounce(fullPath, eventType);
          },
        );

        watcher.on("error", (err) => {
          console.error(`Watcher error for ${watchPath}:`, err.message);
        });

        this.watchers.push(watcher);
      } catch (err) {
        console.error(
          `Failed to start watcher for ${watchPath}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  stop(): void {
    this.running = false;
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers.length = 0;

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  isRunning(): boolean {
    return this.running;
  }

  private debounce(filePath: string, eventType: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      void this.emitEvent(filePath, eventType);
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  private async emitEvent(
    filePath: string,
    rawEventType: string,
  ): Promise<void> {
    let changeType: FileChangeType;

    try {
      await stat(filePath);
      changeType =
        rawEventType === "rename"
          ? FileChangeType.CREATED
          : FileChangeType.MODIFIED;
    } catch {
      changeType = FileChangeType.DELETED;
    }

    const event: FileChangeEvent = {
      type: changeType,
      path: filePath,
      timestamp: createTimestamp(),
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error(
          "File change listener error:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
}
