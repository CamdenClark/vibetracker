import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import type { ParsedTranscript } from "../types";
import type { MessageData, ToolCallData, AgentData } from "../db";

interface JSONLMessage {
  type?: string;
  sessionId?: string;
  uuid?: string;
  parentUuid?: string | null;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string; id?: string; name?: string; input?: any }>;
    model?: string;
    stop_reason?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  timestamp?: string;
  isSidechain?: boolean;
  agentId?: string;
  cwd?: string;
  gitBranch?: string;
  toolUseResult?: {
    agentId?: string;
    status?: string;
    prompt?: string;
    totalDurationMs?: number;
    totalTokens?: number;
    totalToolUseCount?: number;
    stdout?: string;
    stderr?: string;
    interrupted?: boolean;
  };
}

const PROVIDER = 'claude_code';
const MODEL_PROVIDER = 'anthropic';

/**
 * Parse a Claude Code transcript file
 */
export function parseClaudeTranscript(filePath: string): ParsedTranscript {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n").filter(l => l.trim());
  const jsonlMessages: JSONLMessage[] = lines.map(line => JSON.parse(line));

  const messages: MessageData[] = [];
  const toolCalls: ToolCallData[] = [];
  const agents: AgentData[] = [];
  const agentMap = new Map<string, AgentData>();
  const messageIdMap = new Map<string, number>(); // uuid -> sequential id for tool_calls

  let sessionId = "";
  let projectPath: string | undefined;
  let gitBranch: string | undefined;
  let startedAt: Date | undefined;
  let lastActivityAt: Date | undefined;

  let messageCounter = 1;

  for (const msg of jsonlMessages) {
    // Skip file-history-snapshot entries
    if (msg.type === "file-history-snapshot") {
      continue;
    }

    // Extract session metadata
    if (msg.sessionId) {
      sessionId = msg.sessionId;
    }
    if (msg.cwd && !projectPath) {
      projectPath = msg.cwd;
    }
    if (msg.gitBranch && !gitBranch) {
      gitBranch = msg.gitBranch;
    }
    if (msg.timestamp) {
      const ts = new Date(msg.timestamp);
      if (!startedAt || ts < startedAt) {
        startedAt = ts;
      }
      if (!lastActivityAt || ts > lastActivityAt) {
        lastActivityAt = ts;
      }
    }

    // Parse user or assistant messages
    if (msg.type === "user" || msg.type === "assistant") {
      if (!msg.uuid || !msg.message || !msg.timestamp) {
        continue;
      }

      const isSidechain = msg.isSidechain || false;
      const agentId = msg.agentId;

      // Handle message content
      let contentText = "";
      const toolUses: Array<{ id: string; name: string; input: any }> = [];

      if (typeof msg.message.content === "string") {
        contentText = msg.message.content;
      } else if (Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            contentText += block.text;
          } else if (block.type === "tool_use" && block.id && block.name) {
            toolUses.push({
              id: block.id,
              name: block.name,
              input: block.input || {},
            });
          } else if (block.type === "tool_result") {
            // Tool results are handled separately
          }
        }
      }

      const messageData: MessageData = {
        sessionId,
        provider: PROVIDER,
        messageUuid: msg.uuid,
        parentUuid: msg.parentUuid || undefined,
        role: msg.message.role as "user" | "assistant",
        content: contentText || JSON.stringify(msg.message.content),
        model: msg.message.model,
        stopReason: msg.message.stop_reason,
        isSidechain,
        agentId,
        timestamp: new Date(msg.timestamp),
        inputTokens: msg.message.usage?.input_tokens,
        outputTokens: msg.message.usage?.output_tokens,
        cacheReadTokens: msg.message.usage?.cache_read_input_tokens,
        cacheCreationTokens: msg.message.usage?.cache_creation_input_tokens,
      };

      messages.push(messageData);
      messageIdMap.set(msg.uuid, messageCounter++);

      // Extract tool uses from assistant messages
      for (const toolUse of toolUses) {
        const toolCallData: ToolCallData = {
          messageId: messageIdMap.get(msg.uuid)!,
          sessionId,
          provider: PROVIDER,
          agentId,
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          toolInput: JSON.stringify(toolUse.input),
          isError: false,
          timestamp: new Date(msg.timestamp),
        };
        toolCalls.push(toolCallData);
      }

      // Check for tool result that contains agent data
      if (msg.toolUseResult?.agentId) {
        const agentData: AgentData = {
          agentId: msg.toolUseResult.agentId,
          sessionId,
          provider: PROVIDER,
          parentMessageUuid: msg.parentUuid || undefined,
          prompt: msg.toolUseResult.prompt,
          status: msg.toolUseResult.status,
          totalDurationMs: msg.toolUseResult.totalDurationMs,
          totalTokens: msg.toolUseResult.totalTokens,
          totalToolCalls: msg.toolUseResult.totalToolUseCount,
        };

        // Merge with existing agent data if present
        const existing = agentMap.get(msg.toolUseResult.agentId);
        if (existing) {
          Object.assign(existing, agentData);
        } else {
          agentMap.set(msg.toolUseResult.agentId, agentData);
        }
      }
    }
  }

  // Convert agent map to array
  agents.push(...agentMap.values());

  // Try to load agent trajectory files if we found agents
  const projectDir = dirname(filePath);
  for (const agent of agents) {
    const agentFilePath = join(projectDir, `agent-${agent.agentId}.jsonl`);
    if (existsSync(agentFilePath)) {
      const agentData = parseAgentTrajectory(agentFilePath, sessionId, agent.agentId);
      messages.push(...agentData.messages);
      toolCalls.push(...agentData.toolCalls);

      // Update agent metadata
      if (agentData.messages.length > 0) {
        const timestamps = agentData.messages.map(m => m.timestamp).sort((a, b) => a.getTime() - b.getTime());
        agent.startedAt = timestamps[0];
        agent.completedAt = timestamps[timestamps.length - 1];
      }
    }
  }

  return {
    session: {
      sessionId,
      provider: PROVIDER,
      projectPath,
      gitBranch,
      startedAt,
      lastActivityAt,
      modelProvider: MODEL_PROVIDER,
    },
    messages,
    toolCalls,
    agents,
  };
}

