import { Inject, Injectable } from "@nestjs/common";
import { ProviderError, ERROR_CODE } from "../../../shared/errors.js";
import {
  GITHUB_ORG_CONFIG_TOKEN,
  type GithubOrgConfigType,
} from "./github-org.config.js";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

@Injectable()
export class GithubOrgHttpClientService {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(
    @Inject(GITHUB_ORG_CONFIG_TOKEN)
    config: GithubOrgConfigType,
  ) {
    this.baseUrl = config.apiUrl.replace(/\/$/, "");
    this.token = config.token;
  }

  async get<T>(path: string): Promise<T> {
    return this.fetchWithRetry<T>(path);
  }

  async getAll<T>(path: string, perPage = 30): Promise<T[]> {
    const separator = path.includes("?") ? "&" : "?";
    return this.fetchWithRetry<T[]>(
      `${path}${separator}per_page=${perPage}`,
    );
  }

  private async fetchWithRetry<T>(
    path: string,
    attempt = 0,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "virgil-cli",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (this.isRateLimited(response) && attempt < MAX_RETRIES) {
        const delayMs = this.parseRateLimitDelay(response, attempt);
        await this.delay(delayMs);
        return this.fetchWithRetry<T>(path, attempt + 1);
      }

      if (!response.ok) {
        throw new ProviderError(
          `GitHub API error: ${response.status} ${response.statusText} for ${path}`,
          ERROR_CODE.PROVIDER_UNAVAILABLE,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.delay(delayMs);
        return this.fetchWithRetry<T>(path, attempt + 1);
      }

      throw new ProviderError(
        `GitHub API request failed after ${MAX_RETRIES} retries: ${path}`,
        ERROR_CODE.PROVIDER_UNAVAILABLE,
        error,
      );
    }
  }

  private isRateLimited(response: Response): boolean {
    if (response.status === 429) return true;
    if (
      response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0"
    ) {
      return true;
    }
    return false;
  }

  private parseRateLimitDelay(
    response: Response,
    attempt: number,
  ): number {
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
      return parseInt(retryAfter, 10) * 1000;
    }

    const resetTimestamp = response.headers.get("x-ratelimit-reset");
    if (resetTimestamp) {
      const resetMs = parseInt(resetTimestamp, 10) * 1000;
      const delayMs = resetMs - Date.now();
      if (delayMs > 0) return delayMs;
    }

    return RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
