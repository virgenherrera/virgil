import { Inject, Injectable } from "@nestjs/common";
import { ProviderError, ERROR_CODE } from "../../../shared/errors.js";
import { AZDO_CONFIG_TOKEN, type AzdoConfigType } from "./azdo.config.js";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

@Injectable()
export class AzdoHttpClientService {
  private readonly baseUrl: string;
  private readonly healthUrl: string;
  private readonly authHeader: string;

  constructor(
    @Inject(AZDO_CONFIG_TOKEN)
    config: AzdoConfigType,
  ) {
    const orgUrl = config.orgUrl.replace(/\/$/, "");
    this.baseUrl = `${orgUrl}/${config.project}/_apis`;
    this.healthUrl = `${orgUrl}/_apis/projects/${config.project}`;
    this.authHeader = `Basic ${Buffer.from(":" + config.pat).toString("base64")}`;
  }

  async get<T>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    return this.fetchWithRetry<T>("GET", url);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.fetchWithRetry<T>("POST", url, body);
  }

  async checkHealth<T>(): Promise<T> {
    const url = `${this.healthUrl}?api-version=7.1`;
    return this.fetchWithRetry<T>("GET", url);
  }

  private buildUrl(path: string): string {
    const separator = path.includes("?") ? "&" : "?";
    return `${this.baseUrl}/${path}${separator}api-version=7.1`;
  }

  private async fetchWithRetry<T>(
    method: string,
    url: string,
    body?: unknown,
    attempt = 0,
  ): Promise<T> {
    try {
      const headers: Record<string, string> = {
        Authorization: this.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "virgil-cli",
      };

      const options: RequestInit = { method, headers };
      if (body !== undefined) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.delay(delayMs);
        return this.fetchWithRetry<T>(method, url, body, attempt + 1);
      }

      if (!response.ok) {
        throw new ProviderError(
          `Azure DevOps API error: ${response.status} ${response.statusText} for ${url}`,
          ERROR_CODE.PROVIDER_UNAVAILABLE,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.delay(delayMs);
        return this.fetchWithRetry<T>(method, url, body, attempt + 1);
      }

      throw new ProviderError(
        `Azure DevOps API request failed after ${MAX_RETRIES} retries: ${url}`,
        ERROR_CODE.PROVIDER_UNAVAILABLE,
        error,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
