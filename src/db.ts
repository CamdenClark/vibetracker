import { Database } from "bun:sqlite";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

const DB_PATH = join(process.env.HOME || "", ".vibetracker", "transcripts.db");

interface TranscriptData {
  sessionId: string;
  transcriptPath: string;
  transcriptContent: string;
  eventName: "Stop" | "SubagentStop";
  permissionMode: string;
  stopHookActive: boolean;
  timestamp: Date;
}

function getDb(): Database {
  // Ensure directory exists
  const dbDir = join(process.env.HOME || "", ".vibetracker");
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Create table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      transcript_path TEXT NOT NULL,
      transcript_content TEXT NOT NULL,
      event_name TEXT NOT NULL,
      permission_mode TEXT NOT NULL,
      stop_hook_active INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index on session_id for faster queries
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_session_id ON transcripts(session_id)
  `);

  return db;
}

export async function storeTranscript(data: TranscriptData): Promise<void> {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO transcripts (
      session_id,
      transcript_path,
      transcript_content,
      event_name,
      permission_mode,
      stop_hook_active,
      timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.sessionId,
    data.transcriptPath,
    data.transcriptContent,
    data.eventName,
    data.permissionMode,
    data.stopHookActive ? 1 : 0,
    data.timestamp.toISOString()
  );

  db.close();
}
