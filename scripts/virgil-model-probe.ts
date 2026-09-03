#!/usr/bin/env -S tsx
/**
 * virgil-model-probe — CLI to detect hardware, score model fitness, compute
 * CAN/WANT ceilings, and manage local minion model selection.
 *
 * Usage:
 *   pnpm probe detect
 *   pnpm probe fitness
 *   pnpm probe ceiling [options]
 *   pnpm probe probe
 *   pnpm probe benchmark <model-name>
 *   pnpm probe select <model-name>
 *
 * No network requests for detect/fitness/ceiling commands.
 * probe/benchmark/select require Docker Model Runner (DMR) at localhost:12434.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DMR_BASE = "http://localhost:12434";
const DMR_MODELS_URL = `${DMR_BASE}/v1/models`;
const DMR_CHAT_URL = `${DMR_BASE}/v1/chat/completions`;

const FIXTURE_ATTEMPTS = 3;
const WORKER_THRESHOLD = 0.66;
const REASONING_THRESHOLD = 0.66;
const FETCH_TIMEOUT_MS = 30_000;

const DEFAULT_RAM_RESERVATION_GB = 4;

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const TierSchema = z.enum(["worker", "reasoning", "pro"]);
type Tier = z.infer<typeof TierSchema>;

export const HardwareProfileSchema = z.object({
  cpu: z.object({
    arch: z.string(),
    cores: z.number().int().positive(),
    model: z.string(),
  }),
  gpu: z.object({
    type: z.enum(["metal", "cuda", "none"]),
    cores: z.number().int().nonnegative().nullable(),
    vram: z.number().nonnegative().nullable(),
  }),
  ram: z.object({
    totalGb: z.number().positive(),
    availableGb: z.number().nonnegative(),
  }),
  disk: z.object({
    availableGb: z.number().nonnegative(),
  }),
  docker: z.object({
    engineVersion: z.string().nullable(),
    composeVersion: z.string().nullable(),
    dmrStatus: z.enum(["available", "unavailable", "unknown"]),
    allocatedCpu: z.number().nonnegative().nullable(),
    allocatedMemoryGb: z.number().nonnegative().nullable(),
  }),
});
export type HardwareProfile = z.infer<typeof HardwareProfileSchema>;

export const ModelCatalogEntrySchema = z.object({
  name: z.string(),
  provider: z.string(),
  parametersBillions: z.number().positive(),
  quantization: z.string(),
  tier: TierSchema,
  ramRequiredGb: z.number().positive(),
  diskRequiredGb: z.number().positive(),
});
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;

export const FitnessResultSchema = z.object({
  model: z.string(),
  fits: z.boolean(),
  score: z.number().min(0).max(1),
  ramNeededGb: z.number().positive(),
  diskNeededGb: z.number().positive(),
  ramAvailableGb: z.number().nonnegative(),
  tier: TierSchema,
});
export type FitnessResult = z.infer<typeof FitnessResultSchema>;

export const CeilingCanSchema = z.object({
  maxConcurrentModels: z.number().int().nonnegative(),
  totalRamBudgetGb: z.number().nonnegative(),
  availableDiskGb: z.number().nonnegative(),
  qualifiedModels: z.object({
    worker: z.array(z.string()),
    reasoning: z.array(z.string()),
    pro: z.array(z.string()),
  }),
});
export type CeilingCan = z.infer<typeof CeilingCanSchema>;

export const CeilingWantSchema = z.object({
  maxMinions: z.number().int().positive(),
  allowedTiers: z.array(TierSchema).min(1),
  selectedModels: z.record(z.string(), z.string()),
  ramReservationGb: z.number().nonnegative(),
});
export type CeilingWant = z.infer<typeof CeilingWantSchema>;

export const EffectiveCeilingSchema = z.object({
  maxMinions: z.number().int().nonnegative(),
  allowedTiers: z.array(TierSchema),
  selectedModels: z.record(z.string(), z.string()),
  explanation: z.record(z.string(), z.string()),
});
export type EffectiveCeiling = z.infer<typeof EffectiveCeilingSchema>;

export const VirgilLocalMinionsConfigSchema = z.object({
  ceiling: TierSchema,
  allowedTiers: z.array(TierSchema),
  model: z.string().nullable(),
  effectiveCeiling: EffectiveCeilingSchema.nullable(),
  hardwareProfileHash: z.string().nullable(),
  lastProbeDate: z.string().datetime({ offset: true }).nullable(),
});
export type VirgilLocalMinionsConfig = z.infer<typeof VirgilLocalMinionsConfigSchema>;

// Runtime validation schemas for DMR API responses
const ModelsResponseSchema = z.object({
  object: z.string(),
  data: z.array(z.object({
    id: z.string(),
    object: z.string(),
  }).passthrough()),
});

const ChatResponseSchema = z.object({
  choices: z.array(z.object({
    index: z.number(),
    message: z.object({
      role: z.string(),
      content: z.string(),
    }),
  }).passthrough()),
});

// ---------------------------------------------------------------------------
// Model Catalog — hardcoded tier equivalence table
// ---------------------------------------------------------------------------

function computeRamRequired(parametersBillions: number): number {
  return parseFloat((parametersBillions * 0.55 + 1.5).toFixed(2));
}

const MODEL_CATALOG: ModelCatalogEntry[] = [
  // Worker tier (Haiku-class)
  { name: "llama3.1:8b", provider: "docker.io/ai", parametersBillions: 8, quantization: "Q4_K_M", tier: "worker", ramRequiredGb: computeRamRequired(8), diskRequiredGb: 4.7 },
  { name: "mistral:7b", provider: "docker.io/ai", parametersBillions: 7, quantization: "Q4_K_M", tier: "worker", ramRequiredGb: computeRamRequired(7), diskRequiredGb: 4.1 },
  { name: "gemma2:9b", provider: "docker.io/ai", parametersBillions: 9, quantization: "Q4_K_M", tier: "worker", ramRequiredGb: computeRamRequired(9), diskRequiredGb: 5.4 },
  // Reasoning tier (Sonnet/Fable-class)
  { name: "qwen3:32b", provider: "docker.io/ai", parametersBillions: 32, quantization: "Q4_K_M", tier: "reasoning", ramRequiredGb: computeRamRequired(32), diskRequiredGb: 19.0 },
  { name: "phi4:14b", provider: "docker.io/ai", parametersBillions: 14, quantization: "Q4_K_M", tier: "reasoning", ramRequiredGb: computeRamRequired(14), diskRequiredGb: 8.4 },
  // Pro tier (Opus-class)
  { name: "llama3.3:70b", provider: "docker.io/ai", parametersBillions: 70, quantization: "Q4_K_M", tier: "pro", ramRequiredGb: computeRamRequired(70), diskRequiredGb: 40.0 },
  { name: "qwen3:72b", provider: "docker.io/ai", parametersBillions: 72, quantization: "Q4_K_M", tier: "pro", ramRequiredGb: computeRamRequired(72), diskRequiredGb: 42.0 },
  { name: "deepseek-v3:latest", provider: "docker.io/ai", parametersBillions: 671, quantization: "Q4_K_M", tier: "pro", ramRequiredGb: computeRamRequired(671), diskRequiredGb: 380.0 },
].map((entry) => ModelCatalogEntrySchema.parse(entry));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRepoRoot(): string {
  return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
}

function getConfigPath(): string {
  return join(getRepoRoot(), "virgil.json");
}

function execSafe(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function hashProfile(profile: HardwareProfile): string {
  const serialized = JSON.stringify({
    cpu: profile.cpu,
    gpu: profile.gpu,
    ram: { totalGb: profile.ram.totalGb },
  });
  return createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}

function loadConfig(): { config: Record<string, unknown>; localMinions: VirgilLocalMinionsConfig } {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    console.error("Error: virgil.json not found at project root.");
    process.exit(1);
  }
  const raw = readFileSync(configPath, "utf8");
  const config = JSON.parse(raw) as Record<string, unknown>;
  if (!config.localMinions) {
    config.localMinions = {
      ceiling: "worker",
      allowedTiers: ["worker"],
      model: null,
      effectiveCeiling: null,
      hardwareProfileHash: null,
      lastProbeDate: null,
    };
  }
  const localMinions = VirgilLocalMinionsConfigSchema.parse(config.localMinions);
  return { config, localMinions };
}

async function prompt(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    console.error("Error: interactive input required but stdin is not a TTY.");
    console.error("Use --max-minions and --tiers flags instead.");
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// DMR fetch helpers (for probe/benchmark/select commands)
// ---------------------------------------------------------------------------

interface ModelEntry {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
  [key: string]: unknown;
}

interface ModelsResponse {
  object: string;
  data: ModelEntry[];
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string;
}

interface ChatResponse {
  id: string;
  choices: ChatChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface FixtureAttempt {
  attempt: number;
  elapsed_ms: number;
  json_valid: boolean;
  strict_correct: boolean;
  raw_content: string;
}

interface FixtureResult {
  name: string;
  attempts: FixtureAttempt[];
  pass_rate: number;
  avg_latency_ms: number;
}

interface BenchmarkResult {
  model: string;
  fixtures: FixtureResult[];
  latency: { p50_ms: number; p95_ms: number; samples: number[] };
  qualification: { worker: string; reasoning: string; pro: string };
}

async function dmrFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function chatCompletion(
  model: string,
  messages: ChatMessage[],
  maxTokens = 256,
): Promise<{ content: string; elapsed_ms: number }> {
  const start = performance.now();
  const raw = await dmrFetch<ChatResponse>(DMR_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0,
    }),
  });
  const res = ChatResponseSchema.parse(raw);
  const elapsed_ms = Math.round(performance.now() - start);
  const content = res.choices?.[0]?.message?.content?.trim() ?? "";
  return { content, elapsed_ms };
}

function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Multi-OS Hardware Detection
// ---------------------------------------------------------------------------

function detectCpuMacOS(): { arch: string; cores: number; model: string } {
  const arch = process.arch; // 'arm64' or 'x64'
  const cores = parseInt(execSafe("sysctl -n hw.ncpu") ?? "0", 10) || 0;
  const model = execSafe("sysctl -n machdep.cpu.brand_string") ?? "Unknown Mac CPU";
  return { arch, cores, model };
}

function detectCpuLinux(): { arch: string; cores: number; model: string } {
  const arch = process.arch;
  const lscpuOutput = execSafe("lscpu");
  let cores = 0;
  let model = "Unknown Linux CPU";
  if (lscpuOutput) {
    const coresMatch = lscpuOutput.match(/^CPU\(s\):\s+(\d+)/m);
    if (coresMatch) cores = parseInt(coresMatch[1], 10);
    const modelMatch = lscpuOutput.match(/^Model name:\s+(.+)/m);
    if (modelMatch) model = modelMatch[1].trim();
  }
  return { arch, cores: cores || 1, model };
}

function detectCpuWindows(): { arch: string; cores: number; model: string } {
  const arch = process.arch;
  const wmicOutput = execSafe("wmic cpu get Name,NumberOfCores /format:csv");
  let cores = 0;
  let model = "Unknown Windows CPU";
  if (wmicOutput) {
    const lines = wmicOutput.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length >= 2) {
      const parts = lines[lines.length - 1].split(",");
      if (parts.length >= 3) {
        model = parts[1]?.trim() ?? model;
        cores = parseInt(parts[2]?.trim() ?? "0", 10);
      }
    }
  }
  return { arch, cores: cores || 1, model };
}

function detectGpuMacOS(): { type: "metal" | "cuda" | "none"; cores: number | null; vram: number | null } {
  const spOutput = execSafe("system_profiler SPDisplaysDataType -json");
  if (spOutput) {
    try {
      const parsed = JSON.parse(spOutput);
      const displays = parsed?.SPDisplaysDataType;
      if (Array.isArray(displays) && displays.length > 0) {
        const gpu = displays[0];
        const metalSupport = gpu?.sppci_metal_supported ?? gpu?.spdisplays_metal ?? "unknown";
        const isMetalStr = typeof metalSupport === "string" ? metalSupport.toLowerCase() : "";
        const isMetal = isMetalStr.includes("supported") || isMetalStr.includes("yes") ||
          isMetalStr === "spdisplays_metal_supported" || isMetalStr === "supported";
        // Apple Silicon GPUs share unified memory (no separate VRAM)
        // GPU cores on Apple Silicon (sppci_gpu_core_count or sppci_cores field)
        const gpuCores = gpu?.sppci_gpu_core_count
          ? parseInt(String(gpu.sppci_gpu_core_count), 10)
          : null;
        if (isMetal || process.arch === "arm64") {
          return { type: "metal", cores: gpuCores, vram: null };
        }
      }
    } catch {
      // JSON parse failed, fall through
    }
  }
  // Fallback: if arm64 Mac, assume Metal
  if (process.arch === "arm64") {
    return { type: "metal", cores: null, vram: null };
  }
  return { type: "none", cores: null, vram: null };
}

function detectGpuLinux(): { type: "metal" | "cuda" | "none"; cores: number | null; vram: number | null } {
  const nvidiaSmi = execSafe("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits");
  if (nvidiaSmi) {
    const parts = nvidiaSmi.split(",").map((s) => s.trim());
    const vramMb = parseInt(parts[1] ?? "0", 10);
    return { type: "cuda", cores: null, vram: vramMb > 0 ? parseFloat((vramMb / 1024).toFixed(2)) : null };
  }
  return { type: "none", cores: null, vram: null };
}

function detectGpuWindows(): { type: "metal" | "cuda" | "none"; cores: number | null; vram: number | null } {
  // Try nvidia-smi for CUDA
  const nvidiaSmi = execSafe("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits");
  if (nvidiaSmi) {
    const parts = nvidiaSmi.split(",").map((s) => s.trim());
    const vramMb = parseInt(parts[1] ?? "0", 10);
    return { type: "cuda", cores: null, vram: vramMb > 0 ? parseFloat((vramMb / 1024).toFixed(2)) : null };
  }
  return { type: "none", cores: null, vram: null };
}

function detectRamMacOS(): { totalGb: number; availableGb: number } {
  const memBytes = execSafe("sysctl -n hw.memsize");
  const totalGb = memBytes ? parseFloat((parseInt(memBytes, 10) / (1024 ** 3)).toFixed(2)) : 0;
  // vm_stat gives pages, multiply by page size
  const vmStat = execSafe("vm_stat");
  let availableGb = totalGb * 0.7; // fallback estimate
  if (vmStat) {
    const pageSizeStr = execSafe("sysctl -n hw.pagesize");
    const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 16384;
    const freeMatch = vmStat.match(/Pages free:\s+(\d+)/);
    const inactiveMatch = vmStat.match(/Pages inactive:\s+(\d+)/);
    const specMatch = vmStat.match(/Pages speculative:\s+(\d+)/);
    const freePages = parseInt(freeMatch?.[1] ?? "0", 10);
    const inactivePages = parseInt(inactiveMatch?.[1] ?? "0", 10);
    const specPages = parseInt(specMatch?.[1] ?? "0", 10);
    availableGb = parseFloat(((freePages + inactivePages + specPages) * pageSize / (1024 ** 3)).toFixed(2));
  }
  return { totalGb, availableGb };
}

function detectRamLinux(): { totalGb: number; availableGb: number } {
  const meminfo = execSafe("cat /proc/meminfo");
  let totalGb = 0;
  let availableGb = 0;
  if (meminfo) {
    const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
    const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
    if (totalMatch) totalGb = parseFloat((parseInt(totalMatch[1], 10) / (1024 ** 2)).toFixed(2));
    if (availMatch) availableGb = parseFloat((parseInt(availMatch[1], 10) / (1024 ** 2)).toFixed(2));
  }
  return { totalGb: totalGb || 1, availableGb };
}

function detectRamWindows(): { totalGb: number; availableGb: number } {
  const wmicOutput = execSafe("wmic OS get TotalVisibleMemorySize /value");
  let totalGb = 0;
  if (wmicOutput) {
    const match = wmicOutput.match(/TotalVisibleMemorySize=(\d+)/);
    if (match) totalGb = parseFloat((parseInt(match[1], 10) / (1024 ** 2)).toFixed(2));
  }
  return { totalGb: totalGb || 1, availableGb: totalGb * 0.7 };
}

function detectDisk(): { availableGb: number } {
  if (process.platform === "win32") {
    const wmicOutput = execSafe("wmic logicaldisk where \"DeviceID='C:'\" get FreeSpace /value");
    if (wmicOutput) {
      const match = wmicOutput.match(/FreeSpace=(\d+)/);
      if (match) {
        return { availableGb: parseFloat((parseInt(match[1], 10) / (1024 ** 3)).toFixed(2)) };
      }
    }
    return { availableGb: 0 };
  }
  // macOS / Linux
  const dfOutput = execSafe("df -k /");
  if (dfOutput) {
    const lines = dfOutput.split("\n");
    if (lines.length >= 2) {
      const cols = lines[1].split(/\s+/);
      const availKb = parseInt(cols[3] ?? "0", 10);
      return { availableGb: parseFloat((availKb / (1024 ** 2)).toFixed(2)) };
    }
  }
  return { availableGb: 0 };
}

function detectDocker(): HardwareProfile["docker"] {
  const engineVersion = execSafe("docker version --format '{{.Server.Version}}'");
  const composeVersion = execSafe("docker compose version --short");

  let dmrStatus: "available" | "unavailable" | "unknown" = "unknown";
  const dmrCheck = execSafe("docker model ls 2>&1");
  if (dmrCheck !== null) {
    const lower = dmrCheck.toLowerCase();
    // Specific error patterns that indicate DMR is unavailable
    if (lower.includes("is not running") || lower.includes("command not found") || lower.includes("error")) {
      dmrStatus = "unavailable";
    } else if (dmrCheck.startsWith("NAME") || dmrCheck.includes("ai/")) {
      // Table header ("NAME") or model entries indicate DMR is available
      dmrStatus = "available";
    } else {
      dmrStatus = "unknown";
    }
  } else {
    dmrStatus = "unavailable";
  }

  let allocatedCpu: number | null = null;
  let allocatedMemoryGb: number | null = null;
  const dockerInfo = execSafe("docker info --format '{{json .}}'");
  if (dockerInfo) {
    try {
      const info = JSON.parse(dockerInfo);
      allocatedCpu = typeof info.NCPU === "number" ? info.NCPU : null;
      if (typeof info.MemTotal === "number" && info.MemTotal > 0) {
        allocatedMemoryGb = parseFloat((info.MemTotal / (1024 ** 3)).toFixed(2));
      }
    } catch {
      // JSON parse failed
    }
  }

  return {
    engineVersion: engineVersion?.replace(/'/g, "") ?? null,
    composeVersion: composeVersion?.replace(/'/g, "") ?? null,
    dmrStatus,
    allocatedCpu,
    allocatedMemoryGb,
  };
}

function detectHardware(): HardwareProfile {
  const platform = process.platform;

  let cpu: HardwareProfile["cpu"];
  let gpu: HardwareProfile["gpu"];
  let ram: HardwareProfile["ram"];

  switch (platform) {
    case "darwin":
      cpu = detectCpuMacOS();
      gpu = detectGpuMacOS();
      ram = detectRamMacOS();
      break;
    case "linux":
      cpu = detectCpuLinux();
      gpu = detectGpuLinux();
      ram = detectRamLinux();
      break;
    case "win32":
      cpu = detectCpuWindows();
      gpu = detectGpuWindows();
      ram = detectRamWindows();
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}. Provide hardware profile manually.`);
  }

  const disk = detectDisk();
  const docker = detectDocker();

  const raw = { cpu, gpu, ram, disk, docker };
  return HardwareProfileSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Fitness Scoring
// ---------------------------------------------------------------------------

function scoreModelFitness(model: ModelCatalogEntry, hardware: HardwareProfile, ramReservationGb: number): FitnessResult {
  const ramBudget = hardware.ram.totalGb - ramReservationGb;
  const fits = model.ramRequiredGb <= ramBudget && model.diskRequiredGb <= hardware.disk.availableGb;

  // Score: weighted combination of RAM headroom and disk headroom, capped at 1
  const ramScore = fits ? Math.min(1, (ramBudget - model.ramRequiredGb) / ramBudget) : 0;
  const diskScore = fits
    ? Math.min(1, (hardware.disk.availableGb - model.diskRequiredGb) / hardware.disk.availableGb)
    : 0;
  const score = parseFloat((ramScore * 0.7 + diskScore * 0.3).toFixed(3));

  const result = {
    model: model.name,
    fits,
    score,
    ramNeededGb: model.ramRequiredGb,
    diskNeededGb: model.diskRequiredGb,
    ramAvailableGb: parseFloat(ramBudget.toFixed(2)),
    tier: model.tier,
  };
  return FitnessResultSchema.parse(result);
}

// ---------------------------------------------------------------------------
// CAN Ceiling Calculator
// ---------------------------------------------------------------------------

function computeCanCeiling(hardware: HardwareProfile, ramReservationGb: number): CeilingCan {
  const effectiveRam = Math.min(hardware.ram.totalGb, hardware.docker.allocatedMemoryGb ?? hardware.ram.totalGb);
  const ramBudget = effectiveRam - ramReservationGb;
  const qualifiedModels: Record<Tier, string[]> = {
    worker: [],
    reasoning: [],
    pro: [],
  };

  for (const model of MODEL_CATALOG) {
    const fitness = scoreModelFitness(model, hardware, ramReservationGb);
    if (fitness.fits) {
      qualifiedModels[model.tier].push(model.name);
    }
  }

  // Max concurrent models: how many of the smallest qualified model fit in RAM
  const fittingModels = MODEL_CATALOG.filter((m) => m.ramRequiredGb <= ramBudget);
  const smallestRam = fittingModels.length > 0
    ? Math.min(...fittingModels.map((m) => m.ramRequiredGb))
    : 0;
  const maxConcurrent = smallestRam > 0 ? Math.floor(ramBudget / smallestRam) : 0;

  const raw = {
    maxConcurrentModels: maxConcurrent,
    totalRamBudgetGb: parseFloat(ramBudget.toFixed(2)),
    availableDiskGb: hardware.disk.availableGb,
    qualifiedModels,
  };
  return CeilingCanSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Effective Ceiling = min(CAN, WANT)
// ---------------------------------------------------------------------------

function computeEffectiveCeiling(can: CeilingCan, want: CeilingWant): EffectiveCeiling {
  const explanation: Record<string, string> = {};

  // maxMinions: min of CAN concurrent and WANT minions
  const maxMinions = Math.min(can.maxConcurrentModels, want.maxMinions);
  if (want.maxMinions > can.maxConcurrentModels) {
    explanation["maxMinions"] =
      `Wanted ${want.maxMinions} but hardware supports at most ${can.maxConcurrentModels} concurrent models. Capped to ${maxMinions}.`;
  } else {
    explanation["maxMinions"] = `Wanted ${want.maxMinions}, hardware supports ${can.maxConcurrentModels}. Using ${maxMinions}.`;
  }

  // allowedTiers: intersection of WANT tiers and CAN tiers (tiers with qualified models)
  const canTiers = (Object.entries(can.qualifiedModels) as [Tier, string[]][])
    .filter(([, models]) => models.length > 0)
    .map(([tier]) => tier);
  const allowedTiers = want.allowedTiers.filter((t) => canTiers.includes(t));
  const droppedTiers = want.allowedTiers.filter((t) => !canTiers.includes(t));
  if (droppedTiers.length > 0) {
    explanation["allowedTiers"] =
      `Tiers ${droppedTiers.join(", ")} have no qualified models on this hardware. Using: ${allowedTiers.join(", ") || "none"}.`;
  } else {
    explanation["allowedTiers"] = `All requested tiers (${allowedTiers.join(", ")}) have qualified models.`;
  }

  // selectedModels: validate WANT selections fit within CAN
  const selectedModels: Record<string, string> = {};
  for (const [tier, modelName] of Object.entries(want.selectedModels)) {
    const qualifiedForTier = can.qualifiedModels[tier as Tier] ?? [];
    if (qualifiedForTier.includes(modelName)) {
      selectedModels[tier] = modelName;
      explanation[`model:${tier}`] = `Selected ${modelName} for ${tier} tier (qualified).`;
    } else if (qualifiedForTier.length > 0) {
      // Fall back to first qualified model
      selectedModels[tier] = qualifiedForTier[0];
      explanation[`model:${tier}`] =
        `Wanted ${modelName} for ${tier} but it does not fit. Fell back to ${qualifiedForTier[0]}.`;
    } else {
      explanation[`model:${tier}`] = `No qualified models for ${tier} tier. Skipped.`;
    }
  }

  // Remove selectedModels entries for tiers excluded from allowedTiers
  for (const tier of Object.keys(selectedModels)) {
    if (!allowedTiers.includes(tier as Tier)) {
      delete selectedModels[tier];
      explanation[`model:${tier}`] = `Tier ${tier} excluded — model removed from selection.`;
    }
  }

  const raw = { maxMinions, allowedTiers, selectedModels, explanation };
  return EffectiveCeilingSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Fixtures — W5-style tier qualification tests (preserved from original)
// ---------------------------------------------------------------------------

async function fixtureStructuredJson(model: string): Promise<FixtureAttempt[]> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: "You are a code classifier. Respond ONLY with a JSON object, no other text.",
    },
    {
      role: "user",
      content:
        'Classify this file path into a category. Path: "src/auth/login.ts". ' +
        "Respond with exactly this JSON structure: " +
        '{"path": "<the path>", "category": "<one of: auth, api, ui, config, test, other>", "confidence": <number between 0 and 1>}',
    },
  ];

  const attempts: FixtureAttempt[] = [];
  for (let i = 1; i <= FIXTURE_ATTEMPTS; i++) {
    const { content, elapsed_ms } = await chatCompletion(model, messages);
    const json_valid = isValidJson(content);
    let strict_correct = false;
    if (json_valid) {
      try {
        const parsed = JSON.parse(content);
        strict_correct =
          parsed.path === "src/auth/login.ts" &&
          parsed.category === "auth" &&
          typeof parsed.confidence === "number" &&
          parsed.confidence >= 0 &&
          parsed.confidence <= 1;
      } catch {
        /* noop */
      }
    }
    attempts.push({ attempt: i, elapsed_ms, json_valid, strict_correct, raw_content: content });
  }
  return attempts;
}

