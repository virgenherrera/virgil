import { Test, type TestingModule } from "@nestjs/testing";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ReactiveModule } from "../reactive/reactive.module.js";
import { EventRouterService } from "../reactive/event-router.service.js";
import { CursorStoreService } from "../reactive/cursor-store.service.js";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import type { VirgilEvent } from "../reactive/event.types.js";
import { createTestDir, cleanTestDir } from "./test-helpers.js";

describe("reactive events", () => {
  describe("event router", () => {
    let module: TestingModule;
    let eventRouter: EventRouterService;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          CapabilityRegistryModule,
          ProviderRegistryModule,
          ReactiveModule,
        ],
      }).compile();

      eventRouter = module.get(EventRouterService);
    });

    afterEach(async () => {
      await module.close();
    });

    it("routes events to registered handlers", async () => {
      const received: VirgilEvent[] = [];

      eventRouter.on("ticket-updated", async (event) => {
        received.push(event);
      });

      const event: VirgilEvent = {
        kind: "ticket-updated",
        ref: "ticket://jira/TEST-1",
        timestamp: new Date().toISOString(),
        source: "test",
        payload: { status: "done" },
      };

      await eventRouter.route(event);

      expect(received).toHaveLength(1);
      expect(received[0]!.ref).toBe("ticket://jira/TEST-1");
    });

    it("handles multiple handlers for same event kind", async () => {
      let count = 0;

      eventRouter.on("commit-pushed", async () => {
        count += 1;
      });
      eventRouter.on("commit-pushed", async () => {
        count += 1;
      });

      const event: VirgilEvent = {
        kind: "commit-pushed",
        ref: "sourcecode://git/abc123",
        timestamp: new Date().toISOString(),
        source: "test",
        payload: {},
      };

      await eventRouter.route(event);

      expect(count).toBe(2);
    });

    it("catches and logs handler errors without stopping", async () => {
      const results: string[] = [];
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      eventRouter.on("doc-changed", async () => {
        throw new Error("Handler 1 failed");
      });
      eventRouter.on("doc-changed", async () => {
        results.push("handler-2-ok");
      });

      const event: VirgilEvent = {
        kind: "doc-changed",
        ref: "dogma://local/doc1",
        timestamp: new Date().toISOString(),
        source: "test",
        payload: {},
      };

      await eventRouter.route(event);

      expect(results).toEqual(["handler-2-ok"]);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("cursor store", () => {
    let module: TestingModule;
    let cursorStore: CursorStoreService;
    let testDir: string;
    let cwdSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      testDir = createTestDir();
      cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(testDir);

      module = await Test.createTestingModule({
        imports: [
          CapabilityRegistryModule,
          ProviderRegistryModule,
          ReactiveModule,
        ],
      }).compile();

      cursorStore = module.get(CursorStoreService);
    });

    afterEach(async () => {
      await module.close();
      cwdSpy.mockRestore();
      cleanTestDir(testDir);
    });

    it("returns empty map when no cursors file exists", async () => {
      const cursors = await cursorStore.load();

      expect(cursors.size).toBe(0);
    });

    it("persists and retrieves cursors", async () => {
      const now = new Date();
      await cursorStore.updateCursor("provider-a", now);

      const cursor = await cursorStore.getCursor("provider-a");

      expect(cursor).toBeDefined();
      expect(cursor!.providerId).toBe("provider-a");
      expect(cursor!.lastSeen).toBe(now.toISOString());
    });

    it("updates existing cursor", async () => {
      const first = new Date("2024-01-01T00:00:00Z");
      const second = new Date("2024-06-01T00:00:00Z");

      await cursorStore.updateCursor("provider-b", first);
      await cursorStore.updateCursor("provider-b", second);

      const cursor = await cursorStore.getCursor("provider-b");

      expect(cursor!.lastSeen).toBe(second.toISOString());
    });
  });
});
