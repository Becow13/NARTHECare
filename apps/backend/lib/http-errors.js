/**
 * Typed HTTP error helpers.
 *
 * Route handlers and services may `throw new HttpError(statusCode, message)`
 * instead of building a response inline.  The central error middleware in
 * `app.js` catches these and maps them to the correct HTTP status without
 * leaking internal detail.
 *
 * Keep this file free of I/O — it is imported by route handlers, services,
 * and tests, so it must be safe to import anywhere.
 */

/**
 * An application error that carries an intended HTTP status code.
 *
 * The `message` is the safe, client-facing string — it must not contain
 * stack traces, query text, PHI, or internal identifiers.
 */
export class HttpError extends Error {
  /**
   * @param {number} statusCode  HTTP status to send (4xx or 5xx)
   * @param {string} message     Client-safe error message
   */
  constructor(statusCode, message) {
    super(message)
    this.name = "HttpError"
    this.statusCode = statusCode
  }
}

/** @param {string} [message] */
export function badRequest(message = "Bad request") {
  return new HttpError(400, message)
}

/** @param {string} [message] */
export function unauthorized(message = "Unauthorized") {
  return new HttpError(401, message)
}

/** @param {string} [message] */
export function forbidden(message = "You do not have access to this resource.") {
  return new HttpError(403, message)
}

/** @param {string} [message] */
export function notFound(message = "Resource not found") {
  return new HttpError(404, message)
}

/** @param {string} [message] */
export function conflict(message = "Conflict") {
  return new HttpError(409, message)
}

/** @param {string} [message] */
export function internalError(message = "Unable to complete request.") {
  return new HttpError(500, message)
}

/**
 * Return true when `err` is an `HttpError` (i.e. has an intended status code
 * set by application code and is safe to forward to the client as-is).
 *
 * @param {unknown} err
 * @returns {err is HttpError}
 */
export function isHttpError(err) {
  return err instanceof HttpError
}
