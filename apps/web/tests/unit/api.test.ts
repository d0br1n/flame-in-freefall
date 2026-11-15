import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, LIVE_RETRY_AFTER_MS, LIVE_TIMEOUT_MS, classifyStatus, getJson, resetLiveBackoff } from "@/lib/api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fetch stand-in that answers by URL and records what was asked. */
function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (!route) throw new TypeError("fetch failed");
    return route();
  }) as typeof fetch;
  return { fetcher, calls };
}

beforeEach(() => resetLiveBackoff());

describe("classifyStatus", () => {
  it("separates an answer from no answer", () => {
    expect(classifyStatus(200)).toBe("ok");
    expect(classifyStatus(404)).toBe("not_found");
    expect(classifyStatus(422)).toBe("bad_request");
    expect(classifyStatus(500)).toBe("unreachable");
    expect(classifyStatus(502)).toBe("unreachable");
  });
});

describe("getJson", () => {
  it("returns the live answer when the backend answers", async () => {
    const { fetcher, calls } = fakeFetch({ "/api/v1/catalog/investigations": () => json({ count: 24 }) });
    const result = await getJson<{ count: number }>("/catalog/investigations", { fetcher });
    expect(result).toEqual({ data: { count: 24 }, source: "live", savedAt: null });
    expect(calls).toEqual(["/api/v1/catalog/investigations"]);
  });

  it("reports an unknown ID as not found, with the backend's sentence, and does not use the saved copy", async () => {
    const { fetcher, calls } = fakeFetch({
      "/api/v1/catalog/investigations/PSI-1": () => json({ detail: "No investigation PSI-1." }, 404),
    });
    const error = await getJson("/catalog/investigations/PSI-1", { fetcher }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe("not_found");
    expect(error.message).toBe("No investigation PSI-1.");
    expect(calls).toHaveLength(1);
  });

  it("falls back to the saved copy when the backend does not answer", async () => {
    const { fetcher } = fakeFetch({
      "/snapshot/api/v1/catalog/investigations.json": () => json({ count: 24 }),
    });
    const result = await getJson<{ count: number }>("/catalog/investigations", { fetcher });
    expect(result.source).toBe("saved");
    expect(result.data.count).toBe(24);
  });

  it("falls back to the saved copy on a server error", async () => {
    const { fetcher } = fakeFetch({
      "/api/v1/modules": () => new Response("Internal Server Error", { status: 500 }),
      "/snapshot/api/v1/modules.json": () => json([]),
    });
    expect((await getJson("/modules", { fetcher })).source).toBe("saved");
  });

  it("says the backend is unreachable when neither answers", async () => {
    const { fetcher } = fakeFetch({});
    const error = await getJson("/modules", { fetcher }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe("unreachable");
  });
});

describe("getJson with a backend that hangs", () => {
  const hangs = (signal?: AbortSignal | null) =>
    new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));

  it("gives the live backend a time limit, then uses the saved copy", async () => {
    resetLiveBackoff();
    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("/api/v1")) return hangs(init?.signal);
      return json({ count: 24 });
    }) as typeof fetch;
    const result = await getJson<{ count: number }>("/catalog/investigations", { fetcher, timeoutMs: 20 });
    expect(result.source).toBe("saved");
    expect(calls).toEqual(["/api/v1/catalog/investigations", "/snapshot/api/v1/catalog/investigations.json"]);
  });

  it("then goes straight to the saved copy for a while, and asks the backend again after a reset", async () => {
    resetLiveBackoff();
    let time = 1000;
    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("/api/v1")) return hangs(init?.signal);
      return json([]);
    }) as typeof fetch;
    await getJson("/modules", { fetcher, timeoutMs: 20, now: () => time });
    await getJson("/modules", { fetcher, timeoutMs: 20, now: () => time + 1000 });
    expect(calls.filter((url) => url.startsWith("/api/v1"))).toHaveLength(1);
    time += LIVE_RETRY_AFTER_MS + 1;
    await getJson("/modules", { fetcher, timeoutMs: 20, now: () => time });
    expect(calls.filter((url) => url.startsWith("/api/v1"))).toHaveLength(2);
    resetLiveBackoff();
  });

  it("a quick failure of one route does not send the other routes to the saved copy", async () => {
    resetLiveBackoff();
    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === "/api/v1/modules") throw new TypeError("fetch failed");
      if (url.startsWith("/snapshot")) return new Response("not found", { status: 404 });
      return json({ items: [] });
    }) as typeof fetch;
    await getJson("/modules", { fetcher }).catch(() => undefined);
    const rank = await getJson("/catalog/rank?air=station", { fetcher });
    expect(rank.source).toBe("live");
  });

  it("does not hide a real answer: a 404 still reads as not found and starts no back-off", async () => {
    resetLiveBackoff();
    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return json({ detail: "No investigation PSI-1." }, 404);
    }) as typeof fetch;
    await getJson("/catalog/investigations/PSI-1", { fetcher }).catch(() => undefined);
    await getJson("/catalog/investigations/PSI-1", { fetcher }).catch(() => undefined);
    expect(calls).toHaveLength(2);
  });
});