async function fixtureClassification(model: string): Promise<FixtureAttempt[]> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: "You are a repository analyzer. Respond ONLY with a JSON object, no other text.",
    },
    {
      role: "user",
      content:
        "Group these files by module: " +
        "src/auth/login.ts, src/auth/register.ts, src/api/users.ts, src/api/posts.ts, src/ui/Button.tsx. " +
        "Respond with exactly this JSON structure: " +
        '{"modules": [{"name": "<module name>", "files": ["<file1>", "<file2>"]}]}',
    },
  ];

  const attempts: FixtureAttempt[] = [];
  for (let i = 1; i <= FIXTURE_ATTEMPTS; i++) {
    const { content, elapsed_ms } = await chatCompletion(model, messages);
    const json_valid = isValidJson(content);
    let strict_correct = false;
    if (json_valid) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed.modules) && parsed.modules.length >= 3) {
          const allFilesPresent = parsed.modules.every(
            (m: { name: string; files: string[] }) =>
              typeof m.name === "string" && Array.isArray(m.files) && m.files.length > 0,
          );
          const totalFiles = parsed.modules.reduce(
            (sum: number, m: { files: string[] }) => sum + m.files.length,
            0,
          );
          strict_correct = allFilesPresent && totalFiles === 5;
        }
      } catch {
        /* noop */
      }
    }
    attempts.push({ attempt: i, elapsed_ms, json_valid, strict_correct, raw_content: content });
  }
  return attempts;
}

