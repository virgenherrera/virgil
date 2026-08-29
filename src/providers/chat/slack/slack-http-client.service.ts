import { Inject, Injectable } from "@nestjs/common";
import { ProviderError, ERROR_CODE } from "../../../shared/errors.js";
import { SLACK_CONFIG_TOKEN, type SlackConfigType } from "./slack.config.js";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

interface SlackApiResponse {
  readonly ok: boolean;
  readonly error?: string;
  readonly retry_after?: number;
}

@Injectable()
export class SlackHttpClientService {
  private readonly baseUrl = "https://slack.com/api";
  private readonly authHeader: string;

  constructor(
    @Inject(SLACK_CONFIG_TOKEN)
    config: SlackConfigType,
  ) {
    this.authHeader = `Bearer ${config.botToken}`;
  }

  async get<T>(
    method: string,
    params?: Record<string, string>,
  ): Promise<T> {
    return this.fetchWithRetry<T>(method, params);
  }

  private async fetchWithRetry<T>(
    method: string,
    params?: Record<string, string>,
    attempt = 0,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${method}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
        },
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : RETRY_BASE_DELAY_MS * Math.pow(2, attempt);

        await this.delay(delayMs);
        return this.fetchWithRetry<T>(method, params, attempt + 1);
      }

      if (!response.ok) {
        throw new ProviderError(
          `Slack API HTTP error: ${response.status} ${response.statusText} for ${method}`,
          ERROR_CODE.PROVIDER_UNAVAILABLE,
        );
      }

      const body = (await response.json()) as SlackApiResponse & T;

      if (!body.ok) {
        if (body.retry_after && attempt < MAX_RETRIES) {
          await this.delay(body.retry_after * 1000);
          return this.fetchWithRetry<T>(method, params, attempt + 1);
        }

        throw new ProviderError(
          `Slack API error: ${body.error ?? "unknown"} for ${method}`,
          ERROR_CODE.PROVIDER_UNAVAILABLE,
        );
      }

      return body as T;
    } catch (error) {
      if (error instanceof ProviderError) throw error;

      if (attempt < MAX_RETRIES) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await this.delay(delayMs);
        return this.fetchWithRetry<T>(method, params, attempt + 1);
      }

      throw new ProviderError(
        `Slack API request failed after ${MAX_RETRIES} retries: ${method}`,
        ERROR_CODE.PROVIDER_UNAVAILABLE,
        error,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
