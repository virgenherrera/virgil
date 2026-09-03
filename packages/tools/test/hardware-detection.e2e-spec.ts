import { Test, TestingModule } from '@nestjs/testing';
import { ProbeModule } from '../src/probe.module.js';
import { HardwareDetectionService } from '../src/services/index.js';
import { HardwareProfileSchema } from '../src/schemas/index.js';

describe('HardwareDetectionService (e2e)', () => {
  let moduleRef: TestingModule;
  let service: HardwareDetectionService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile();

    service = moduleRef.get(HardwareDetectionService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('is defined in the module', () => {
    expect(service).toBeDefined();
  });

  it('detect() returns a valid HardwareProfile that passes schema validation', () => {
    const profile = service.detect();
    expect(() => HardwareProfileSchema.parse(profile)).not.toThrow();
  });

  it('detect() returns cpu.arch as a non-empty string', () => {
    const profile = service.detect();
    expect(typeof profile.cpu.arch).toBe('string');
    expect(profile.cpu.arch.length).toBeGreaterThan(0);
  });

  it('detect() returns cpu.cores as a positive integer', () => {
    const profile = service.detect();
    expect(profile.cpu.cores).toBeGreaterThan(0);
    expect(Number.isInteger(profile.cpu.cores)).toBe(true);
  });

  it('detect() returns ram.totalGb greater than zero', () => {
    const profile = service.detect();
    expect(profile.ram.totalGb).toBeGreaterThan(0);
  });

  it('detect() returns ram.availableGb as a non-negative number', () => {
    const profile = service.detect();
    expect(profile.ram.availableGb).toBeGreaterThanOrEqual(0);
  });

  it('detect() returns disk.availableGb as a non-negative number', () => {
    const profile = service.detect();
    expect(profile.disk.availableGb).toBeGreaterThanOrEqual(0);
  });

  it('detect() returns gpu.type as one of the allowed values', () => {
    const profile = service.detect();
    expect(['metal', 'cuda', 'none']).toContain(profile.gpu.type);
  });

  it('detect() returns docker.dmrStatus as one of the allowed values', () => {
    const profile = service.detect();
    expect(['available', 'unavailable', 'unknown']).toContain(
      profile.docker.dmrStatus,
    );
  });
});