async function fixtureDiagnosis(model: string): Promise<FixtureAttempt[]> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: "You are a test-failure diagnostician. Respond ONLY with a JSON object, no other text.",
    },
    {
      role: "user",
      content:
        "A test failed with this output:\n\n" +
        "```\n" +
        "FAIL src/utils/math.test.ts\n" +
        "  add(2, 3)\n" +
        "    Expected: 5\n" +
        "    Received: -1\n" +
        "```\n\n" +
        "The function is:\n" +
        "```typescript\n" +
        "function add(a: number, b: number): number {\n" +
        "  return a - b;\n" +
        "}\n" +
        "```\n\n" +
        "Respond with exactly this JSON structure: " +
        '{"bug": "<one-line description of the bug>", "fix": "<the corrected return statement>"}',
    },
  ];

  const attempts: FixtureAttempt[] = [];
  for (let i = 1; i <= FIXTURE_ATTEMPTS; i++) {
    const { content, elapsed_ms } = await chatCompletion(model, messages);
    const json_valid = isValidJson(content);
    let strict_correct = false;
    if (json_valid) {
      try {
        const parsed = JSON.parse(content);
        strict_correct =
          typeof parsed.bug === "string" &&
          parsed.bug.length > 0 &&
          typeof parsed.fix === "string" &&
          parsed.fix.includes("a + b");
      } catch {
        /* noop */
      }
    }
    attempts.push({ attempt: i, elapsed_ms, json_valid, strict_correct, raw_content: content });
  }
  return attempts;
}

