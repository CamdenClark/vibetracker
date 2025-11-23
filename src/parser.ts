import { readFileSync } from "fs";
import { parseWithAdapter } from "./adapter";
import { ClaudeAdapter } from "./adapters/claude";
import { CodexAdapter } from "./adapters/codex";
import type { ParsedTranscript } from "./adapter";

// Available adapters
const ADAPTERS = [
  new ClaudeAdapter(),
  new CodexAdapter(),
];

export function parseTranscriptFile(filePath: string): ParsedTranscript {
  const content = readFileSync(filePath, "utf-8");
  return parseWithAdapter(content, filePath, ADAPTERS);
}

export function parseTranscript(content: string, filePath?: string): ParsedTranscript {
  return parseWithAdapter(content, filePath, ADAPTERS);
}

// Re-export for convenience
export type { ParsedTranscript } from "./adapter";
