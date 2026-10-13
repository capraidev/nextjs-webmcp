/**
 * WebMCP types, hand-written from the W3C CG draft IDL (webmachinelearning/webmcp,
 * index.bs). Re-read the draft when updating: it changes month to month.
 * Place at `types/webmcp.d.ts` and make sure tsconfig `include` covers it.
 */
export {};

/* Declarative API: React 19 forwards unknown lowercase string attributes to the DOM,
   TypeScript does not know them — augment React's attribute interfaces. */
/* eslint-disable @typescript-eslint/no-unused-vars -- augmentation needs the type parameter */
declare module "react" {
  interface FormHTMLAttributes<T> {
    toolname?: string;
    tooldescription?: string;
    /** Avoid: without it the person presses submit, which is the confirmation. */
    toolautosubmit?: string;
  }
  interface InputHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */

declare global {
  interface ModelContextToolAnnotations {
    readOnlyHint?: boolean;
    consequentialHint?: boolean;
    untrustedContentHint?: boolean;
  }

  interface ModelContextClient {
    signal?: AbortSignal;
  }

  interface ModelContextTool {
    name: string;
    title?: string;
    description: string;
    inputSchema?: object;
    execute: (input: Record<string, unknown>, client?: ModelContextClient) => Promise<unknown>;
    annotations?: ModelContextToolAnnotations;
  }

  interface ModelContextRegisterToolOptions {
    /** Aborting it unregisters the tool (there is no unregisterTool). */
    signal?: AbortSignal;
    exposedTo?: string[];
  }

  interface ModelContext {
    registerTool(tool: ModelContextTool, options?: ModelContextRegisterToolOptions): Promise<void>;
  }

  interface Document {
    readonly modelContext?: ModelContext;
  }

  /** Older Chrome builds only: keep as a fallback. */
  interface Navigator {
    readonly modelContext?: ModelContext;
  }
}
