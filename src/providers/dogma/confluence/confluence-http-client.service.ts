import { Inject, Injectable } from "@nestjs/common";
import { Buffer } from "node:buffer";
import { ProviderError, ERROR_CODE } from "../../../shared/errors.js";
import {
  CONFLUENCE_CONFIG_TOKEN,
  type ConfluenceConfigType,
} from "./confluence.config.js";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

@Injectable()
export class ConfluenceHttpClientService {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(
    @Inject(CONFLUENCE_CONFIG_TOKEN)
    config: ConfluenceConfigType,
  ) {
    this.baseUrl = `${config.siteUrl.replace(/\/$/, "")}/wiki`;
    const auth = Buffer.from(`${config.email}:${config.apiToken}`, "utf8").toString("base64");
    this.authHeader = `Basic ${auth}`;
  }

  async get<T>(path: string): Promise<T> {
    return this.fetchWithRetry<T>(path);
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
          "User-Agent": "virgil-cli",
        },
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get("retry-after");
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.delay(delayMs);
        return this.fetchWithRetry<T>(path, attempt + 1);
      }

      if (!response.ok) {
        throw new ProviderError(
          `Confluence API error: ${response.status} ${response.statusText} for ${path}`,
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
        `Confluence API request failed after ${MAX_RETRIES} retries: ${path}`,
        ERROR_CODE.PROVIDER_UNAVAILABLE,
        error,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
