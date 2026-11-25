/** Error text can echo values (e.g. a bad bigint); digits never reach the log. */
export function redactDigits(text: string): string {
  return text.replace(/\d+/g, '#');
}
