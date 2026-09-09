/**
 * Parses a number typed with either a dot or a Norwegian decimal comma
 * ("8,5" -> 8.5). Only swaps the comma for a dot when the string has no
 * literal dot already, so "1,234.5" (unlikely here, but not our format)
 * isn't mangled. Returns NaN for anything else unparseable.
 */
export function parseLocaleNumber(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return NaN;
  const normalized = trimmed.includes('.') ? trimmed : trimmed.replace(',', '.');
  return Number(normalized);
}

export function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}
