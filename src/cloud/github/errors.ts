/**
 * Typed failures for the GitHub layer.
 *
 * The UI needs to tell "someone else saved first" apart from "you lost access" apart from
 * "the network is down", and each needs a different offer to the user — so the REST client
 * maps status codes here rather than letting raw Responses reach components.
 */

export class GithubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Token is missing, expired beyond refresh, or revoked. The user must reconnect. */
export class AuthError extends GithubError {}

/**
 * The file changed in the repo since we last read it, so the write was refused. Carries the
 * current remote sha when GitHub supplied one, so the UI can offer "overwrite" without a
 * second round trip.
 */
export class ConflictError extends GithubError {
  constructor(
    message: string,
    readonly remoteSha?: string,
  ) {
    super(message);
  }
}

/** 404 — also what GitHub returns for a private repo the token can't see. */
export class NotFoundError extends GithubError {}

/** 403 with the rate limit exhausted. `resetAt` is epoch ms. */
export class RateLimitError extends GithubError {
  constructor(
    message: string,
    readonly resetAt: number,
  ) {
    super(message);
  }
}

/** fetch itself failed — offline, DNS, TLS. Distinct from any HTTP response. */
export class NetworkError extends GithubError {}

/** Anything else GitHub returned, with its message preserved for the UI. */
export class ApiError extends GithubError {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
