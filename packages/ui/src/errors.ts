// What went wrong, as the status line says it: an error's message, or whatever else was thrown, as text.

/** the message of an error (or of anything thrown with one), else the thing thrown as text */
export const errorText = (e: unknown): string =>
  e instanceof Error
    ? e.message
    : typeof e === 'object' && e !== null && 'message' in e
      ? String(e.message)
      : String(e);
