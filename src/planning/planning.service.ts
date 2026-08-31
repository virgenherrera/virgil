import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

import { ConfigurationError } from "../shared/errors.js";
import { checkTaskTransition } from "./planning-state-machine.js";
import { DOC_KIND, DOC_SCHEMA, TASK_STATUS } from "./planning.types.js";
import type {
  DocKind,
  DocMeta,
  DocRefs,
  DocRefsUpdate,
  Document,
  ProjectState,
  TaskStatus,
  TransitionResult,
  WriteDocParams,
} from "./planning.types.js";

const META_PATTERN = /^<!-- virgil:meta\n([\s\S]*?)\n-->\n\n?([\s\S]*)$/;

@Injectable()
export class PlanningService {
  write(params: WriteDocParams): Document {
    const { kind, content } = params;

    if (kind !== DOC_KIND.IDEA && !params.slug) {
      throw new ConfigurationError(
        `slug is required for doc kind '${kind}'`,
      );
    }

    const slug = kind === DOC_KIND.IDEA ? "idea" : params.slug!;
    if (kind !== DOC_KIND.IDEA) {
      this.validatePathSegment(slug, "slug");
    }

    const category = params.category ?? null;
    if (category) {
      this.validatePathSegment(category, "category");
    }

    const existing = this.findDocBySlug(kind, slug);
    const usesCategory = kind === DOC_KIND.REQUIREMENT || kind === DOC_KIND.DESIGN;
    const filePath =
      existing?.filePath ??
      this.computeFilePath(kind, slug, usesCategory ? category : null);

    const now = new Date().toISOString();
    const digest = this.computeDigest(content);

    let status: TaskStatus | null = null;
    if (kind === DOC_KIND.TASK) {
      status = params.status ?? existing?.meta.status ?? TASK_STATUS.BACKLOG;
    }

    const refs: DocRefs = {
      requirements: params.refs?.requirements ?? existing?.meta.refs.requirements ?? [],
      design: params.refs?.design ?? existing?.meta.refs.design ?? [],
      implements: params.refs?.implements ?? existing?.meta.refs.implements ?? [],
    };

    const meta: DocMeta = {
      schema: DOC_SCHEMA,
      doc_kind: kind,
      project_id: existing?.meta.project_id ?? this.resolveProjectId(),
      slug,
      status,
      category: usesCategory ? category : (existing?.meta.category ?? null),
      refs,
      content_digest: digest,
      created_at: existing?.meta.created_at ?? now,
      updated_at: now,
    };

    this.ensureDir(dirname(filePath));
    writeFileSync(filePath, this.serializeDoc(meta, content), "utf-8");

    return { meta, content, filePath };
  }

  read(kind: DocKind, slug?: string): Document {
    const doc =
      kind === DOC_KIND.IDEA
        ? this.findDocBySlug(kind, "idea")
        : this.findDocBySlug(kind, slug ?? "");

    if (!doc) {
      throw new ConfigurationError(
        `Document not found: kind=${kind}${slug ? ` slug=${slug}` : ""}`,
      );
    }

    return doc;
  }

  list(kind?: DocKind): Document[] {
    const kinds = kind ? [kind] : (Object.values(DOC_KIND) as DocKind[]);
    const results: Document[] = [];

    for (const k of kinds) {
      if (k === DOC_KIND.IDEA) {
        const ideaPath = join(this.docsDir(), "idea.md");
        if (existsSync(ideaPath)) {
          results.push(this.parseDoc(ideaPath));
        }
        continue;
      }

      const dir = this.dirForKind(k);
      if (!existsSync(dir)) {
        continue;
      }

      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .sort();

      for (const f of files) {
        results.push(this.parseDoc(join(dir, f)));
      }
    }

    return results;
  }

  transition(
    slug: string,
    newStatus: TaskStatus,
    refsUpdate?: DocRefsUpdate,
  ): TransitionResult {
    const doc = this.findDocBySlug(DOC_KIND.TASK, slug);
    if (!doc) {
      throw new ConfigurationError(`Task not found: ${slug}`);
    }

    const oldStatus = doc.meta.status ?? TASK_STATUS.BACKLOG;
    const check = checkTaskTransition(oldStatus, newStatus);
    if (!check.allowed) {
      throw new ConfigurationError(check.reason);
    }

    const refs: DocRefs = {
      requirements: refsUpdate?.requirements ?? doc.meta.refs.requirements,
      design: refsUpdate?.design ?? doc.meta.refs.design,
      implements: refsUpdate?.implements ?? doc.meta.refs.implements,
    };

    const updatedMeta: DocMeta = {
      ...doc.meta,
      status: newStatus,
      refs,
      updated_at: new Date().toISOString(),
    };

    writeFileSync(
      doc.filePath,
      this.serializeDoc(updatedMeta, doc.content),
      "utf-8",
    );

    const document: Document = {
      meta: updatedMeta,
      content: doc.content,
      filePath: doc.filePath,
    };

    return {
      slug,
      oldStatus,
      newStatus,
      filePath: doc.filePath,
      document,
      allTasksRefined: this.computeAllTasksRefined(),
    };
  }

