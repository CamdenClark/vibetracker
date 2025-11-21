#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { join } from "path";
import { parseTranscriptFile } from "./parser";
import { upsertSession, insertMessage, insertToolCall, upsertAgent } from "./db-v2";

const DB_PATH = join(process.env.HOME || "", ".vibetracker", "transcripts.db");

interface OldTranscript {
  id: number;
  session_id: string;
  transcript_path: string;
  transcript_content: string;
  event_name: string;
  permission_mode: string;
  stop_hook_active: number;
  timestamp: string;
  created_at: string;
}

async function migrateOldTranscripts() {
  console.log("Starting migration from old schema to new schema...\n");

  const db = new Database(DB_PATH);

  // Check if old transcripts table exists
  const tableExists = db
    .query(`SELECT name FROM sqlite_master WHERE type='table' AND name='transcripts'`)
    .get();

  if (!tableExists) {
    console.log("No old transcripts table found. Nothing to migrate.");
    db.close();
    return;
  }

  // Get all old transcripts
  const oldTranscripts = db
    .query(`SELECT * FROM transcripts ORDER BY created_at ASC`)
    .all() as OldTranscript[];

  db.close();

  console.log(`Found ${oldTranscripts.length} old transcript(s) to migrate.\n`);

  let successCount = 0;
  let errorCount = 0;
  const processedSessions = new Set<string>();

  for (const transcript of oldTranscripts) {
    try {
      // Skip if we've already processed this session
      if (processedSessions.has(transcript.session_id)) {
        console.log(`⊘ Skipping duplicate session ${transcript.session_id}`);
        continue;
      }

      console.log(`Processing ${transcript.event_name} for session ${transcript.session_id}...`);

      // Parse the transcript
      const parsed = parseTranscriptFile(transcript.transcript_path);

      // Store session
      upsertSession(parsed.session);

      // Store messages and build message ID map
      const messageIdMap = new Map<string, number>();
      for (const message of parsed.messages) {
        const messageId = insertMessage(message);
        messageIdMap.set(message.messageUuid, messageId);
      }

      // Store tool calls
      for (const toolCall of parsed.toolCalls) {
        // Tool calls reference messages by UUID, need to map to DB message ID
        // The toolCall.messageId is currently a temporary sequential ID from parser
        // We need to find the actual message this tool belongs to
        const message = parsed.messages[toolCall.messageId - 1]; // messageId in parser is 1-indexed sequential
        if (message) {
          const actualMessageId = messageIdMap.get(message.messageUuid);
          if (actualMessageId) {
            toolCall.messageId = actualMessageId;
            insertToolCall(toolCall);
          }
        }
      }

      // Store agents
      for (const agent of parsed.agents) {
        upsertAgent(agent);
      }

      processedSessions.add(transcript.session_id);
      successCount++;

      console.log(`  ✓ Migrated: ${parsed.messages.length} messages, ${parsed.toolCalls.length} tool calls, ${parsed.agents.length} agents\n`);
    } catch (error) {
      errorCount++;
      console.error(`  ✗ Error migrating transcript ${transcript.id}:`, error);
      console.error();
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Migration complete!");
  console.log(`  ✓ Success: ${successCount}`);
  console.log(`  ✗ Errors:  ${errorCount}`);
  console.log("=".repeat(60));

  if (successCount > 0) {
    console.log("\nDropping old 'transcripts' table...");
    const dropDb = new Database(DB_PATH);
    dropDb.run("DROP TABLE IF EXISTS transcripts");
    dropDb.close();
    console.log("✓ Old table dropped successfully.");
  }
}

// Run migration
migrateOldTranscripts().catch(console.error);
