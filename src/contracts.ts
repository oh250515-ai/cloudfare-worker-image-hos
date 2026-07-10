export type JsonSchema = Record<string, unknown>;

export interface ExtractRequest {
  imageUrl: string;
  prompt?: string;
  model?: string;
  parameters?: Record<string, unknown>;
  output?: {
    includeRawText?: boolean;
    includeAnnotations?: boolean;
    schema?: JsonSchema;
  };
  metadata?: Record<string, unknown>;
}

export interface Annotation {
  type: string;
  text?: string | null;
  color?: string | null;
  bbox?: [number, number, number, number] | null;
  confidence?: number | null;
  [key: string]: unknown;
}

export interface ExtractionResult {
  rawText: string | null;
  data: unknown;
  annotations: Annotation[];
  confidence?: number | null;
}
