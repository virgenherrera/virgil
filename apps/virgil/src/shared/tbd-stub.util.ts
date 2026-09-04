export function printTbdStub(
  command: string,
  gapId: string,
  reason: string,
): void {
  console.log(`${command} is not yet available (${gapId}: ${reason})`);
}