async function fixtureLatency(model: string, samples = 5): Promise<number[]> {
  const latencies: number[] = [];
  for (let i = 0; i < samples; i++) {
    const { elapsed_ms } = await chatCompletion(
      model,
      [{ role: "user", content: "Say hello." }],
      16,
    );
    latencies.push(elapsed_ms);
  }
  return latencies;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdDetect(): Promise<void> {
  const profile = detectHardware();
  console.log(JSON.stringify(profile, null, 2));
}

async function cmdFitness(): Promise<void> {
  const hardware = detectHardware();
  const results = MODEL_CATALOG.map((model) =>
    scoreModelFitness(model, hardware, DEFAULT_RAM_RESERVATION_GB),
  );

  console.error(`Hardware: ${hardware.cpu.model} | ${hardware.ram.totalGb} GB RAM | GPU: ${hardware.gpu.type}`);
  console.error(`RAM budget: ${(hardware.ram.totalGb - DEFAULT_RAM_RESERVATION_GB).toFixed(1)} GB (after ${DEFAULT_RAM_RESERVATION_GB} GB OS reservation)\n`);

  // Group by tier for display
  for (const tier of ["worker", "reasoning", "pro"] as Tier[]) {
    const tierResults = results.filter((r) => r.tier === tier);
    console.error(`--- ${tier.toUpperCase()} tier ---`);
    for (const r of tierResults) {
      const status = r.fits ? "FITS" : "NO";
      const bar = "=".repeat(Math.round(r.score * 20));
      console.error(`  ${status.padEnd(4)} ${r.model.padEnd(22)} RAM: ${r.ramNeededGb.toFixed(1)} GB  Score: ${r.score.toFixed(3)} ${bar}`);
    }
    console.error();
  }

  // JSON output to stdout
  console.log(JSON.stringify(results, null, 2));
}

async function cmdCeiling(args: string[]): Promise<void> {
  // Parse CLI arguments
  let maxMinions: number | null = null;
  let tiers: Tier[] | null = null;
  let ramReservation = DEFAULT_RAM_RESERVATION_GB;
  let save = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--max-minions":
        maxMinions = parseInt(args[++i] ?? "", 10);
        if (isNaN(maxMinions) || maxMinions < 1) {
          console.error("Error: --max-minions must be a positive integer.");
          process.exit(1);
        }
        break;
      case "--tiers":
        tiers = (args[++i] ?? "").split(",").map((t) => t.trim()) as Tier[];
        for (const t of tiers) {
          const result = TierSchema.safeParse(t);
          if (!result.success) {
            console.error(`Error: invalid tier "${t}". Must be one of: worker, reasoning, pro`);
            process.exit(1);
          }
        }
        break;
      case "--ram-reservation":
        ramReservation = parseFloat(args[++i] ?? "");
        if (isNaN(ramReservation) || ramReservation < 0) {
          console.error("Error: --ram-reservation must be a non-negative number.");
          process.exit(1);
        }
        break;
      case "--save":
        save = true;
        break;
      case "--help":
        console.log(`Usage: virgil-model-probe ceiling [options]

Options:
  --max-minions <n>        Desired max concurrent minions (default: interactive prompt)
  --tiers <t1,t2>          Allowed tiers, comma-separated: worker,reasoning,pro (default: interactive prompt)
  --ram-reservation <gb>   GB reserved for OS (default: ${DEFAULT_RAM_RESERVATION_GB})
  --save                   Persist effective ceiling to virgil.json
  --help                   Show this help message

Without --max-minions and --tiers, prints CAN ceiling and prompts for WANT values.`);
        return;
    }
  }

  // Detect hardware
  const hardware = detectHardware();
  const can = computeCanCeiling(hardware, ramReservation);

  console.error("=== CAN Ceiling (what hardware supports) ===");
  console.error(`  Max concurrent models: ${can.maxConcurrentModels}`);
  console.error(`  Total RAM budget:      ${can.totalRamBudgetGb.toFixed(1)} GB`);
  console.error(`  Available disk:        ${can.availableDiskGb.toFixed(1)} GB`);
  for (const tier of ["worker", "reasoning", "pro"] as Tier[]) {
    const models = can.qualifiedModels[tier] ?? [];
    console.error(`  ${tier.padEnd(10)} models:  ${models.length > 0 ? models.join(", ") : "(none)"}`);
  }
  console.error();

  // If interactive mode (no WANT args), prompt the user
  if (maxMinions === null) {
    const answer = await prompt(`How many concurrent minions do you want? (max ${can.maxConcurrentModels}): `);
    maxMinions = parseInt(answer, 10);
    if (isNaN(maxMinions) || maxMinions < 1) {
      console.error("Invalid input. Using 1.");
      maxMinions = 1;
    }
  }

  if (tiers === null) {
    const availTiers = (["worker", "reasoning", "pro"] as Tier[]).filter(
      (t) => (can.qualifiedModels[t] ?? []).length > 0,
    );
    const answer = await prompt(`Allowed tiers (comma-separated, available: ${availTiers.join(",")}): `);
    tiers = answer.split(",").map((t) => t.trim()).filter(Boolean) as Tier[];
    if (tiers.length === 0) {
      tiers = availTiers.length > 0 ? [availTiers[0]] : ["worker"];
    }
  }

  // Auto-select best model per tier (highest score)
  const selectedModels: Record<string, string> = {};
  for (const tier of tiers) {
    const qualified = can.qualifiedModels[tier] ?? [];
    if (qualified.length > 0) {
      // Pick the model with the highest fitness score
      const fitnessScores = qualified.map((name) => {
        const entry = MODEL_CATALOG.find((m) => m.name === name)!;
        return scoreModelFitness(entry, hardware, ramReservation);
      });
      fitnessScores.sort((a, b) => b.score - a.score);
      selectedModels[tier] = fitnessScores[0].model;
    }
  }

  const want: CeilingWant = CeilingWantSchema.parse({
    maxMinions,
    allowedTiers: tiers,
    selectedModels,
    ramReservationGb: ramReservation,
  });

  const effective = computeEffectiveCeiling(can, want);

  if (effective.allowedTiers.length === 0) {
    console.error("\nNo tiers qualify on this hardware. Cannot save ceiling.");
    console.error("Consider: increasing Docker memory, reducing RAM reservation, or using smaller models.");
    if (save) process.exit(1);
  }

  console.error("=== WANT Ceiling (what you requested) ===");
  console.error(`  Max minions:    ${want.maxMinions}`);
  console.error(`  Allowed tiers:  ${want.allowedTiers.join(", ")}`);
  console.error(`  RAM reservation: ${want.ramReservationGb} GB`);
  console.error();

  console.error("=== Effective Ceiling (min of CAN, WANT) ===");
  console.error(`  Max minions:    ${effective.maxMinions}`);
  console.error(`  Allowed tiers:  ${effective.allowedTiers.join(", ")}`);
  for (const [tier, model] of Object.entries(effective.selectedModels)) {
    console.error(`  ${tier} model:  ${model}`);
  }
  console.error();
  for (const [dim, reason] of Object.entries(effective.explanation)) {
    console.error(`  [${dim}] ${reason}`);
  }

  // JSON output to stdout
  console.log(JSON.stringify(effective, null, 2));

  if (save) {
    const { config } = loadConfig();
    const configPath = getConfigPath();

    // Determine highest allowed tier for the ceiling field
    const tierRank: Record<string, number> = { worker: 1, reasoning: 2, pro: 3 };
    const highestTier = effective.allowedTiers.reduce((max, t) =>
      (tierRank[t] ?? 0) > (tierRank[max] ?? 0) ? t : max,
    effective.allowedTiers[0] ?? "worker");

    // Pick model from the highest available tier
    const selectedModel = effective.selectedModels[highestTier] ?? null;

    const localMinions: VirgilLocalMinionsConfig = VirgilLocalMinionsConfigSchema.parse({
      ceiling: highestTier,
      allowedTiers: effective.allowedTiers,
      model: selectedModel,
      effectiveCeiling: effective,
      hardwareProfileHash: hashProfile(hardware),
      lastProbeDate: new Date().toISOString(),
    });

    config.localMinions = localMinions;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    console.error(`\nSaved to ${configPath}`);
  }
}

