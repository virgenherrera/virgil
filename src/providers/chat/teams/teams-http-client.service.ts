import { Inject, Injectable } from "@nestjs/common";
import { ProviderError, ERROR_CODE } from "../../../shared/errors.js";
import { TEAMS_CONFIG_TOKEN, type TeamsConfigType } from "./teams.config.js";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

@Injectable()
export class TeamsHttpClientService {
  private readonly baseUrl = "https://graph.microsoft.com/v1.0";
  private readonly authHeader: string;

  constructor(
    @Inject(TEAMS_CONFIG_TOKEN)
    config: TeamsConfigType,
  ) {
    this.authHeader = `Bearer ${config.token}`;
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
          "Content-Type": "application/json",
          "User-Agent": "virgil-cli",
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
          `Teams API error: ${response.status} ${response.statusText} for ${path}`,
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
        `Teams API request failed after ${MAX_RETRIES} retries: ${path}`,
        ERROR_CODE.PROVIDER_UNAVAILABLE,
        error,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
