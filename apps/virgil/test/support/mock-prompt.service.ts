export function createMockPromptService(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    input: vi.fn(),
    select: vi.fn(),
    confirm: vi.fn(),
    checkbox: vi.fn(),
    password: vi.fn(),
  };
}
