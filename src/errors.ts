/** Base class for every error this library throws. */
export class ManGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
