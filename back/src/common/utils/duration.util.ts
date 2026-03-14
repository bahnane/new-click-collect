const DURATION_REGEX = /^(\d+)(ms|s|m|h|d)$/i;

const MULTIPLIER_BY_UNIT: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function durationToMs(
  value: string | number | undefined,
  fallbackMs: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== 'string') {
    return fallbackMs;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallbackMs;
  }

  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber;
  }

  const match = trimmed.match(DURATION_REGEX);
  if (!match) {
    return fallbackMs;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = MULTIPLIER_BY_UNIT[unit];

  if (!Number.isFinite(amount) || amount <= 0 || !multiplier) {
    return fallbackMs;
  }

  return amount * multiplier;
}
