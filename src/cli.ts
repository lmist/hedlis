export function isHeadlessEnabled(argv: string[]): boolean {
  return argv.includes("--headless");
}
