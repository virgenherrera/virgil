import { Test, type TestingModule } from "@nestjs/testing";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { PlanningModule } from "../planning/planning.module.js";
import { PlanningService } from "../planning/planning.service.js";
import { DOC_KIND, TASK_STATUS } from "../planning/planning.types.js";

describe("planning service", () => {
  let module: TestingModule;
  let planningService: PlanningService;
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    testDir = realpathSync(mkdtempSync(join(tmpdir(), "virgil-planning-")));
    originalCwd = process.cwd();
    process.chdir(testDir);

    module = await Test.createTestingModule({
      imports: [PlanningModule],
    }).compile();

    planningService = module.get(PlanningService);
  });

  afterEach(async () => {
    await module.close();
    process.chdir(originalCwd);
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("write", () => {
    it("writes an idea document to docs/idea.md", () => {
      const doc = planningService.write({
        kind: DOC_KIND.IDEA,
        content: "# My Idea\n\nSome content.",
      });

      expect(doc.filePath).toBe(join(testDir, "docs", "idea.md"));
      expect(doc.meta.doc_kind).toBe("idea");
      expect(doc.meta.slug).toBe("idea");
      expect(doc.meta.status).toBeNull();
    });

    it("writes a requirement document with category into a categorized filename", () => {
      const doc = planningService.write({
        kind: DOC_KIND.REQUIREMENT,
        slug: "login",
        category: "auth",
        content: "# Login requirement",
      });

      expect(doc.filePath).toBe(
        join(testDir, "docs", "requirements", "auth-login.md"),
      );
      expect(doc.meta.category).toBe("auth");
      expect(doc.meta.slug).toBe("login");
    });

    it("writes a requirement document without category into a plain filename", () => {
      const doc = planningService.write({
        kind: DOC_KIND.REQUIREMENT,
        slug: "login",
        content: "# Login requirement",
      });

      expect(doc.filePath).toBe(
        join(testDir, "docs", "requirements", "login.md"),
      );
      expect(doc.meta.category).toBeNull();
    });

    it("writes a task document with default status backlog", () => {
      const doc = planningService.write({
        kind: DOC_KIND.TASK,
        slug: "my-task",
        content: "# My Task",
      });

      expect(doc.filePath).toBe(join(testDir, "docs", "tasks", "my-task.md"));
      expect(doc.meta.status).toBe("backlog");
    });

    it("writes a task document with an explicit status", () => {
      const doc = planningService.write({
        kind: DOC_KIND.TASK,
        slug: "my-task",
        content: "# My Task",
        status: TASK_STATUS.REFINED,
      });

      expect(doc.meta.status).toBe("refined");
    });

    it("throws when slug is missing for a non-idea kind", () => {
      expect(() =>
        planningService.write({
          kind: DOC_KIND.TASK,
          content: "# Missing slug",
        }),
      ).toThrow();
    });

    it("updates an existing document instead of duplicating it", () => {
      planningService.write({
        kind: DOC_KIND.TASK,
        slug: "dup-task",
        content: "# Version 1",
      });

      const updated = planningService.write({
        kind: DOC_KIND.TASK,
        slug: "dup-task",
        content: "# Version 2",
      });

      const all = planningService.list(DOC_KIND.TASK);

      expect(all).toHaveLength(1);
      expect(updated.content).toBe("# Version 2");
      expect(updated.meta.created_at).toBe(all[0]!.meta.created_at);
    });

    it("preserves created_at across updates while bumping updated_at", async () => {
      const first = planningService.write({
        kind: DOC_KIND.TASK,
        slug: "timing-task",
        content: "# v1",
      });

      await new Promise((r) => setTimeout(r, 5));

      const second = planningService.write({
        kind: DOC_KIND.TASK,
        slug: "timing-task",
        content: "# v2",
      });

      expect(second.meta.created_at).toBe(first.meta.created_at);
      expect(second.meta.updated_at).not.toBe(first.meta.updated_at);
    });
  });

  describe("content digest", () => {
    it("is deterministic for identical content", () => {
      const docA = planningService.write({
        kind: DOC_KIND.TASK,
        slug: "digest-a",
        content: "# Same content",
      });

      const docB = planningService.write({
        kind: DOC_KIND.TASK,
        slug: "digest-b",
        content: "# Same content",
      });

      expect(docA.meta.content_digest).toBe(docB.meta.content_digest);
      expect(docA.meta.content_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it("differs for different content", () => {
      const docA = planningService.write({
        kind: DOC_KIND.TASK,
        slug: "digest-c",
        content: "# Content One",
      });

      const docB = planningService.write({
        kind: DOC_KIND.TASK,
        slug: "digest-d",
        content: "# Content Two",
      });

      expect(docA.meta.content_digest).not.toBe(docB.meta.content_digest);
    });
  });

  describe("read", () => {
    it("reads back a written document", () => {
      planningService.write({
        kind: DOC_KIND.DESIGN,
        slug: "system-design",
        content: "# System Design",
      });

      const doc = planningService.read(DOC_KIND.DESIGN, "system-design");

      expect(doc.content).toBe("# System Design");
      expect(doc.meta.slug).toBe("system-design");
    });

    it("throws when the document does not exist", () => {
      expect(() => planningService.read(DOC_KIND.TASK, "missing")).toThrow();
    });
  });

  describe("list", () => {
    it("lists documents of a given kind", () => {
      planningService.write({
        kind: DOC_KIND.TASK,
        slug: "task-1",
        content: "# Task 1",
      });
      planningService.write({
        kind: DOC_KIND.TASK,
        slug: "task-2",
        content: "# Task 2",
      });

      const tasks = planningService.list(DOC_KIND.TASK);

      expect(tasks).toHaveLength(2);
      expect(tasks.map((t) => t.meta.slug).sort()).toEqual([
        "task-1",
        "task-2",
      ]);
    });

    it("lists all documents when no kind is given", () => {
      planningService.write({
        kind: DOC_KIND.IDEA,
        content: "# Idea",
      });
      planningService.write({
        kind: DOC_KIND.TASK,
        slug: "task-1",
        content: "# Task 1",
      });

      const all = planningService.list();

      expect(all).toHaveLength(2);
    });

    it("returns an empty array when nothing has been written", () => {
      expect(planningService.list(DOC_KIND.REQUIREMENT)).toEqual([]);
    });
  });

  describe("transition", () => {
    beforeEach(() => {
      planningService.write({
        kind: DOC_KIND.TASK,
        slug: "flow-task",
        content: "# Flow task",
      });
    });

    it("allows backlog -> refined", () => {
      const result = planningService.transition("flow-task", TASK_STATUS.REFINED);

      expect(result.oldStatus).toBe("backlog");
      expect(result.newStatus).toBe("refined");
    });

    it("allows refined -> active", () => {
      planningService.transition("flow-task", TASK_STATUS.REFINED);
      const result = planningService.transition("flow-task", TASK_STATUS.ACTIVE);

      expect(result.newStatus).toBe("active");
    });

    it("allows active -> done and done -> released", () => {
      planningService.transition("flow-task", TASK_STATUS.REFINED);
      planningService.transition("flow-task", TASK_STATUS.ACTIVE);
      planningService.transition("flow-task", TASK_STATUS.DONE);
      const result = planningService.transition("flow-task", TASK_STATUS.RELEASED);

      expect(result.newStatus).toBe("released");
    });

    it("rejects an invalid forward jump from backlog to active", () => {
      expect(() =>
        planningService.transition("flow-task", TASK_STATUS.ACTIVE),
      ).toThrow();
    });

    it("rejects transitioning out of a terminal state", () => {
      planningService.transition("flow-task", TASK_STATUS.REFINED);
      planningService.transition("flow-task", TASK_STATUS.ACTIVE);
      planningService.transition("flow-task", TASK_STATUS.DONE);
      planningService.transition("flow-task", TASK_STATUS.RELEASED);

      expect(() =>
        planningService.transition("flow-task", TASK_STATUS.ACTIVE),
      ).toThrow();
    });

    it("allows backward transition refined -> backlog", () => {
      planningService.transition("flow-task", TASK_STATUS.REFINED);
      const result = planningService.transition("flow-task", TASK_STATUS.BACKLOG);

      expect(result.newStatus).toBe("backlog");
    });

    it("allows backward transition active -> refined", () => {
      planningService.transition("flow-task", TASK_STATUS.REFINED);
      planningService.transition("flow-task", TASK_STATUS.ACTIVE);
      const result = planningService.transition("flow-task", TASK_STATUS.REFINED);

      expect(result.newStatus).toBe("refined");
    });

    it("allows backward transition done -> active", () => {
      planningService.transition("flow-task", TASK_STATUS.REFINED);
      planningService.transition("flow-task", TASK_STATUS.ACTIVE);
      planningService.transition("flow-task", TASK_STATUS.DONE);
      const result = planningService.transition("flow-task", TASK_STATUS.ACTIVE);

      expect(result.newStatus).toBe("active");
    });

    it("throws when the task does not exist", () => {
      expect(() =>
        planningService.transition("no-such-task", TASK_STATUS.REFINED),
      ).toThrow();
    });

    it("reports allTasksRefined once every task reaches refined", () => {
      const first = planningService.transition("flow-task", TASK_STATUS.REFINED);
      expect(first.allTasksRefined).toBe(true);

      planningService.write({
        kind: DOC_KIND.TASK,
        slug: "second-task",
        content: "# Second task",
      });

      const stillBacklog = planningService.transition("flow-task", TASK_STATUS.BACKLOG);
      expect(stillBacklog.allTasksRefined).toBe(false);
    });
  });

  describe("getProjectState", () => {
    it("returns zero counts with no documents", () => {
      const state = planningService.getProjectState();

      expect(state.docCounts.task).toBe(0);
      expect(state.taskCounts.backlog).toBe(0);
      expect(state.allTasksRefined).toBe(false);
    });

    it("returns correct doc and task counts", () => {
      planningService.write({ kind: DOC_KIND.IDEA, content: "# Idea" });
      planningService.write({
        kind: DOC_KIND.REQUIREMENT,
        slug: "req-1",
        content: "# Req",
      });
      planningService.write({
        kind: DOC_KIND.TASK,
        slug: "task-a",
        content: "# Task A",
      });
      planningService.write({
        kind: DOC_KIND.TASK,
        slug: "task-b",
        content: "# Task B",
        status: TASK_STATUS.REFINED,
      });

      const state = planningService.getProjectState();

      expect(state.docCounts.idea).toBe(1);
      expect(state.docCounts.requirement).toBe(1);
      expect(state.docCounts.task).toBe(2);
      expect(state.taskCounts.backlog).toBe(1);
      expect(state.taskCounts.refined).toBe(1);
      expect(state.allTasksRefined).toBe(false);
    });
  });
});
