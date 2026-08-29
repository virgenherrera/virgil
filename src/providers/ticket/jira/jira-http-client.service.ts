import { Inject, Injectable } from "@nestjs/common";
import { ProviderError, ERROR_CODE } from "../../../shared/errors.js";
import { JIRA_CONFIG_TOKEN, type JiraConfigType } from "./jira.config.js";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

interface JiraPageResponse<T> {
  readonly startAt: number;
  readonly maxResults: number;
  readonly total: number;
  readonly values?: readonly T[];
  readonly issues?: readonly T[];
}

@Injectable()
export class JiraHttpClientService {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(
    @Inject(JIRA_CONFIG_TOKEN)
    config: JiraConfigType,
  ) {
    this.baseUrl = config.siteUrl.replace(/\/$/, "");
    this.authHeader =
      "Basic " +
      Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  }

  async get<T>(path: string): Promise<T> {
    return this.fetchWithRetry<T>(path);
  }

  async getPage<T>(
    path: string,
    startAt: number,
    maxResults: number,
  ): Promise<JiraPageResponse<T>> {
    const separator = path.includes("?") ? "&" : "?";
    const paginatedPath = `${path}${separator}startAt=${startAt}&maxResults=${maxResults}`;
    return this.fetchWithRetry<JiraPageResponse<T>>(paginatedPath);
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
          Authorization: this.authHeader,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);

        await this.delay(delayMs);
        return this.fetchWithRetry<T>(path, attempt + 1);
      }

      if (!response.ok) {
        throw new ProviderError(
          `Jira API error: ${response.status} ${response.statusText} for ${path}`,
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
        `Jira API request failed after ${MAX_RETRIES} retries: ${path}`,
        ERROR_CODE.PROVIDER_UNAVAILABLE,
        error,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
