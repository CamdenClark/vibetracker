import { parseClaudeTranscript } from "./transcript";
import { saveTranscript } from "../shared/db";

interface HookData {
  session_id: string;
  transcript_path: string;
  event_name: "Stop" | "SubagentStop";
  permission_mode: string;
  stop_hook_active: boolean;
  timestamp: string;
}

export async function handleClaudeHook(dbPath?: string): Promise<void> {
  try {
    // Read hook data from stdin
    const stdinData = await readStdin();
    const hookData: HookData = JSON.parse(stdinData);

    // Parse the transcript file
    const parsed = parseClaudeTranscript(hookData.transcript_path);

    // Save to database in a single transaction
    saveTranscript(parsed, dbPath);

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
