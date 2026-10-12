/* The types of the standalone validators scripts/types-from-schemas.mjs generates into validators.js. */
export interface ValidationError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}

export interface ValidateFunction {
  (data: unknown): boolean;
  errors?: ValidationError[] | null;
}

export const validateRequest: ValidateFunction;
export const validateDeclaration: ValidateFunction;
export const validateDecision: ValidateFunction;
export const validatePolicy: ValidateFunction;
