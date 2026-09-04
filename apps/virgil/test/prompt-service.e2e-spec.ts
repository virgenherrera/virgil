import { Test } from '@nestjs/testing';
import { SharedModule } from '../src/shared/shared.module.js';
import { PromptService } from '../src/shared/prompt.service.js';
import { NonTtyError } from '../src/shared/non-tty.error.js';

describe('PromptService', () => {
  let service: PromptService;
  let originalIsTTY: boolean | undefined;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [SharedModule],
    }).compile();
    service = module.get(PromptService);
    originalIsTTY = process.stdin.isTTY;
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      writable: true,
    });
  });

  it('throws NonTtyError when stdin is not TTY for input()', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
    });
    await expect(service.input('test')).rejects.toThrow(NonTtyError);
  });

  it('throws NonTtyError when stdin is not TTY for select()', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
    });
    await expect(
      service.select('test', [{ name: 'a', value: 'a' }]),
    ).rejects.toThrow(NonTtyError);
  });

  it('throws NonTtyError when stdin is not TTY for confirm()', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
    });
    await expect(service.confirm('test')).rejects.toThrow(NonTtyError);
  });

  it('throws NonTtyError when stdin is not TTY for checkbox()', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
    });
    await expect(
      service.checkbox('test', [{ name: 'a', value: 'a' }]),
    ).rejects.toThrow(NonTtyError);
  });

  it('throws NonTtyError when stdin is not TTY for password()', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
    });
    await expect(service.password('test')).rejects.toThrow(NonTtyError);
  });
});
