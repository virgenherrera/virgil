import { Injectable } from "@nestjs/common";
import { resolve, dirname } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { EventCursor } from "./event.types.js";

@Injectable()
export class CursorStoreService {
  private readonly cursorsPath: string;

  constructor() {
    this.cursorsPath = resolve(process.cwd(), ".virgil/cursors.json");
  }

  async load(): Promise<Map<string, EventCursor>> {
    const map = new Map<string, EventCursor>();

    if (!existsSync(this.cursorsPath)) {
      return map;
    }

    try {
      const raw = readFileSync(this.cursorsPath, "utf-8");
      const data = JSON.parse(raw) as Record<string, EventCursor>;

      for (const [key, cursor] of Object.entries(data)) {
        map.set(key, cursor);
      }
    } catch {
      // Corrupted file — start fresh
    }

    return map;
  }

  async save(cursors: Map<string, EventCursor>): Promise<void> {
    const dir = dirname(this.cursorsPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data: Record<string, EventCursor> = {};

    for (const [key, cursor] of cursors) {
      data[key] = cursor;
    }

    writeFileSync(this.cursorsPath, JSON.stringify(data, null, 2), "utf-8");
  }

  async getCursor(providerId: string): Promise<EventCursor | undefined> {
    const cursors = await this.load();
    return cursors.get(providerId);
  }

  async updateCursor(providerId: string, lastSeen: Date): Promise<void> {
    const cursors = await this.load();

    cursors.set(providerId, {
      providerId,
      lastSeen: lastSeen.toISOString(),
    });

    await this.save(cursors);
  }
}
