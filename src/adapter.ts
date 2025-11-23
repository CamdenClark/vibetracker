import type { SessionData, MessageData, ToolCallData, AgentData } from "./db";

export interface ParsedTranscript {
  session: SessionData;
  messages: MessageData[];
  toolCalls: ToolCallData[];
  agents: AgentData[];
}

/**
 * Provider adapter interface - each AI assistant provider implements this
 */
export interface ProviderAdapter {
  /** Provider identifier (e.g., 'claude_code', 'codex_cli', 'cursor') */
  readonly provider: string;

  /** Model provider (e.g., 'anthropic', 'openai', 'google') */
  readonly modelProvider: string;

  /**
   * Detect if this adapter can parse the given content
   * @param content - Raw file content to check
   * @returns true if this adapter can handle the content
   */
  canParse(content: string): boolean;

  /**
   * Parse the session file into unified format
   * @param content - Raw file content
   * @param filePath - Optional file path for loading related files
   * @returns Parsed transcript data
   */
  parse(content: string, filePath?: string): ParsedTranscript;
}

/**
 * Auto-detect and use the appropriate adapter for a file
 */
export function parseWithAdapter(content: string, filePath?: string, adapters: ProviderAdapter[]): ParsedTranscript {
  for (const adapter of adapters) {
    if (adapter.canParse(content)) {
      return adapter.parse(content, filePath);
    }
  }

  throw new Error("No adapter found for this file format. Supported formats: " +
    adapters.map(a => a.provider).join(", "));
}

/**
 * Parse a file using a specific adapter
 */
export function parseWithSpecificAdapter(
  content: string,
  provider: string,
  adapters: ProviderAdapter[],
  filePath?: string
): ParsedTranscript {
  const adapter = adapters.find(a => a.provider === provider);

  if (!adapter) {
    throw new Error(`No adapter found for provider: ${provider}`);
  }

  return adapter.parse(content, filePath);
}
