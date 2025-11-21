import { readFileSync } from "fs";
import { parseTranscriptFile } from "./parser";
import { upsertSession, insertMessage, insertToolCall, upsertAgent } from "./db-v2";

interface HookData {
  session_id: string;
  transcript_path: string;
  event_name: "Stop" | "SubagentStop";
  permission_mode: string;
  stop_hook_active: boolean;
  timestamp: string;
}

export async function handleClaudeHook(): Promise<void> {
  try {
    // Read hook data from stdin
    const stdinData = await readStdin();
    const hookData: HookData = JSON.parse(stdinData);

    // Parse the transcript file
    const parsed = parseTranscriptFile(hookData.transcript_path);

    // Store session
    upsertSession(parsed.session);

    // Store messages
    const messageIdMap = new Map<string, number>();
    for (const message of parsed.messages) {
      const messageId = insertMessage(message);
      messageIdMap.set(message.messageUuid, messageId);
    }

    // Store tool calls with correct message IDs
    for (const toolCall of parsed.toolCalls) {
      // Update message ID based on actual inserted message
      const actualMessageId = messageIdMap.get(
        parsed.messages.find(m => m.messageUuid === toolCall.toolUseId)?.messageUuid || ""
      );
      if (actualMessageId) {
        toolCall.messageId = actualMessageId;
      }
      insertToolCall(toolCall);
    }

    // Store agents
    for (const agent of parsed.agents) {
      upsertAgent(agent);
    }

    console.error(`✓ Stored ${hookData.event_name} event for session ${hookData.session_id}`);
    console.error(`  - ${parsed.messages.length} messages`);
    console.error(`  - ${parsed.toolCalls.length} tool calls`);
    console.error(`  - ${parsed.agents.length} agents`);
  } catch (error) {
    console.error("Error handling Claude hook:", error);
    // Exit gracefully so we don't interfere with Claude
    process.exit(0);
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    process.stdin.on("data", (chunk) => {
      chunks.push(chunk);
    });

    process.stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    process.stdin.on("error", (error) => {
      reject(error);
    });
  });
}
