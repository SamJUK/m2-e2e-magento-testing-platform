/** Simple printf-style %s substitution */
export function sprintf(format: string, ...args: unknown[]): string {
  let i = 0;
  return format.replace(/%s/g, () => String(args[i++] ?? ''));
}