async function cmdProbe(): Promise<void> {
  console.log(`Probing DMR at ${DMR_MODELS_URL} ...\n`);

  let models: z.infer<typeof ModelsResponseSchema>;
  try {
    const raw = await dmrFetch<ModelsResponse>(DMR_MODELS_URL);
    models = ModelsResponseSchema.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      console.error(
        "ERROR: Cannot reach DMR at localhost:12434. Is Docker Model Runner running?",
      );
      process.exit(1);
    }
    throw err;
  }

  if (!models.data || models.data.length === 0) {
    console.log("No models available in DMR.");
    console.log("Pull a model with: docker model pull <model-name>");
    return;
  }

  console.log(`Found ${models.data.length} model(s):\n`);

  for (const m of models.data) {
    console.log(`  ID:        ${m.id}`);
    console.log(`  Object:    ${m.object}`);
    if (m.created) {
      console.log(`  Created:   ${new Date(m.created * 1000).toISOString()}`);
    }
    if (m.owned_by) {
      console.log(`  Owned by:  ${m.owned_by}`);
    }
    const knownKeys = new Set(["id", "object", "created", "owned_by"]);
    for (const [key, value] of Object.entries(m)) {
      if (!knownKeys.has(key) && value !== undefined) {
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }
    }
    console.log();
  }
}

