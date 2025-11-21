import { storeTranscript } from "./db.ts";

interface HookInput {
  session_id: string;
  transcript_path: string;
  permission_mode: string;
  hook_event_name: "Stop" | "SubagentStop";
  stop_hook_active: boolean;
}

export async function claudeHook() {
  try {
    // Read JSON from stdin
    const input = await readStdin();
    const hookData: HookInput = JSON.parse(input);

    // Read the transcript file
    const transcriptPath = expandPath(hookData.transcript_path);
    const transcriptFile = Bun.file(transcriptPath);
    const transcriptContent = await transcriptFile.text();

    // Store in database
    await storeTranscript({
      sessionId: hookData.session_id,
      transcriptPath: hookData.transcript_path,
      transcriptContent,
      eventName: hookData.hook_event_name,
      permissionMode: hookData.permission_mode,
      stopHookActive: hookData.stop_hook_active,
      timestamp: new Date(),
    });

    // Allow normal termination - no output needed
  } catch (error) {
    // Log error to stderr but don't block Claude
    console.error("Vibetracker error:", error);
    // Exit successfully so we don't interfere with Claude
    process.exit(0);
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return path.replace("~", process.env.HOME || "");
  }
  return path;
}
