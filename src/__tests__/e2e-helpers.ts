import { vi } from "vitest";

export interface StubRoute {
  readonly pattern: string;
  readonly response: unknown;
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly method?: "GET" | "POST";
}

/**
 * Stub global fetch with pattern-matched routes.
 *
 * Accepts either an array of StubRoute (new form) or a Record<string, unknown>
 * (legacy compat — same signature the existing tests use).
 */
export function stubFetch(
  routes: StubRoute[] | Record<string, unknown>,
): ReturnType<typeof vi.fn> {
  const routeList: StubRoute[] = Array.isArray(routes)
    ? routes
    : Object.entries(routes).map(([pattern, response]) => ({
        pattern,
        response,
      }));

  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.toString()
          : url.url;
    const method = init?.method ?? "GET";

    for (const route of routeList) {
      if (
        urlStr.includes(route.pattern) &&
        (!route.method || route.method === method)
      ) {
        return new Response(JSON.stringify(route.response), {
          status: route.status ?? 200,
          headers: {
            "Content-Type": "application/json",
            ...(route.headers ?? {}),
          },
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  });

  vi.stubGlobal("fetch", fn);
  return fn;
}

/**
 * Stub global fetch with sequential responses per pattern.
 * Useful for testing retry behaviour — each call to a matching pattern
 * returns the next response in its sequence. Once exhausted, the last
 * response is returned for every subsequent call.
 */
export function stubFetchSequence(
  responses: Array<{ pattern: string; responses: unknown[] }>,
): ReturnType<typeof vi.fn> {
  const counters = new Map<string, number>();

  const fn = vi.fn(async (url: string | URL | Request) => {
    const urlStr =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.toString()
          : url.url;

    for (const route of responses) {
      if (urlStr.includes(route.pattern)) {
        const idx = counters.get(route.pattern) ?? 0;
        counters.set(route.pattern, idx + 1);
        const resp =
          route.responses[idx] ?? route.responses[route.responses.length - 1];

        if (typeof resp === "number") {
          return new Response("", { status: resp });
        }
        return new Response(JSON.stringify(resp), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  });

  vi.stubGlobal("fetch", fn);
  return fn;
}