async function cmdBenchmark(modelName: string): Promise<void> {
  console.log(`Benchmarking model "${modelName}" against tier qualification fixtures...\n`);

  let models: z.infer<typeof ModelsResponseSchema>;
  try {
    const raw = await dmrFetch<ModelsResponse>(DMR_MODELS_URL);
    models = ModelsResponseSchema.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      console.error(
        "ERROR: Cannot reach DMR at localhost:12434. Is Docker Model Runner running?",
      );
      process.exit(1);
    }
    throw err;
  }

  const modelExists = models.data?.some((m) => m.id === modelName);
  if (!modelExists) {
    console.error(`ERROR: Model "${modelName}" not found in DMR.`);
    console.error(`Available models: ${models.data?.map((m) => m.id).join(", ") || "(none)"}`);
    process.exit(1);
  }

  const fixtures: FixtureResult[] = [];

  console.log("  [1/4] Structured JSON output...");
  const jsonAttempts = await fixtureStructuredJson(modelName);
  const jsonPassRate =
    jsonAttempts.filter((a) => a.strict_correct).length / jsonAttempts.length;
  fixtures.push({
    name: "structured_json",
    attempts: jsonAttempts,
    pass_rate: jsonPassRate,
    avg_latency_ms: Math.round(
      jsonAttempts.reduce((s, a) => s + a.elapsed_ms, 0) / jsonAttempts.length,
    ),
  });
  console.log(
    `         ${(jsonPassRate * 100).toFixed(0)}% pass (${jsonAttempts.filter((a) => a.strict_correct).length}/${jsonAttempts.length})`,
  );

  console.log("  [2/4] Classification...");
  const classAttempts = await fixtureClassification(modelName);
  const classPassRate =
    classAttempts.filter((a) => a.strict_correct).length / classAttempts.length;
  fixtures.push({
    name: "classification",
    attempts: classAttempts,
    pass_rate: classPassRate,
    avg_latency_ms: Math.round(
      classAttempts.reduce((s, a) => s + a.elapsed_ms, 0) / classAttempts.length,
    ),
  });
  console.log(
    `         ${(classPassRate * 100).toFixed(0)}% pass (${classAttempts.filter((a) => a.strict_correct).length}/${classAttempts.length})`,
  );

  console.log("  [3/4] Bug diagnosis...");
  const diagAttempts = await fixtureDiagnosis(modelName);
  const diagPassRate =
    diagAttempts.filter((a) => a.strict_correct).length / diagAttempts.length;
  fixtures.push({
    name: "diagnosis",
    attempts: diagAttempts,
    pass_rate: diagPassRate,
    avg_latency_ms: Math.round(
      diagAttempts.reduce((s, a) => s + a.elapsed_ms, 0) / diagAttempts.length,
    ),
  });
  console.log(
    `         ${(diagPassRate * 100).toFixed(0)}% pass (${diagAttempts.filter((a) => a.strict_correct).length}/${diagAttempts.length})`,
  );

  console.log("  [4/4] Latency measurement...");
  const latencies = await fixtureLatency(modelName);
  const p50 = median(latencies);
  const p95 = percentile(latencies, 95);
  console.log(`         p50: ${p50}ms, p95: ${p95}ms\n`);

  const workerScore = (jsonPassRate + classPassRate) / 2;
  const reasoningScore = (jsonPassRate + classPassRate + diagPassRate) / 3;

  const worker = workerScore >= WORKER_THRESHOLD ? "qualified" : "unqualified";
  const reasoning = reasoningScore >= REASONING_THRESHOLD ? "qualified" : "unqualified";
  const pro = "untested";

  const result: BenchmarkResult = {
    model: modelName,
    fixtures,
    latency: { p50_ms: p50, p95_ms: p95, samples: latencies },
    qualification: { worker, reasoning, pro },
  };

  console.log("--- Qualification Verdict ---");
  console.log(`  Worker:    ${worker} (${(workerScore * 100).toFixed(0)}%, threshold: ${WORKER_THRESHOLD * 100}%)`);
  console.log(`  Reasoning: ${reasoning} (${(reasoningScore * 100).toFixed(0)}%, threshold: ${REASONING_THRESHOLD * 100}%)`);
  console.log(`  Pro:       ${pro}`);
  console.log();
  console.log("--- Full Results (JSON) ---");
  console.log(JSON.stringify(result, null, 2));
}

