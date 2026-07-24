export type SideEffectLevel = "none" | "read" | "write" | "external_effect" | "irreversible";

export interface JsonSchema {
  [key: string]: unknown;
}

export interface ToolSpec {
  id: string;
  version: string;
  revision?: string;
  name?: string;
  displayName?: string;
  description: string;
  instructions?: string;
  tags?: string[];
  inputSchema: JsonSchema;
  outputSchema?: JsonSchema;
  sideEffectLevel: SideEffectLevel;
  permissionScope?: string[];
  timeoutPolicy?: {
    timeoutMs: number;
    onTimeout?: "fail" | "retry" | "human_review";
  };
  retryPolicy?: {
    maxAttempts: number;
  };
  auditPolicy?: {
    enabled: boolean;
    includeInput?: boolean;
    includeOutput?: boolean;
  };
  idempotencyPolicy?: {
    mode: "none" | "optional" | "required";
  };
  source?: "local" | "mcp" | "http" | "plugin" | "hosted" | "custom";
  semantics?: {
    sideEffectLevel: SideEffectLevel;
    idempotency: "none" | "caller_key" | "derived_key" | "provider_key" | "intrinsic";
    deterministic?: boolean;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
    resultSemantics?: "observation" | "artifact" | "state_patch" | "external_receipt";
  };
  metadata?: Record<string, unknown>;
}

export interface ToolCallContext {
  runId: string;
  stepId: string;
  invocationId?: string;
  userId?: string;
  workspaceId?: string;
  sessionId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ToolCallContext
) => Promise<TOutput>;

export interface HyphaCompatibleToolRegistry {
  register(spec: ToolSpec, handler: ToolHandler, options?: { replace?: boolean }): void;
}

export class LocalToolRegistry implements HyphaCompatibleToolRegistry {
  private readonly handlers = new Map<string, { spec: ToolSpec; handler: ToolHandler }>();

  register(spec: ToolSpec, handler: ToolHandler, options: { replace?: boolean } = {}): void {
    if (!options.replace && this.handlers.has(spec.id)) {
      throw new Error(`Tool already registered: ${spec.id}`);
    }

    this.handlers.set(spec.id, { spec, handler });
  }

  list(): ToolSpec[] {
    return [...this.handlers.values()].map(({ spec }) => spec);
  }

  async execute(toolId: string, input: unknown, context: ToolCallContext): Promise<unknown> {
    const entry = this.handlers.get(toolId);
    if (!entry) {
      throw new Error(`Tool is not registered: ${toolId}`);
    }

    return entry.handler(input, context);
  }
}
