// Browser stand-in for the platform `sdk`, so shared tgcloud/lib modules (units,
// dates, nutrition → validate) can be bundled. Only EndpointError is ever used.
export class EndpointError extends Error {
  constructor(message, parameters) {
    super(message);
    this.parameters = parameters;
  }
}
