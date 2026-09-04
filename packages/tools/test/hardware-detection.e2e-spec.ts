import { Test, TestingModule } from '@nestjs/testing';
import { execSync } from 'node:child_process';
import { ProbeModule } from '../src/probe.module.js';
import {
  HardwareDetectionService,
  UnsupportedPlatformError,
} from '../src/services/index.js';
import { HardwareProfileSchema } from '../src/schemas/index.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

/**
 * Maps command substrings to mock return values.
 * A null value causes execSync to throw (execSafe returns null).
 * An unmapped command also throws.
 */
function stubCommands(map: Record<string, string | null>): void {
  mockExecSync.mockImplementation(((cmd: string) => {
    for (const [pattern, response] of Object.entries(map)) {
      if ((cmd as string).includes(pattern)) {
        if (response === null) throw new Error(`command failed: ${pattern}`);
        return response;
      }
    }
    throw new Error(`unmocked command: ${cmd}`);
  }) as any);
}

// Common Docker command responses
const DOCKER_AVAILABLE: Record<string, string> = {
  'docker version --format': '27.0.0',
  'docker compose version': '2.30.0',
  'docker model ls': 'NAME\nai/test-model',
  'docker info --format': JSON.stringify({ NCPU: 10, MemTotal: 17179869184 }),
};

const DISK_UNIX: Record<string, string> = {
  'df -k':
    'Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/disk1s1 976101376 512000000 209715200 71% /',
};

