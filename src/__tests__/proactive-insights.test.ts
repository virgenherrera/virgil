import { Test, type TestingModule } from "@nestjs/testing";
import { ProviderRegistryModule } from "../providers/provider-registry.module.js";
import { CapabilityRegistryModule } from "../capabilities/capability-registry.module.js";
import { InsightEngineService } from "../proactive/insight-engine.service.js";
import type { Insight, InsightAnalyzerPort } from "../proactive/insight.types.js";

describe("proactive insights", () => {
  let module: TestingModule;
  let engine: InsightEngineService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [CapabilityRegistryModule, ProviderRegistryModule],
      providers: [InsightEngineService],
    }).compile();

    engine = module.get(InsightEngineService);
  });

  afterEach(async () => {
    await module.close();
  });

  it("returns empty insights when no providers configured", async () => {
    const insights = await engine.runAll();

    expect(insights).toEqual([]);
  });

  it("runs registered analyzers and collects insights", async () => {
    const analyzer: InsightAnalyzerPort = {
      name: "test-analyzer",
      async analyze(): Promise<Insight[]> {
        return [
          {
            id: "test-1",
            title: "Test insight",
            description: "Something to note",
            severity: "info",
            source: "test-analyzer",
            refs: [],
            generatedAt: new Date().toISOString(),
          },
        ];
      },
    };

    engine.registerAnalyzer(analyzer);

    const insights = await engine.runAll();

    expect(insights).toHaveLength(1);
    expect(insights[0]!.title).toBe("Test insight");
  });

  it("sorts insights by severity (critical > warning > info)", async () => {
    const infoAnalyzer: InsightAnalyzerPort = {
      name: "info-analyzer",
      async analyze(): Promise<Insight[]> {
        return [
          {
            id: "info-1",
            title: "Info insight",
            description: "Low priority",
            severity: "info",
            source: "info-analyzer",
            refs: [],
            generatedAt: new Date().toISOString(),
          },
        ];
      },
    };

    const criticalAnalyzer: InsightAnalyzerPort = {
      name: "critical-analyzer",
      async analyze(): Promise<Insight[]> {
        return [
          {
            id: "crit-1",
            title: "Critical insight",
            description: "High priority",
            severity: "critical",
            source: "critical-analyzer",
            refs: [],
            generatedAt: new Date().toISOString(),
          },
        ];
      },
    };

    const warningAnalyzer: InsightAnalyzerPort = {
      name: "warning-analyzer",
      async analyze(): Promise<Insight[]> {
        return [
          {
            id: "warn-1",
            title: "Warning insight",
            description: "Medium priority",
            severity: "warning",
            source: "warning-analyzer",
            refs: [],
            generatedAt: new Date().toISOString(),
          },
        ];
      },
    };

    // Register in non-sorted order
    engine.registerAnalyzer(infoAnalyzer);
    engine.registerAnalyzer(criticalAnalyzer);
    engine.registerAnalyzer(warningAnalyzer);

    const insights = await engine.runAll();

    expect(insights).toHaveLength(3);
    expect(insights[0]!.severity).toBe("critical");
    expect(insights[1]!.severity).toBe("warning");
    expect(insights[2]!.severity).toBe("info");
  });

  it("catches analyzer errors without stopping other analyzers", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const failingAnalyzer: InsightAnalyzerPort = {
      name: "failing-analyzer",
      async analyze(): Promise<Insight[]> {
        throw new Error("Analyzer crashed");
      },
    };

    const workingAnalyzer: InsightAnalyzerPort = {
      name: "working-analyzer",
      async analyze(): Promise<Insight[]> {
        return [
          {
            id: "ok-1",
            title: "Working insight",
            description: "From working analyzer",
            severity: "info",
            source: "working-analyzer",
            refs: [],
            generatedAt: new Date().toISOString(),
          },
        ];
      },
    };

    engine.registerAnalyzer(failingAnalyzer);
    engine.registerAnalyzer(workingAnalyzer);

    const insights = await engine.runAll();

    expect(insights).toHaveLength(1);
    expect(insights[0]!.source).toBe("working-analyzer");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
