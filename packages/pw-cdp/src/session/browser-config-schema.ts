import { z } from 'zod';

export const SUPPORTED_BROWSERS = [
  'chrome',
  'firefox',
  'edge',
  'safari',
] as const;

export const BrowserConfigSchema = z.object({
  browser: z.enum(SUPPORTED_BROWSERS),
  /** Absolute or `~`-relative profile directory. Defaults per-browser when omitted. */
  profilePath: z.string().min(1).optional(),
  headless: z.boolean().default(false),
  launchArgs: z.array(z.string()).default([]),
});

export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;
export type SupportedBrowser = (typeof SUPPORTED_BROWSERS)[number];
