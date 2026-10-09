/**
 * Thrown by createRenderer when the browser cannot create a WebGL context
 * (WebGL disabled, blocked GPU, very old hardware). main.ts shows a notice
 * instead of a black page.
 */
export class WebGLUnavailableError extends Error {
  constructor(cause: unknown) {
    super('WebGL context could not be created', { cause });
    this.name = 'WebGLUnavailableError';
  }
}

export function isWebGLUnavailable(
  error: unknown,
): error is WebGLUnavailableError {
  return error instanceof WebGLUnavailableError;
}