async function cmdSelect(modelName: string): Promise<void> {
  // Check fitness against ceiling before allowing selection
  const hardware = detectHardware();
  const catalogEntry = MODEL_CATALOG.find((m) => m.name === modelName);

  if (catalogEntry) {
    const fitness = scoreModelFitness(catalogEntry, hardware, DEFAULT_RAM_RESERVATION_GB);
    if (!fitness.fits) {
      console.error(`ERROR: Model "${modelName}" does not fit on this hardware.`);
      console.error(`  RAM needed:    ${fitness.ramNeededGb.toFixed(1)} GB`);
      console.error(`  RAM available: ${fitness.ramAvailableGb.toFixed(1)} GB`);
      console.error(`  Disk needed:   ${fitness.diskNeededGb.toFixed(1)} GB`);
      console.error(`  Disk available: ${hardware.disk.availableGb.toFixed(1)} GB`);
      console.error("\nRun 'virgil-model-probe fitness' to see which models fit.");
      process.exit(1);
    }
  }

  // Verify model exists in DMR
  let models: z.infer<typeof ModelsResponseSchema>;
  try {
    const raw = await dmrFetch<ModelsResponse>(DMR_MODELS_URL);
    models = ModelsResponseSchema.parse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      console.error(
        "ERROR: Cannot reach DMR at localhost:12434. Is Docker Model Runner running?",
      );
      process.exit(1);
    }
    throw err;
  }

  const modelExists = models.data?.some((m) => m.id === modelName);
  if (!modelExists) {
    console.error(`ERROR: Model "${modelName}" not found in DMR.`);
    console.error(`Available models: ${models.data?.map((m) => m.id).join(", ") || "(none)"}`);
    process.exit(1);
  }

  const { config, localMinions } = loadConfig();
  const configPath = getConfigPath();

  localMinions.model = modelName;
  config.localMinions = localMinions;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  console.log(`Model selected: "${modelName}"`);
  console.log(`Updated virgil.json at ${configPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const allArgs = process.argv.slice(2);
  const command = allArgs[0];
  const restArgs = allArgs.slice(1);

  switch (command) {
    case "detect":
      await cmdDetect();
      break;
    case "fitness":
      await cmdFitness();
      break;
    case "ceiling":
      await cmdCeiling(restArgs);
      break;
    case "probe":
      await cmdProbe();
      break;
    case "benchmark":
      if (!restArgs[0]) {
        console.error("Usage: virgil-model-probe benchmark <model-name>");
        process.exit(1);
      }
      await cmdBenchmark(restArgs[0]);
      break;
    case "select":
      if (!restArgs[0]) {
        console.error("Usage: virgil-model-probe select <model-name>");
        process.exit(1);
      }
      await cmdSelect(restArgs[0]);
      break;
    default:
      console.error("Usage: virgil-model-probe <detect|fitness|ceiling|probe|benchmark|select> [args...]");
      console.error();
      console.error("Commands:");
      console.error("  detect              Detect hardware profile (no network)");
      console.error("  fitness             Score all catalog models against hardware (no network)");
      console.error("  ceiling [options]   CAN/WANT ceiling calculator (no network)");
      console.error("  probe               List models from DMR at localhost:12434");
      console.error("  benchmark <model>   Run tier qualification fixtures against a model");
      console.error("  select <model>      Write selected model to virgil.json");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
