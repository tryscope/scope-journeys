// The types of canonical.mjs for the package tests that are typechecked (packages/*/test); the
// root tests import the module untyped.
export function canonical(value: unknown): string;
export function maskText<T>(text: T): T;
export function applyMask<T>(record: T): T;
export function maskResponse(response: { status: number; headers?: Record<string, string>; body: string }): { status: number; headers: Record<string, string>; body: string };
