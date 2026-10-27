/**
 * Converts a locally selected date and time into the ISO instant expected by
 * the RFQ API. `Date` retains the local calendar/time selection; `toISOString`
 * serializes that exact instant with its UTC offset.
 */
export function deadlineToApiValue(deadline: Date | null): string {
  return deadline ? deadline.toISOString() : "";
}

/**
 * Parses a previously selected API value for the date picker without letting
 * an invalid value reach the picker as an Invalid Date instance.
 */
export function deadlineFromApiValue(value: string): Date | null {
  if (!value) return null;

  const deadline = new Date(value);

  return Number.isNaN(deadline.getTime()) ? null : deadline;
}
