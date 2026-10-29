/**
 * Something the engine was given that it can't work with.
 *
 * Messages name the field and, where it helps, a date or an id. They never
 * include amounts, payment names or notes (CLAUDE.md: privacy), so they are
 * safe to send in an error report.
 */
export class EngineInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EngineInputError';
    this.code = code;
  }
}
