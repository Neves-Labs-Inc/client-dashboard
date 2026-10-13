// What a service method returns for an expected outcome (coding-style).
// `status` is the HTTP status it maps to; `error` is a code the caller turns
// into copy. Infrastructure failures throw instead.
export type Result<T, E extends string = string> =
  | { value: T; error: null; status: number }
  | { value: null; error: E; status: number };