describe("a path with no saved copy (DOB-147)", () => {
  const hangs = (signal?: AbortSignal | null) =>
    new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  const custom = "/air/window?o2=0.3&pressure_kpa=70";

  it("is asked from the backend even during the back-off, and answers live", async () => {
    resetLiveBackoff();
    // A slow first request starts the back-off.
    const slow = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("/api/v1") ? hangs(init?.signal) : json({ count: 24 })) as typeof fetch;
    await getJson("/catalog/investigations", { fetcher: slow, timeoutMs: 20 });

    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return url.startsWith("/snapshot") ? new Response("not found", { status: 404 }) : json({ id: "custom" });
    }) as typeof fetch;
    const result = await getJson<{ id: string }>(custom, { fetcher });
    expect(result).toMatchObject({ source: "live", data: { id: "custom" } });
    // The saved copy is tried first (the back-off), then the backend, the only source left.
    expect(calls.map((url) => url.split("/")[1])).toEqual(["snapshot", "api"]);
    resetLiveBackoff();
  });

  it("gets a longer limit when the short one cut the backend off", async () => {
    resetLiveBackoff();
    let liveCalls = 0;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/snapshot")) return new Response("not found", { status: 404 });
      liveCalls += 1;
      // Slower than the short limit, quicker than the long one.
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(json({ id: "custom" })), 60);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      });
    }) as typeof fetch;
    const result = await getJson<{ id: string }>(custom, { fetcher, timeoutMs: 20, liveOnlyTimeoutMs: 500 });
    expect(result).toMatchObject({ source: "live", data: { id: "custom" } });
    expect(liveCalls).toBe(2);
    resetLiveBackoff();
  });

  it("still reads as unreachable when the backend never answers", async () => {
    resetLiveBackoff();
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("/snapshot") ? new Response("not found", { status: 404 }) : hangs(init?.signal)) as typeof fetch;
    await expect(getJson(custom, { fetcher, timeoutMs: 20, liveOnlyTimeoutMs: 40 })).rejects.toMatchObject({ kind: "unreachable" });
    resetLiveBackoff();
  });

  it("does not ask the backend twice after a quick failure", async () => {
    resetLiveBackoff();
    let liveCalls = 0;
    const fetcher = (async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/snapshot")) return new Response("not found", { status: 404 });
      liveCalls += 1;
      return new Response("down", { status: 503 });
    }) as typeof fetch;
    await expect(getJson(custom, { fetcher })).rejects.toMatchObject({ kind: "unreachable" });
    expect(liveCalls).toBe(1);
  });
});

describe("the back-off survives a reload in the same tab", () => {
  function fakeStorage(): Storage {
    const items = new Map<string, string>();
    return {
      get length() {
        return items.size;
      },
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      key: (index: number) => [...items.keys()][index] ?? null,
      removeItem: (key: string) => void items.delete(key),
      setItem: (key: string, value: string) => void items.set(key, String(value)),
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("keeps the first load under the 3 s target", () => {
    expect(LIVE_TIMEOUT_MS).toBeLessThan(3000);
  });

  it("a reloaded page goes straight to the saved copy, and Try again asks the backend again", async () => {
    vi.stubGlobal("sessionStorage", fakeStorage());
    const hangs = (signal?: AbortSignal | null) =>
      new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const calls: string[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("/api/v1")) return hangs(init?.signal);
      return json([]);
    }) as typeof fetch;

    vi.resetModules();
    const firstPage = await import("@/lib/api");
    await firstPage.getJson("/modules", { fetcher, timeoutMs: 20 });
    expect(sessionStorage.getItem(firstPage.LIVE_DOWN_KEY)).not.toBeNull();

    vi.resetModules(); // a reload: the module starts again, the tab's storage stays
    const reloaded = await import("@/lib/api");
    const result = await reloaded.getJson("/modules", { fetcher, timeoutMs: 20 });
    expect(result.source).toBe("saved");
    expect(calls.filter((url) => url.startsWith("/api/v1"))).toHaveLength(1);

    reloaded.resetLiveBackoff();
    expect(sessionStorage.getItem(reloaded.LIVE_DOWN_KEY)).toBeNull();
    await reloaded.getJson("/modules", { fetcher, timeoutMs: 20 });
    expect(calls.filter((url) => url.startsWith("/api/v1"))).toHaveLength(2);
  });

  it("blocked storage costs nothing: the page still falls back to the saved copy", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    vi.resetModules();
    const page = await import("@/lib/api");
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/v1"))
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("x"))));
      return json([]);
    }) as typeof fetch;
    const result = await page.getJson("/modules", { fetcher, timeoutMs: 20 });
    expect(result.source).toBe("saved");
    page.resetLiveBackoff();
  });
});
