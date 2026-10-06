export class MigrationError extends Error {
  constructor(
    readonly source: string,
    message: string,
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}