describe('HardwareDetectionService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: HardwareDetectionService;
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  beforeEach(async () => {
    vi.resetAllMocks();
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();
    service = moduleRef.get(HardwareDetectionService);
  });

  afterEach(async () => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
    await moduleRef.close();
  });

  it('is defined in the module', () => {
    expect(service).toBeDefined();
  });

  // ── macOS (darwin) ─────────────────────────────────────────────────

  describe('detect() on macOS (darwin)', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      Object.defineProperty(process, 'arch', { value: 'arm64' });
    });

    it('returns a full profile with Metal GPU on arm64', () => {
      stubCommands({
        'hw.ncpu': '10',
        'machdep.cpu': 'Apple M1 Pro',
        system_profiler: JSON.stringify({
          SPDisplaysDataType: [
            {
              sppci_metal_supported: 'spdisplays_metal_supported',
              sppci_gpu_core_count: '16',
            },
          ],
        }),
        'hw.memsize': '34359738368',
        vm_stat:
          'Pages free: 262144\nPages inactive: 131072\nPages speculative: 65536',
        'hw.pagesize': '16384',
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      expect(() => HardwareProfileSchema.parse(profile)).not.toThrow();
      expect(profile.cpu.arch).toBe('arm64');
      expect(profile.cpu.cores).toBe(10);
      expect(profile.cpu.model).toBe('Apple M1 Pro');
      expect(profile.gpu.type).toBe('metal');
      expect(profile.gpu.cores).toBe(16);
      expect(profile.ram.totalGb).toBe(32);
      expect(profile.ram.availableGb).toBeGreaterThan(0);
      expect(profile.disk.availableGb).toBeGreaterThan(0);
      expect(profile.docker.engineVersion).toBe('27.0.0');
      expect(profile.docker.composeVersion).toBe('2.30.0');
      expect(profile.docker.dmrStatus).toBe('available');
      expect(profile.docker.allocatedCpu).toBe(10);
      expect(profile.docker.allocatedMemoryGb).toBe(16);

      expect(mockExecSync).toHaveBeenCalledWith(
        'sysctl -n hw.ncpu',
        expect.objectContaining({ encoding: 'utf8' }),
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'sysctl -n machdep.cpu.brand_string',
        expect.objectContaining({ encoding: 'utf8' }),
      );
    });

    it('throws schema validation error when all commands fail (cores=0, totalGb=0)', () => {
      // All commands throw → execSafe returns null → cores=0, totalGb=0
      // Schema requires positive cores and totalGb
      stubCommands({});

      expect(() => service.detect()).toThrow();
    });

    it('uses defaults for model/docker when only CPU and RAM commands succeed', () => {
      stubCommands({
        'hw.ncpu': '4',
        'hw.memsize': '17179869184',
      });

      const profile = service.detect();

      expect(() => HardwareProfileSchema.parse(profile)).not.toThrow();
      expect(profile.cpu.cores).toBe(4);
      expect(profile.cpu.model).toBe('Unknown Mac CPU');
      expect(profile.ram.totalGb).toBe(16);
      expect(profile.docker.engineVersion).toBeNull();
      expect(profile.docker.composeVersion).toBeNull();
      expect(profile.docker.dmrStatus).toBe('unavailable');
      expect(profile.docker.allocatedCpu).toBeNull();
      expect(profile.docker.allocatedMemoryGb).toBeNull();
    });

    it('detects Metal GPU on arm64 even without system_profiler output', () => {
      stubCommands({
        'hw.ncpu': '8',
        'machdep.cpu': 'Apple M2',
        system_profiler: null,
        'hw.memsize': '17179869184',
        vm_stat: null,
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      expect(profile.gpu.type).toBe('metal');
      expect(profile.gpu.cores).toBeNull();
      expect(profile.gpu.vram).toBeNull();
      // vm_stat null → available = total * 0.7
      expect(profile.ram.availableGb).toBeCloseTo(16 * 0.7, 1);
    });

    it('returns gpu.type=none on x64 Mac without Metal support', () => {
      Object.defineProperty(process, 'arch', { value: 'x64' });
      stubCommands({
        'hw.ncpu': '4',
        'machdep.cpu': 'Intel Core i7',
        system_profiler: JSON.stringify({
          SPDisplaysDataType: [
            {
              sppci_metal_supported: 'no_gpu',
            },
          ],
        }),
        'hw.memsize': '17179869184',
        vm_stat: null,
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      expect(profile.gpu.type).toBe('none');
      expect(profile.cpu.arch).toBe('x64');
    });

    it('detects Metal via spdisplays_metal field with "yes" value', () => {
      stubCommands({
        'hw.ncpu': '8',
        'machdep.cpu': 'Apple M3',
        system_profiler: JSON.stringify({
          SPDisplaysDataType: [
            {
              spdisplays_metal: 'Yes',
            },
          ],
        }),
        'hw.memsize': '34359738368',
        vm_stat: null,
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      expect(profile.gpu.type).toBe('metal');
      expect(profile.gpu.cores).toBeNull();
    });

    it('handles system_profiler returning invalid JSON', () => {
      stubCommands({
        'hw.ncpu': '8',
        'machdep.cpu': 'Apple M1',
        system_profiler: 'not valid json {{{',
        'hw.memsize': '17179869184',
        vm_stat: null,
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      // arm64 fallback → metal
      expect(profile.gpu.type).toBe('metal');
    });

    it('uses default page size when sysctl hw.pagesize fails', () => {
      stubCommands({
        'hw.ncpu': '8',
        'machdep.cpu': 'Apple M1',
        system_profiler: null,
        'hw.memsize': '34359738368',
        vm_stat:
          'Pages free: 262144\nPages inactive: 131072\nPages speculative: 65536',
        'hw.pagesize': null,
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      // Uses default page size of 16384
      const expectedGb = ((262144 + 131072 + 65536) * 16384) / 1024 ** 3;
      expect(profile.ram.availableGb).toBeCloseTo(expectedGb, 1);
    });
  });

  // ── Linux ──────────────────────────────────────────────────────────

  describe('detect() on Linux', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Object.defineProperty(process, 'arch', { value: 'x64' });
    });

    it('returns a full profile with CUDA GPU', () => {
      stubCommands({
        lscpu: 'CPU(s): 16\nModel name: AMD Ryzen 9 5950X',
        'nvidia-smi': 'NVIDIA RTX 4090, 24576',
        '/proc/meminfo': 'MemTotal: 33554432 kB\nMemAvailable: 16777216 kB',
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      expect(() => HardwareProfileSchema.parse(profile)).not.toThrow();
      expect(profile.cpu.arch).toBe('x64');
      expect(profile.cpu.cores).toBe(16);
      expect(profile.cpu.model).toBe('AMD Ryzen 9 5950X');
      expect(profile.gpu.type).toBe('cuda');
      expect(profile.gpu.vram).toBe(24);
      expect(profile.ram.totalGb).toBeCloseTo(32, 0);
      expect(profile.ram.availableGb).toBeCloseTo(16, 0);

      expect(mockExecSync).toHaveBeenCalledWith(
        'lscpu',
        expect.objectContaining({ encoding: 'utf8' }),
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('nvidia-smi'),
        expect.objectContaining({ encoding: 'utf8' }),
      );
    });

    it('handles missing nvidia-smi and null lscpu', () => {
      stubCommands({
        lscpu: null,
        'nvidia-smi': null,
        '/proc/meminfo': 'MemTotal: 16777216 kB\nMemAvailable: 8388608 kB',
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      expect(profile.cpu.cores).toBe(1); // || 1 fallback
      expect(profile.cpu.model).toBe('Unknown Linux CPU');
      expect(profile.gpu.type).toBe('none');
    });

    it('returns cuda with null vram when nvidia-smi reports 0 memory', () => {
      stubCommands({
        lscpu: 'CPU(s): 4\nModel name: Intel Xeon',
        'nvidia-smi': 'Tesla T4, 0',
        '/proc/meminfo': 'MemTotal: 16777216 kB\nMemAvailable: 8388608 kB',
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      expect(profile.gpu.type).toBe('cuda');
      expect(profile.gpu.vram).toBeNull();
    });

    it('defaults to 1 GB RAM when /proc/meminfo is unavailable', () => {
      stubCommands({
        lscpu: 'CPU(s): 2\nModel name: Generic CPU',
        'nvidia-smi': null,
        '/proc/meminfo': null,
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      expect(profile.ram.totalGb).toBe(1); // || 1 fallback
      expect(profile.ram.availableGb).toBe(0);
    });

    it('parses lscpu output without matching patterns', () => {
      stubCommands({
        lscpu: 'Architecture: x86_64\nSome other output',
        'nvidia-smi': null,
        '/proc/meminfo': 'MemTotal: 8388608 kB\nMemAvailable: 4194304 kB',
        ...DISK_UNIX,
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      // No CPU(s) match → cores 0 → || 1
      expect(profile.cpu.cores).toBe(1);
      // No Model name match → default
      expect(profile.cpu.model).toBe('Unknown Linux CPU');
    });
  });

  // ── Windows (win32) ────────────────────────────────────────────────

  describe('detect() on Windows (win32)', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      Object.defineProperty(process, 'arch', { value: 'x64' });
    });

    it('returns a full profile with CUDA GPU and disk via wmic', () => {
      stubCommands({
        'wmic cpu': '\nNode,Name,NumberOfCores\nMYPC,Intel Core i9-13900K,24',
        'nvidia-smi': 'NVIDIA RTX 4090, 24576',
        'wmic OS': 'TotalVisibleMemorySize=33554432',
        'wmic logicaldisk': 'FreeSpace=214748364800',
        'docker version --format': '27.0.0',
        'docker compose version': '2.30.0',
        'docker model ls': 'NAME\nai/test-model',
        'docker info --format': JSON.stringify({
          NCPU: 8,
          MemTotal: 17179869184,
        }),
      });

      const profile = service.detect();

      expect(() => HardwareProfileSchema.parse(profile)).not.toThrow();
      expect(profile.cpu.arch).toBe('x64');
      expect(profile.cpu.cores).toBe(24);
      expect(profile.cpu.model).toBe('Intel Core i9-13900K');
      expect(profile.gpu.type).toBe('cuda');
      expect(profile.gpu.vram).toBe(24);
      expect(profile.ram.totalGb).toBeCloseTo(32, 0);
      expect(profile.ram.availableGb).toBeCloseTo(32 * 0.7, 0);
      expect(profile.disk.availableGb).toBeCloseTo(200, 0);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('wmic cpu'),
        expect.objectContaining({ encoding: 'utf8' }),
      );
    });

    it('handles null wmic and no nvidia-smi', () => {
      stubCommands({
        'wmic cpu': null,
        'nvidia-smi': null,
        'wmic OS': null,
        'wmic logicaldisk': null,
        'docker version --format': null,
        'docker compose version': null,
        'docker model ls': null,
        'docker info --format': null,
      });

      const profile = service.detect();

      expect(profile.cpu.cores).toBe(1); // || 1 fallback
      expect(profile.cpu.model).toBe('Unknown Windows CPU');
      expect(profile.gpu.type).toBe('none');
      expect(profile.ram.totalGb).toBe(1); // || 1 fallback
      expect(profile.disk.availableGb).toBe(0);
    });

    it('handles wmic output with insufficient lines', () => {
      stubCommands({
        'wmic cpu': 'Node,Name,NumberOfCores',
        'nvidia-smi': null,
        'wmic OS': 'TotalVisibleMemorySize=16777216',
        'wmic logicaldisk': 'no match here',
        'docker version --format': null,
        'docker compose version': null,
        'docker model ls': null,
        'docker info --format': null,
      });

      const profile = service.detect();

      // Only 1 non-empty line → defaults
      expect(profile.cpu.cores).toBe(1);
      expect(profile.cpu.model).toBe('Unknown Windows CPU');
      // wmic logicaldisk no FreeSpace match
      expect(profile.disk.availableGb).toBe(0);
    });

    it('handles wmic CPU output with insufficient comma parts', () => {
      stubCommands({
        'wmic cpu': '\nheader\nMYPC,ShortName',
        'nvidia-smi': null,
        'wmic OS': null,
        'wmic logicaldisk': null,
        'docker version --format': null,
        'docker compose version': null,
        'docker model ls': null,
        'docker info --format': null,
      });

      const profile = service.detect();

      // parts.length < 3 → defaults
      expect(profile.cpu.cores).toBe(1);
    });
  });

  // ── Unsupported platform ──────────────────────────────────────────

  describe('unsupported platform', () => {
    it('throws UnsupportedPlatformError for freebsd', () => {
      Object.defineProperty(process, 'platform', { value: 'freebsd' });
      stubCommands({});

      expect(() => service.detect()).toThrow(UnsupportedPlatformError);
      expect(() => service.detect()).toThrow('Unsupported platform: freebsd');
    });
  });

  // ── Docker detection variants ─────────────────────────────────────

  describe('docker detection', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      Object.defineProperty(process, 'arch', { value: 'arm64' });
    });

    function macCpuGpuRamDisk(): Record<string, string | null> {
      return {
        'hw.ncpu': '8',
        'machdep.cpu': 'Apple M1',
        system_profiler: null,
        'hw.memsize': '17179869184',
        vm_stat: null,
        ...DISK_UNIX,
      };
    }

    it('detects DMR as unavailable when docker model ls reports "is not running"', () => {
      stubCommands({
        ...macCpuGpuRamDisk(),
        'docker version --format': '27.0.0',
        'docker compose version': '2.30.0',
        'docker model ls': 'Docker Desktop is not running',
        'docker info --format': null,
      });

      const profile = service.detect();

      expect(profile.docker.dmrStatus).toBe('unavailable');
    });

    it('detects DMR as unavailable when docker model ls reports "command not found"', () => {
      stubCommands({
        ...macCpuGpuRamDisk(),
        'docker version --format': null,
        'docker compose version': null,
        'docker model ls': 'docker: command not found',
        'docker info --format': null,
      });

      const profile = service.detect();

      expect(profile.docker.dmrStatus).toBe('unavailable');
    });

    it('detects DMR as unavailable when docker model ls reports "error"', () => {
      stubCommands({
        ...macCpuGpuRamDisk(),
        'docker version --format': '27.0.0',
        'docker compose version': '2.30.0',
        'docker model ls': 'Error response from daemon',
        'docker info --format': null,
      });

      const profile = service.detect();

      expect(profile.docker.dmrStatus).toBe('unavailable');
    });

    it('detects DMR as unavailable when docker model ls is null', () => {
      stubCommands({
        ...macCpuGpuRamDisk(),
        'docker version --format': '27.0.0',
        'docker compose version': '2.30.0',
        'docker model ls': null,
        'docker info --format': null,
      });

      const profile = service.detect();

      expect(profile.docker.dmrStatus).toBe('unavailable');
    });

    it('detects DMR as available when output contains "ai/"', () => {
      stubCommands({
        ...macCpuGpuRamDisk(),
        'docker version --format': '27.0.0',
        'docker compose version': '2.30.0',
        'docker model ls': 'ai/llama3.1:8b',
        'docker info --format': JSON.stringify({ NCPU: 8, MemTotal: 0 }),
      });

      const profile = service.detect();

      expect(profile.docker.dmrStatus).toBe('available');
    });

    it('detects DMR as unknown for unrecognized output', () => {
      stubCommands({
        ...macCpuGpuRamDisk(),
        'docker version --format': '27.0.0',
        'docker compose version': '2.30.0',
        'docker model ls': 'some unrecognized output',
        'docker info --format': null,
      });

      const profile = service.detect();

      expect(profile.docker.dmrStatus).toBe('unknown');
    });

    it('handles docker info with invalid JSON', () => {
      stubCommands({
        ...macCpuGpuRamDisk(),
        'docker version --format': '27.0.0',
        'docker compose version': '2.30.0',
        'docker model ls': 'NAME\nai/test-model',
        'docker info --format': 'not json {{{',
      });

      const profile = service.detect();

      expect(profile.docker.allocatedCpu).toBeNull();
      expect(profile.docker.allocatedMemoryGb).toBeNull();
    });

    it('handles docker info with non-numeric NCPU and zero MemTotal', () => {
      stubCommands({
        ...macCpuGpuRamDisk(),
        'docker version --format': '27.0.0',
        'docker compose version': '2.30.0',
        'docker model ls': 'NAME\nai/test-model',
        'docker info --format': JSON.stringify({
          NCPU: 'not-a-number',
          MemTotal: 0,
        }),
      });

      const profile = service.detect();

      expect(profile.docker.allocatedCpu).toBeNull();
      expect(profile.docker.allocatedMemoryGb).toBeNull();
    });

    it('strips quotes from docker version and compose version', () => {
      stubCommands({
        ...macCpuGpuRamDisk(),
        'docker version --format': "'27.1.0'",
        'docker compose version': "'2.31.0'",
        'docker model ls': 'NAME\nai/test-model',
        'docker info --format': JSON.stringify({
          NCPU: 4,
          MemTotal: 8589934592,
        }),
      });

      const profile = service.detect();

      expect(profile.docker.engineVersion).toBe('27.1.0');
      expect(profile.docker.composeVersion).toBe('2.31.0');
      expect(profile.docker.allocatedCpu).toBe(4);
      expect(profile.docker.allocatedMemoryGb).toBe(8);
    });
  });

  // ── Disk detection edge cases ─────────────────────────────────────

  describe('disk detection edge cases', () => {
    it('returns 0 when df output has fewer than 2 lines', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      Object.defineProperty(process, 'arch', { value: 'arm64' });
      stubCommands({
        'hw.ncpu': '8',
        'machdep.cpu': 'Apple M1',
        system_profiler: null,
        'hw.memsize': '17179869184',
        vm_stat: null,
        'df -k': 'Filesystem only-header-no-data',
        ...DOCKER_AVAILABLE,
      });

      const profile = service.detect();

      expect(profile.disk.availableGb).toBe(0);
    });
  });
});
