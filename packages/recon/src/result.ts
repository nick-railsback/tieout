/**
 * A typed, discriminated result. The pure core NEVER throws across its boundary
 * (spine Consistency Conventions): every failure mode a caller can hit is a
 * value, so the shell owns retries, logging, and exit codes — not exceptions.
 *
 * [Source: docs/ARCHITECTURE-SPINE.md#Consistency-Conventions]
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