function parseAgentTrajectory(filePath: string, sessionId: string, agentId: string): {
  messages: MessageData[];
  toolCalls: ToolCallData[];
} {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n").filter(l => l.trim());
  const jsonlMessages: JSONLMessage[] = lines.map(line => JSON.parse(line));

  const messages: MessageData[] = [];
  const toolCalls: ToolCallData[] = [];
  const messageIdMap = new Map<string, number>();

  let messageCounter = 1;

  for (const msg of jsonlMessages) {
    if (msg.type === "file-history-snapshot") {
      continue;
    }

    if ((msg.type === "user" || msg.type === "assistant") && msg.uuid && msg.message && msg.timestamp) {
      let contentText = "";
      const toolUses: Array<{ id: string; name: string; input: any }> = [];
      const toolResults: Array<{ id: string; content: any; is_error?: boolean }> = [];

      if (typeof msg.message.content === "string") {
        contentText = msg.message.content;
      } else if (Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            contentText += block.text;
          } else if (block.type === "tool_use" && block.id && block.name) {
            toolUses.push({
              id: block.id,
              name: block.name,
              input: block.input || {},
            });
          } else if (block.type === "tool_result") {
            toolResults.push({
              id: (block as any).tool_use_id,
              content: (block as any).content,
              is_error: (block as any).is_error || false,
            });
          }
        }
      }

      const messageData: MessageData = {
        sessionId,
        provider: PROVIDER,
        messageUuid: msg.uuid,
        parentUuid: msg.parentUuid || undefined,
        role: msg.message.role as "user" | "assistant",
        content: contentText || JSON.stringify(msg.message.content),
        model: msg.message.model,
        stopReason: msg.message.stop_reason,
        isSidechain: true,
        agentId,
        timestamp: new Date(msg.timestamp),
        inputTokens: msg.message.usage?.input_tokens,
        outputTokens: msg.message.usage?.output_tokens,
        cacheReadTokens: msg.message.usage?.cache_read_input_tokens,
        cacheCreationTokens: msg.message.usage?.cache_creation_input_tokens,
      };

      messages.push(messageData);
      messageIdMap.set(msg.uuid, messageCounter++);

      // Extract tool uses
      for (const toolUse of toolUses) {
        const toolCallData: ToolCallData = {
          messageId: messageIdMap.get(msg.uuid)!,
          sessionId,
          provider: PROVIDER,
          agentId,
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          toolInput: JSON.stringify(toolUse.input),
          isError: false,
          timestamp: new Date(msg.timestamp),
        };
        toolCalls.push(toolCallData);
      }

      // Update tool calls with results
      for (const toolResult of toolResults) {
        const existingToolCall = toolCalls.find(tc => tc.toolUseId === toolResult.id);
        if (existingToolCall) {
          existingToolCall.toolResult = typeof toolResult.content === "string"
            ? toolResult.content
            : JSON.stringify(toolResult.content);
          existingToolCall.isError = toolResult.is_error || false;
        }
      }

      // Check toolUseResult for tool execution metadata
      if (msg.toolUseResult) {
        const result = msg.toolUseResult;
        // Try to match to a recent tool call (last tool call in this message)
        const lastToolCall = toolCalls[toolCalls.length - 1];
        if (lastToolCall) {
          lastToolCall.toolResult = result.stdout || result.stderr || JSON.stringify(result);
          lastToolCall.isError = result.interrupted || false;
        }
      }
    }
  }

  return { messages, toolCalls };
}