  getProjectState(): ProjectState {
    const docCounts = {} as Record<DocKind, number>;
    for (const k of Object.values(DOC_KIND) as DocKind[]) {
      docCounts[k] = this.list(k).length;
    }

    const taskCounts = {} as Record<TaskStatus, number>;
    for (const s of Object.values(TASK_STATUS) as TaskStatus[]) {
      taskCounts[s] = 0;
    }
    for (const task of this.list(DOC_KIND.TASK)) {
      const s = task.meta.status ?? TASK_STATUS.BACKLOG;
      taskCounts[s] = (taskCounts[s] ?? 0) + 1;
    }

    return {
      docCounts,
      taskCounts,
      allTasksRefined: this.computeAllTasksRefined(),
    };
  }

  private computeAllTasksRefined(): boolean {
    const tasks = this.list(DOC_KIND.TASK);
    if (tasks.length === 0) {
      return false;
    }
    return tasks.every((t) => t.meta.status === TASK_STATUS.REFINED);
  }

  private findDocBySlug(kind: DocKind, slug: string): Document | null {
    if (kind === DOC_KIND.IDEA) {
      const ideaPath = join(this.docsDir(), "idea.md");
      return existsSync(ideaPath) ? this.parseDoc(ideaPath) : null;
    }

    const dir = this.dirForKind(kind);
    if (!existsSync(dir)) {
      return null;
    }

    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const doc = this.parseDoc(join(dir, f));
      if (doc.meta.slug === slug && doc.meta.doc_kind === kind) {
        return doc;
      }
    }

    return null;
  }

  private computeFilePath(
    kind: DocKind,
    slug: string,
    category: string | null,
  ): string {
    if (kind === DOC_KIND.IDEA) {
      return join(this.docsDir(), "idea.md");
    }

    const dir = this.dirForKind(kind);
    const fileName = category ? `${category}-${slug}.md` : `${slug}.md`;
    return join(dir, fileName);
  }

  private dirForKind(kind: DocKind): string {
    switch (kind) {
      case DOC_KIND.IDEA:
        return this.docsDir();
      case DOC_KIND.REQUIREMENT:
        return join(this.docsDir(), "requirements");
      case DOC_KIND.DESIGN:
        return join(this.docsDir(), "design");
      case DOC_KIND.TASK:
        return join(this.docsDir(), "tasks");
    }
  }

  private docsDir(): string {
    return join(process.cwd(), "docs");
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private validatePathSegment(value: string, label: string): void {
    if (!value || value.trim().length === 0) {
      throw new ConfigurationError(`${label} must not be empty`);
    }
    if (value.includes("/") || value.includes("\\") || value.includes("..")) {
      throw new ConfigurationError(
        `${label} contains invalid characters: ${value}`,
      );
    }
  }

  private resolveProjectId(): string {
    try {
      const pkgPath = join(process.cwd(), "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
          name?: string;
        };
        if (pkg.name) {
          return pkg.name;
        }
      }
    } catch {
      // fall through to basename fallback
    }

    return basename(process.cwd()) || "virgil";
  }

  private computeDigest(content: string): string {
    const hash = createHash("sha256").update(content, "utf-8").digest("hex");
    return `sha256:${hash}`;
  }

  private serializeDoc(meta: DocMeta, content: string): string {
    const metaJson = JSON.stringify(meta, null, 2);
    return `<!-- virgil:meta\n${metaJson}\n-->\n\n${content}\n`;
  }

  private parseDoc(filePath: string): Document {
    const raw = readFileSync(filePath, "utf-8");
    const match = META_PATTERN.exec(raw);

    if (!match) {
      throw new ConfigurationError(
        `Malformed document: missing virgil:meta frontmatter in ${filePath}`,
      );
    }

    const [, metaJson, content] = match;
    const meta = JSON.parse(metaJson!) as DocMeta;

    return {
      meta,
      content: content!.replace(/\n+$/, ""),
      filePath,
    };
  }
}
