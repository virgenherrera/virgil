import type { Page } from 'playwright';
import {
  ExtractionError,
  NavigationTimeoutError,
  SelectorNotFoundError,
} from '../errors/cdp-errors.js';
import { buildOutputShapeSchema, type PomDefinition } from './pom-schema.js';

/** Result of executing a POM's extraction steps against a live page. */
export interface PomExecutionResult {
  /** Extracted field values, keyed by the POM's `outputShape` field names. */
  readonly fields: Record<string, unknown>;
  /** `true` when one or more optional fields could not be extracted. */
  readonly partial: boolean;
  /** Names of output fields that produced no value. */
  readonly missingFields: readonly string[];
}

export interface PomExecutorOptions {
  /** Default per-step timeout, in milliseconds, when a step omits its own. */
  readonly defaultTimeoutMs?: number;
  /** Timeout for the pre-extraction anchor-selector smoke test. */
  readonly smokeTestTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SMOKE_TEST_TIMEOUT_MS = 5_000;

function isTimeoutLike(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || /timeout/i.test(error.message))
  );
}

/**
 * Translates declarative POM steps into Playwright page interactions and
 * returns normalized extraction results.
 */
export class PomExecutor {
  private readonly defaultTimeoutMs: number;
  private readonly smokeTestTimeoutMs: number;

  constructor(options: PomExecutorOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.smokeTestTimeoutMs =
      options.smokeTestTimeoutMs ?? DEFAULT_SMOKE_TEST_TIMEOUT_MS;
  }

  /**
   * Runs a validated POM's navigation and extraction steps against `page`.
   *
   * @throws {NavigationTimeoutError} when a navigation step does not settle in time.
   * @throws {SelectorNotFoundError} when a required selector is absent from the page.
   * @throws {ExtractionError} when extraction yields no usable output.
   */
  async execute(pom: PomDefinition, page: Page): Promise<PomExecutionResult> {
    for (const step of pom.navigationSteps) {
      await this.runNavigationStep(page, step);
    }

    await this.runSmokeTest(page, pom);

    return this.runExtraction(page, pom);
  }

  private async runNavigationStep(
    page: Page,
    step: PomDefinition['navigationSteps'][number],
  ) {
    try {
      switch (step.type) {
        case 'goto':
          await page.goto(step.url, {
            timeout: step.timeoutMs ?? this.defaultTimeoutMs,
          });
          return;
        case 'click':
          await page.click(step.selector, {
            timeout: step.timeoutMs ?? this.defaultTimeoutMs,
          });
          return;
        case 'fill':
          await page.fill(step.selector, step.value, {
            timeout: step.timeoutMs ?? this.defaultTimeoutMs,
          });
          return;
        case 'select':
          await page.selectOption(step.selector, step.value, {
            timeout: step.timeoutMs ?? this.defaultTimeoutMs,
          });
          return;
        case 'wait':
          await this.runWaitStep(page, step);
          return;
      }
    } catch (error) {
      if (step.type === 'goto') {
        throw new NavigationTimeoutError(
          `Navigation to "${step.url}" timed out.`,
          {
            url: step.url,
            cause: error instanceof Error ? error.message : String(error),
          },
        );
      }

      if ('selector' in step && isTimeoutLike(error)) {
        throw new SelectorNotFoundError(
          `Selector "${step.selector}" was not found during "${step.type}" step.`,
          { selector: step.selector, stepType: step.type },
        );
      }

      throw error;
    }
  }

  private async runWaitStep(
    page: Page,
    step: Extract<PomDefinition['navigationSteps'][number], { type: 'wait' }>,
  ) {
    switch (step.condition) {
      case 'selector-visible':
        if (!step.selector) {
          throw new SelectorNotFoundError(
            'Wait step missing required "selector" field.',
            {
              condition: step.condition,
            },
          );
        }

        try {
          await page.waitForSelector(step.selector, {
            state: 'visible',
            timeout: step.timeoutMs,
          });
        } catch (error) {
          throw new SelectorNotFoundError(
            `Selector "${step.selector}" did not become visible in time.`,
            {
              selector: step.selector,
              cause: error instanceof Error ? error.message : String(error),
            },
          );
        }

        return;
      case 'network-idle':
        await page.waitForLoadState('networkidle', { timeout: step.timeoutMs });
        return;
      case 'timeout':
        await new Promise((resolve) => setTimeout(resolve, step.timeoutMs));
        return;
    }
  }

  private async runSmokeTest(page: Page, pom: PomDefinition): Promise<void> {
    const anchors = pom.extractionSteps.filter((step) => step.required);

    for (const anchor of anchors) {
      try {
        await page.waitForSelector(anchor.selector, {
          timeout: this.smokeTestTimeoutMs,
        });
      } catch (error) {
        throw new SelectorNotFoundError(
          `Required anchor selector "${anchor.selector}" for field "${anchor.field}" was not found.`,
          {
            selector: anchor.selector,
            field: anchor.field,
            cause: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
  }

  private async runExtraction(
    page: Page,
    pom: PomDefinition,
  ): Promise<PomExecutionResult> {
    const fields: Record<string, unknown> = {};
    const missingFields: string[] = [];

    for (const step of pom.extractionSteps) {
      const value = await this.extractField(page, step);

      if (value === undefined || (Array.isArray(value) && value.length === 0)) {
        missingFields.push(step.field);

        if (step.required) {
          throw new ExtractionError(
            `Required field "${step.field}" could not be extracted from selector "${step.selector}".`,
            { field: step.field, selector: step.selector },
          );
        }

        continue;
      }

      fields[step.field] = value;
    }

    const outputSchema = buildOutputShapeSchema(pom.outputShape);
    const validation = outputSchema.safeParse(fields);

    if (!validation.success) {
      throw new ExtractionError(
        'Extraction result failed output-shape validation.',
        {
          issues: validation.error.issues,
          missingFields,
        },
      );
    }

    if (Object.keys(fields).length === 0) {
      throw new ExtractionError('Extraction produced no usable data.', {
        missingFields,
      });
    }

    return {
      fields: validation.data,
      partial: missingFields.length > 0,
      missingFields,
    };
  }

  private async extractField(
    page: Page,
    step: PomDefinition['extractionSteps'][number],
  ): Promise<unknown> {
    const selector =
      step.selectorType === 'xpath' && !step.selector.startsWith('xpath=')
        ? `xpath=${step.selector}`
        : step.selector;

    if (step.multiple) {
      const locator = page.locator(selector);
      const count = await locator.count();
      const values: string[] = [];

      for (let index = 0; index < count; index += 1) {
        const item = locator.nth(index);
        const value = step.attribute
          ? await item.getAttribute(step.attribute)
          : await item.textContent();

        if (value !== null && value !== undefined) {
          values.push(value.trim());
        }
      }

      return values;
    }

    const locator = page.locator(selector).first();
    const exists = (await locator.count()) > 0;

    if (!exists) {
      return undefined;
    }

    const raw = step.attribute
      ? await locator.getAttribute(step.attribute)
      : await locator.textContent();

    return raw === null || raw === undefined ? undefined : raw.trim();
  }
}
