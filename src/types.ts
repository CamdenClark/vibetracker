import type { SessionData, MessageData, ToolCallData, AgentData } from "./db";

/**
 * Unified transcript format that all parsers produce
 */
export interface ParsedTranscript {
  session: SessionData;
  messages: MessageData[];
  toolCalls: ToolCallData[];
  agents: AgentData[];
}
