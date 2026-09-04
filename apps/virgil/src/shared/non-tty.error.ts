export class NonTtyError extends Error {
  constructor(field: string) {
    super(
      `Interactive prompt required for "${field}" but stdin is not a TTY. Provide the value as a CLI argument instead.`,
    );
    this.name = 'NonTtyError';
  }
}
