declare module 'ms' {
  /**
   * Parse or format the given `val`.
   *
   * - string input → number of milliseconds
   * - number input → formatted string
   *
   * @param val - The value to convert (string or number)
   * @param options.long - Use long format (e.g. "1 day" instead of "1d")
   * @returns The converted value
   * @throws if `val` is not a non-empty string or a valid number
   */
  function ms(val: string, options?: { long?: boolean }): number;
  function ms(val: number, options?: { long?: boolean }): string;
  export default ms;
}
