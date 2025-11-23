import type { ProviderAdapter, ParsedTranscript } from "../adapter";
import type { MessageData, ToolCallData, AgentData, SessionData } from "../db";

interface CodexEvent {
  timestamp: string;
  type: string;
  payload: any;
}

interface SessionMeta {
  id: string;
  timestamp: string;
  cwd: string;
  originator: string;
  cli_version: string;
  instructions?: string;
  source: string;
  model_provider: string;
  git?: {
    commit_hash: string;
    branch: string;
    repository_url: string;
  };
}

export class CodexAdapter implements ProviderAdapter {
  readonly provider = 'codex_cli';
  readonly modelProvider = 'openai'; // Default, can be overridden from session_meta

  canParse(content: string): boolean {
    try {
      const lines = content.trim().split("\n").filter(l => l.trim());
      if (lines.length === 0) return false;

      const firstLine = JSON.parse(lines[0]);

      // Check for Codex-specific markers
      return (
        firstLine.type === "session_meta" ||
        (firstLine.type && firstLine.payload !== undefined && firstLine.timestamp !== undefined)
      );
    } catch {
      return false;
    }
  }

  parse(content: string, filePath?: string): ParsedTranscript {
    const lines = content.trim().split("\n").filter(l => l.trim());
    const events: CodexEvent[] = lines.map(line => JSON.parse(line));

    const messages: MessageData[] = [];
    const toolCalls: ToolCallData[] = [];
    const agents: AgentData[] = [];

    let sessionId = "";
    let sessionMeta: SessionMeta | null = null;
    let projectPath: string | undefined;
    let gitBranch: string | undefined;
    let startedAt: Date | undefined;
    let lastActivityAt: Date | undefined;
    let modelProvider = this.modelProvider;

    const messageIdMap = new Map<string, number>();
    let messageCounter = 1;

    for (const event of events) {
      const timestamp = new Date(event.timestamp);

      // Track timing
      if (!startedAt || timestamp < startedAt) {
        startedAt = timestamp;
      }
      if (!lastActivityAt || timestamp > lastActivityAt) {
        lastActivityAt = timestamp;
      }

      // Extract session metadata
      if (event.type === "session_meta") {
        sessionMeta = event.payload as SessionMeta;
        sessionId = sessionMeta.id;
        projectPath = sessionMeta.cwd;
        gitBranch = sessionMeta.git?.branch;
        modelProvider = sessionMeta.model_provider || this.modelProvider;
        continue;
      }

      // Extract turn context (contains cwd, model, etc.)
      if (event.type === "turn_context") {
        if (!projectPath && event.payload.cwd) {
          projectPath = event.payload.cwd;
        }
        continue;
      }

      // Parse response items (messages)
      if (event.type === "response_item") {
        const item = event.payload;

        if (item.type === "message") {
          const role = item.role as "user" | "assistant";
          let content = "";
          const toolUses: Array<{ id: string; name: string; input: any }> = [];

          // Extract content
          if (Array.isArray(item.content)) {
            for (const block of item.content) {
              if (block.type === "input_text" || block.type === "output_text") {
                content += block.text || "";
              } else if (block.type === "tool_use") {
                toolUses.push({
                  id: block.id,
                  name: block.name,
                  input: block.input || {},
                });
              }
            }
          }

          // Generate a UUID for this message (Codex doesn't provide one)
          const messageUuid = `${sessionId}-${messageCounter}`;

          const messageData: MessageData = {
            sessionId,
            provider: this.provider,
            messageUuid,
            role,
            content,
            isSidechain: false,
            timestamp,
          };

          messages.push(messageData);
          messageIdMap.set(messageUuid, messageCounter++);

          // Extract tool uses
          for (const toolUse of toolUses) {
            const toolCallData: ToolCallData = {
              messageId: messageIdMap.get(messageUuid)!,
              sessionId,
              provider: this.provider,
              toolUseId: `${messageUuid}-${toolUse.id}`,
              toolName: toolUse.name,
              toolInput: JSON.stringify(toolUse.input),
              isError: false,
              timestamp,
            };
            toolCalls.push(toolCallData);
          }
        } else if (item.type === "reasoning") {
          // Store reasoning as a special message with metadata
          const messageUuid = `${sessionId}-reasoning-${messageCounter}`;

          let reasoningContent = "";
          if (Array.isArray(item.summary)) {
            reasoningContent = item.summary
              .map((s: any) => s.text || "")
              .join("\n");
          }

          const messageData: MessageData = {
            sessionId,
            provider: this.provider,
            messageUuid,
            role: "assistant",
            content: reasoningContent,
            isSidechain: false,
            timestamp,
            providerMetadata: {
              type: "reasoning",
              has_encrypted_content: !!item.encrypted_content,
              encrypted_content: item.encrypted_content,
            },
          };

          messages.push(messageData);
          messageIdMap.set(messageUuid, messageCounter++);
        } else if (item.type === "function_call") {
          // Codex uses function_call instead of tool_use in some cases
          const messageUuid = `${sessionId}-${messageCounter - 1}`; // Associate with previous message
          const actualMessageId = messageIdMap.get(messageUuid);

          if (actualMessageId) {
            const toolCallData: ToolCallData = {
              messageId: actualMessageId,
              sessionId,
              provider: this.provider,
              toolUseId: `${messageUuid}-${item.name}`,
              toolName: item.name,
              toolInput: JSON.stringify(item.arguments || {}),
              isError: false,
              timestamp,
            };
            toolCalls.push(toolCallData);
          }
        } else if (item.type === "function_call_output") {
          // Update the corresponding tool call with result
          const toolCall = toolCalls[toolCalls.length - 1];
          if (toolCall) {
            toolCall.toolResult = item.output || "";
          }
        }
      }

      // Parse event messages
      if (event.type === "event_msg") {
        const eventType = event.payload.type;

        if (eventType === "user_message") {
          const messageUuid = `${sessionId}-user-${messageCounter}`;

          const messageData: MessageData = {
            sessionId,
            provider: this.provider,
            messageUuid,
            role: "user",
            content: event.payload.message || "",
            isSidechain: false,
            timestamp,
          };

          messages.push(messageData);
          messageIdMap.set(messageUuid, messageCounter++);
        } else if (eventType === "agent_message") {
          const messageUuid = `${sessionId}-agent-${messageCounter}`;

          const messageData: MessageData = {
            sessionId,
            provider: this.provider,
            messageUuid,
            role: "assistant",
            content: event.payload.message || "",
            isSidechain: false,
            timestamp,
          };

          messages.push(messageData);
          messageIdMap.set(messageUuid, messageCounter++);
        } else if (eventType === "agent_reasoning") {
          const messageUuid = `${sessionId}-reasoning-${messageCounter}`;

          const messageData: MessageData = {
            sessionId,
            provider: this.provider,
            messageUuid,
            role: "assistant",
            content: event.payload.text || "",
            isSidechain: false,
            timestamp,
            providerMetadata: {
              type: "agent_reasoning",
            },
          };

          messages.push(messageData);
          messageIdMap.set(messageUuid, messageCounter++);
        } else if (eventType === "token_count") {
          // Update the last message with token info
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && event.payload.info) {
            const tokenInfo = event.payload.info.last_token_usage || event.payload.info.total_token_usage;
            if (tokenInfo) {
              lastMessage.inputTokens = tokenInfo.input_tokens;
              lastMessage.outputTokens = tokenInfo.output_tokens;
              lastMessage.cacheReadTokens = tokenInfo.cached_input_tokens;
              lastMessage.reasoningTokens = tokenInfo.reasoning_output_tokens;
            }
          }
        }
      }
    }

    // Build session metadata
    const providerMetadata: Record<string, any> = {};
    if (sessionMeta) {
      providerMetadata.source = sessionMeta.source;
      providerMetadata.originator = sessionMeta.originator;
      providerMetadata.cli_version = sessionMeta.cli_version;
      if (sessionMeta.git) {
        providerMetadata.git_commit_hash = sessionMeta.git.commit_hash;
        providerMetadata.git_repository_url = sessionMeta.git.repository_url;
      }
    }

    return {
      session: {
        sessionId,
        provider: this.provider,
        projectPath,
        gitBranch,
        startedAt,
        lastActivityAt,
        modelProvider,
        providerMetadata: Object.keys(providerMetadata).length > 0 ? providerMetadata : undefined,
      },
      messages,
      toolCalls,
      agents,
    };
  }
}
