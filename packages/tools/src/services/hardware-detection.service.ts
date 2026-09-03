import { Injectable } from '@nestjs/common';
import { execSync } from 'node:child_process';
import type { HardwareProfile } from '../schemas/index.js';
import { HardwareProfileSchema } from '../schemas/index.js';

export class UnsupportedPlatformError extends Error {
  constructor(platform: string) {
    super(
      `Unsupported platform: ${platform}. Provide hardware profile manually.`,
    );
    this.name = 'UnsupportedPlatformError';
  }
}

function execSafe(cmd: string): string | null {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

@Injectable()
export class HardwareDetectionService {
  detect(): HardwareProfile {
    const platform = process.platform;

    let cpu: HardwareProfile['cpu'];
    let gpu: HardwareProfile['gpu'];
    let ram: HardwareProfile['ram'];

    switch (platform) {
      case 'darwin':
        cpu = this.detectCpuMacOS();
        gpu = this.detectGpuMacOS();
        ram = this.detectRamMacOS();
        break;
      case 'linux':
        cpu = this.detectCpuLinux();
        gpu = this.detectGpuLinux();
        ram = this.detectRamLinux();
        break;
      case 'win32':
        cpu = this.detectCpuWindows();
        gpu = this.detectGpuWindows();
        ram = this.detectRamWindows();
        break;
      default:
        throw new UnsupportedPlatformError(platform);
    }

    const disk = this.detectDisk();
    const docker = this.detectDocker();

    const raw = { cpu, gpu, ram, disk, docker };
    return HardwareProfileSchema.parse(raw);
  }

  private detectCpuMacOS(): { arch: string; cores: number; model: string } {
    const arch = process.arch;
    const cores = parseInt(execSafe('sysctl -n hw.ncpu') ?? '0', 10) || 0;
    const model =
      execSafe('sysctl -n machdep.cpu.brand_string') ?? 'Unknown Mac CPU';
    return { arch, cores, model };
  }

  private detectCpuLinux(): { arch: string; cores: number; model: string } {
    const arch = process.arch;
    const lscpuOutput = execSafe('lscpu');
    let cores = 0;
    let model = 'Unknown Linux CPU';
    if (lscpuOutput) {
      const coresMatch = lscpuOutput.match(/^CPU\(s\):\s+(\d+)/m);
      if (coresMatch) cores = parseInt(coresMatch[1], 10);
      const modelMatch = lscpuOutput.match(/^Model name:\s+(.+)/m);
      if (modelMatch) model = modelMatch[1].trim();
    }
    return { arch, cores: cores || 1, model };
  }

  private detectCpuWindows(): { arch: string; cores: number; model: string } {
    const arch = process.arch;
    const wmicOutput = execSafe('wmic cpu get Name,NumberOfCores /format:csv');
    let cores = 0;
    let model = 'Unknown Windows CPU';
    if (wmicOutput) {
      const lines = wmicOutput.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length >= 2) {
        const parts = lines[lines.length - 1].split(',');
        if (parts.length >= 3) {
          model = parts[1]?.trim() ?? model;
          cores = parseInt(parts[2]?.trim() ?? '0', 10);
        }
      }
    }
    return { arch, cores: cores || 1, model };
  }

  private detectGpuMacOS(): {
    type: 'metal' | 'cuda' | 'none';
    cores: number | null;
    vram: number | null;
  } {
    const spOutput = execSafe('system_profiler SPDisplaysDataType -json');
    if (spOutput) {
      try {
        const parsed = JSON.parse(spOutput);
        const displays = parsed?.SPDisplaysDataType;
        if (Array.isArray(displays) && displays.length > 0) {
          const gpu = displays[0];
          const metalSupport =
            gpu?.sppci_metal_supported ?? gpu?.spdisplays_metal ?? 'unknown';
          const isMetalStr =
            typeof metalSupport === 'string' ? metalSupport.toLowerCase() : '';
          const isMetal =
            isMetalStr.includes('supported') ||
            isMetalStr.includes('yes') ||
            isMetalStr === 'spdisplays_metal_supported' ||
            isMetalStr === 'supported';
          const gpuCores = gpu?.sppci_gpu_core_count
            ? parseInt(String(gpu.sppci_gpu_core_count), 10)
            : null;
          if (isMetal || process.arch === 'arm64') {
            return { type: 'metal', cores: gpuCores, vram: null };
          }
        }
      } catch {
        // JSON parse failed, fall through
      }
    }
    if (process.arch === 'arm64') {
      return { type: 'metal', cores: null, vram: null };
    }
    return { type: 'none', cores: null, vram: null };
  }

  private detectGpuLinux(): {
    type: 'metal' | 'cuda' | 'none';
    cores: number | null;
    vram: number | null;
  } {
    const nvidiaSmi = execSafe(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
    );
    if (nvidiaSmi) {
      const parts = nvidiaSmi.split(',').map((s) => s.trim());
      const vramMb = parseInt(parts[1] ?? '0', 10);
      return {
        type: 'cuda',
        cores: null,
        vram: vramMb > 0 ? parseFloat((vramMb / 1024).toFixed(2)) : null,
      };
    }
    return { type: 'none', cores: null, vram: null };
  }

  private detectGpuWindows(): {
    type: 'metal' | 'cuda' | 'none';
    cores: number | null;
    vram: number | null;
  } {
    const nvidiaSmi = execSafe(
      'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
    );
    if (nvidiaSmi) {
      const parts = nvidiaSmi.split(',').map((s) => s.trim());
      const vramMb = parseInt(parts[1] ?? '0', 10);
      return {
        type: 'cuda',
        cores: null,
        vram: vramMb > 0 ? parseFloat((vramMb / 1024).toFixed(2)) : null,
      };
    }
    return { type: 'none', cores: null, vram: null };
  }

  private detectRamMacOS(): { totalGb: number; availableGb: number } {
    const memBytes = execSafe('sysctl -n hw.memsize');
    const totalGb = memBytes
      ? parseFloat((parseInt(memBytes, 10) / 1024 ** 3).toFixed(2))
      : 0;
    const vmStat = execSafe('vm_stat');
    let availableGb = totalGb * 0.7;
    if (vmStat) {
      const pageSizeStr = execSafe('sysctl -n hw.pagesize');
      const pageSize = pageSizeStr ? parseInt(pageSizeStr, 10) : 16384;
      const freeMatch = vmStat.match(/Pages free:\s+(\d+)/);
      const inactiveMatch = vmStat.match(/Pages inactive:\s+(\d+)/);
      const specMatch = vmStat.match(/Pages speculative:\s+(\d+)/);
      const freePages = parseInt(freeMatch?.[1] ?? '0', 10);
      const inactivePages = parseInt(inactiveMatch?.[1] ?? '0', 10);
      const specPages = parseInt(specMatch?.[1] ?? '0', 10);
      availableGb = parseFloat(
        (
          ((freePages + inactivePages + specPages) * pageSize) /
          1024 ** 3
        ).toFixed(2),
      );
    }
    return { totalGb, availableGb };
  }

  private detectRamLinux(): { totalGb: number; availableGb: number } {
    const meminfo = execSafe('cat /proc/meminfo');
    let totalGb = 0;
    let availableGb = 0;
    if (meminfo) {
      const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
      const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
      if (totalMatch)
        totalGb = parseFloat(
          (parseInt(totalMatch[1], 10) / 1024 ** 2).toFixed(2),
        );
      if (availMatch)
        availableGb = parseFloat(
          (parseInt(availMatch[1], 10) / 1024 ** 2).toFixed(2),
        );
    }
    return { totalGb: totalGb || 1, availableGb };
  }

  private detectRamWindows(): { totalGb: number; availableGb: number } {
    const wmicOutput = execSafe('wmic OS get TotalVisibleMemorySize /value');
    let totalGb = 0;
    if (wmicOutput) {
      const match = wmicOutput.match(/TotalVisibleMemorySize=(\d+)/);
      if (match)
        totalGb = parseFloat((parseInt(match[1], 10) / 1024 ** 2).toFixed(2));
    }
    return { totalGb: totalGb || 1, availableGb: totalGb * 0.7 };
  }

  private detectDisk(): { availableGb: number } {
    if (process.platform === 'win32') {
      const wmicOutput = execSafe(
        'wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace /value',
      );
      if (wmicOutput) {
        const match = wmicOutput.match(/FreeSpace=(\d+)/);
        if (match) {
          return {
            availableGb: parseFloat(
              (parseInt(match[1], 10) / 1024 ** 3).toFixed(2),
            ),
          };
        }
      }
      return { availableGb: 0 };
    }
    const dfOutput = execSafe('df -k /');
    if (dfOutput) {
      const lines = dfOutput.split('\n');
      if (lines.length >= 2) {
        const cols = lines[1].split(/\s+/);
        const availKb = parseInt(cols[3] ?? '0', 10);
        return { availableGb: parseFloat((availKb / 1024 ** 2).toFixed(2)) };
      }
    }
    return { availableGb: 0 };
  }

  private detectDocker(): HardwareProfile['docker'] {
    const engineVersion = execSafe(
      "docker version --format '{{.Server.Version}}'",
    );
    const composeVersion = execSafe('docker compose version --short');

    let dmrStatus: 'available' | 'unavailable' | 'unknown' = 'unknown';
    const dmrCheck = execSafe('docker model ls 2>&1');
    if (dmrCheck !== null) {
      const lower = dmrCheck.toLowerCase();
      if (
        lower.includes('is not running') ||
        lower.includes('command not found') ||
        lower.includes('error')
      ) {
        dmrStatus = 'unavailable';
      } else if (dmrCheck.startsWith('NAME') || dmrCheck.includes('ai/')) {
        dmrStatus = 'available';
      } else {
        dmrStatus = 'unknown';
      }
    } else {
      dmrStatus = 'unavailable';
    }

    let allocatedCpu: number | null = null;
    let allocatedMemoryGb: number | null = null;
    const dockerInfo = execSafe("docker info --format '{{json .}}'");
    if (dockerInfo) {
      try {
        const info = JSON.parse(dockerInfo);
        allocatedCpu = typeof info.NCPU === 'number' ? info.NCPU : null;
        if (typeof info.MemTotal === 'number' && info.MemTotal > 0) {
          allocatedMemoryGb = parseFloat(
            (info.MemTotal / 1024 ** 3).toFixed(2),
          );
        }
      } catch {
        // JSON parse failed
      }
    }

    return {
      engineVersion: engineVersion?.replace(/'/g, '') ?? null,
      composeVersion: composeVersion?.replace(/'/g, '') ?? null,
      dmrStatus,
      allocatedCpu,
      allocatedMemoryGb,
    };
  }
}
