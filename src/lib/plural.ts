/** "1 sound" or "3 sounds". Pass the plural when it isn't just an "s". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
