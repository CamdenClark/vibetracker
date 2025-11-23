import { parseTranscriptFile } from "./parser";
import { upsertSession, insertMessage, insertToolCall, upsertAgent } from "./db";
import { join } from "path";

interface CodexNotification {
  type: string;
  "thread-id": string;
  "turn-id": string;
  cwd: string;
  "input-messages": string[];
  "last-assistant-message": string;
}

export async function handleCodexNotify(dbPath?: string): Promise<void> {
  try {
    // Codex passes notification as JSON string argument
    const notificationJson = process.argv[4];

    if (!notificationJson) {
      console.error("Error: No notification data provided");
      process.exit(0);
    }

    const notification: CodexNotification = JSON.parse(notificationJson);

    // Only process agent-turn-complete events
    if (notification.type !== "agent-turn-complete") {
      console.error(`Skipping notification type: ${notification.type}`);
      process.exit(0);
    }

    // Codex stores transcripts in ~/.codex/sessions/YYYY/MM/DD/<session-name>.jsonl
    // The filename includes the session ID (thread-id), but also has a timestamp prefix
    // We need to find the file that contains this thread-id
    const codexHome = join(process.env.HOME || "~", ".codex", "sessions");
    const threadId = notification["thread-id"];

    // Search for the file containing this thread-id
    // Files are named like: rollout-2025-11-22T11-15-45-<thread-id>.jsonl
    // We need to search multiple days since the session might have started yesterday
    let transcriptPath: string | null = null;

    // Search today and the last 7 days
    const now = new Date();
    for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
      const searchDate = new Date(now);
      searchDate.setDate(now.getDate() - daysAgo);

      const year = searchDate.getFullYear();
      const month = String(searchDate.getMonth() + 1).padStart(2, '0');
      const day = String(searchDate.getDate()).padStart(2, '0');
      const sessionDir = join(codexHome, String(year), month, day);

      try {
        const files = await Array.fromAsync(
          new Bun.Glob(`*-${threadId}.jsonl`).scan({ cwd: sessionDir })
        );

        if (files.length > 0) {
          transcriptPath = join(sessionDir, files[0]);
          break;
        }
      } catch (error) {
        // Directory might not exist, continue to next day
        continue;
      }
    }

    if (!transcriptPath) {
      console.error(`Could not find transcript for thread ${threadId} (searched last 7 days)`);
      process.exit(0);
    }

    // Parse the transcript file
    const parsed = parseTranscriptFile(transcriptPath);

    // Store session
    upsertSession(parsed.session, dbPath);

    // Store messages
    const messageIdMap = new Map<string, number>();
    for (const message of parsed.messages) {
      const messageId = insertMessage(message, dbPath);
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
      insertToolCall(toolCall, dbPath);
    }

    // Store agents
    for (const agent of parsed.agents) {
      upsertAgent(agent, dbPath);
    }

    console.error(`✓ Stored Codex turn-complete for thread ${notification["thread-id"]}`);
    console.error(`  - ${parsed.messages.length} messages`);
    console.error(`  - ${parsed.toolCalls.length} tool calls`);
    console.error(`  - ${parsed.agents.length} agents`);
  } catch (error) {
    console.error("Error handling Codex notification:", error);
    // Exit gracefully so we don't interfere with Codex
    process.exit(0);
  }
}
