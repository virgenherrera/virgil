import { Injectable } from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { AppError, ERROR_CODE } from "../shared/errors.js";
import type {
  Brief,
  BriefItem,
  BriefQueryOptions,
  BriefQueryResult,
  BriefDriftStatus,
} from "./brief.types.js";

@Injectable()
export class BriefQueryService {
  async query(
    outputDir: string,
    options: BriefQueryOptions,
  ): Promise<BriefQueryResult> {
    const brief = this.readBrief(outputDir);
    let items: readonly BriefItem[] = brief.items;

    if (options.kinds && options.kinds.length > 0) {
      const kindSet = new Set(options.kinds);
      items = items.filter((item) => kindSet.has(item.kind));
    }

    if (options.search) {
      const term = options.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(term) ||
          item.summary.toLowerCase().includes(term),
      );
    }

    if (options.sourceRef) {
      const ref = options.sourceRef;
      items = items.filter((item) => item.sourceRefs.includes(ref));
    }

    const matched = items.length;

    if (options.maxItems !== undefined && options.maxItems < items.length) {
      items = items.slice(0, options.maxItems);
    }

    const drift = await this.checkDrift(outputDir);

    return {
      items,
      drift,
      stats: {
        matched,
        total: brief.items.length,
      },
    };
  }

  async checkDrift(outputDir: string): Promise<BriefDriftStatus> {
    const brief = this.readBrief(outputDir);
    const watermark = brief.watermark;

    const head = execSync("git rev-parse HEAD", {
      cwd: outputDir,
      stdio: "pipe",
    })
      .toString()
      .trim();

    if (watermark === head) {
      return { drifted: false, watermark, head, commitsBehind: 0 };
    }

    const countOutput = execSync(
      `git rev-list --count ${watermark}..HEAD`,
      { cwd: outputDir, stdio: "pipe" },
    )
      .toString()
      .trim();

    const commitsBehind = parseInt(countOutput, 10);

    return { drifted: true, watermark, head, commitsBehind };
  }

  private readBrief(outputDir: string): Brief {
    const briefPath = join(outputDir, ".virgil", "brief.json");

    if (!existsSync(briefPath)) {
      throw new AppError(
        `brief.json not found at ${briefPath}`,
        ERROR_CODE.BRIEF_NOT_FOUND,
      );
    }

    return JSON.parse(readFileSync(briefPath, "utf-8")) as Brief;
  }
}
