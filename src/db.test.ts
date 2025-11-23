import { test, expect, beforeEach, afterEach } from "bun:test";
import { upsertSession, insertMessage, insertToolCall, upsertAgent, saveTranscript } from "./db";
import type { SessionData, MessageData, ToolCallData, AgentData } from "./db";
import { unlinkSync, existsSync, rmdirSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";

const TEST_DB_PATH = join(import.meta.dir, "..", "test-vibetracker.db");

beforeEach(() => {
  // Clean up any existing test database
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
});

afterEach(() => {
  // Clean up test database
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
});

test("should use default database path when not specified", () => {
  const sessionData: SessionData = {
    sessionId: "test-session-default",
    provider: "claude",
    projectPath: "/test/path",
    gitBranch: "main",
    startedAt: new Date(),
    lastActivityAt: new Date(),
  };

  // This should work without throwing
  upsertSession(sessionData);
});

test("should create database at custom path", () => {
  const sessionData: SessionData = {
    sessionId: "test-session-custom",
    provider: "claude",
    projectPath: "/test/path",
    gitBranch: "main",
    startedAt: new Date(),
    lastActivityAt: new Date(),
  };

  upsertSession(sessionData, TEST_DB_PATH);

  // Verify the database was created at the custom path
  expect(existsSync(TEST_DB_PATH)).toBe(true);
});

test("should store and retrieve data with custom database path", () => {
  const sessionData: SessionData = {
    sessionId: "test-session-retrieve",
    provider: "claude",
    projectPath: "/test/path",
    gitBranch: "main",
    startedAt: new Date(),
    lastActivityAt: new Date(),
  };

  const messageData: MessageData = {
    sessionId: "test-session-retrieve",
    provider: "claude",
    messageUuid: "msg-123",
    role: "user",
    content: "Hello, world!",
    isSidechain: false,
    timestamp: new Date(),
  };

  // Store data with custom path
  upsertSession(sessionData, TEST_DB_PATH);
  const messageId = insertMessage(messageData, TEST_DB_PATH);

  // Verify we got a message ID
  expect(messageId).toBeGreaterThan(0);

  // Query the database to verify the data was stored
  const db = new Database(TEST_DB_PATH);
  const session = db.query("SELECT * FROM sessions WHERE session_id = ?").get("test-session-retrieve");
  const message = db.query("SELECT * FROM messages WHERE message_uuid = ?").get("msg-123");
  db.close();

  expect(session).toBeTruthy();
  expect(message).toBeTruthy();
});

test("should handle tool calls with custom database path", () => {
  const sessionData: SessionData = {
    sessionId: "test-session-tools",
    provider: "claude",
    startedAt: new Date(),
  };

  const messageData: MessageData = {
    sessionId: "test-session-tools",
    provider: "claude",
    messageUuid: "msg-456",
    role: "assistant",
    content: "Using tool",
    isSidechain: false,
    timestamp: new Date(),
  };

  const toolCallData: ToolCallData = {
    messageId: 0, // Will be set after inserting message
    sessionId: "test-session-tools",
    provider: "claude",
    toolUseId: "tool-789",
    toolName: "Read",
    toolInput: '{"file_path": "/test.txt"}',
    isError: false,
    timestamp: new Date(),
  };

  // Store with custom path
  upsertSession(sessionData, TEST_DB_PATH);
  const messageId = insertMessage(messageData, TEST_DB_PATH);
  toolCallData.messageId = messageId;
  insertToolCall(toolCallData, TEST_DB_PATH);

  // Verify
  const db = new Database(TEST_DB_PATH);
  const toolCall = db.query("SELECT * FROM tool_calls WHERE tool_use_id = ?").get("tool-789");
  db.close();

  expect(toolCall).toBeTruthy();
});

test("should handle agents with custom database path", () => {
  const sessionData: SessionData = {
    sessionId: "test-session-agents",
    provider: "claude",
    startedAt: new Date(),
  };

  const agentData: AgentData = {
    agentId: "agent-001",
    sessionId: "test-session-agents",
    provider: "claude",
    subagentType: "Explore",
    status: "completed",
    startedAt: new Date(),
  };

  // Store with custom path
  upsertSession(sessionData, TEST_DB_PATH);
  upsertAgent(agentData, TEST_DB_PATH);

  // Verify
  const db = new Database(TEST_DB_PATH);
  const agent = db.query("SELECT * FROM agents WHERE agent_id = ?").get("agent-001");
  db.close();

  expect(agent).toBeTruthy();
});

test("should create nested directory structure for custom path", () => {
  const nestedPath = join(import.meta.dir, "..", "test-dir", "nested", "db.sqlite");

  const sessionData: SessionData = {
    sessionId: "test-session-nested",
    provider: "claude",
    startedAt: new Date(),
  };

  upsertSession(sessionData, nestedPath);

  // Verify the database was created at the nested path
  expect(existsSync(nestedPath)).toBe(true);

  // Clean up
  unlinkSync(nestedPath);
  rmdirSync(join(import.meta.dir, "..", "test-dir", "nested"));
  rmdirSync(join(import.meta.dir, "..", "test-dir"));
});

test("should save complete transcript in single transaction", () => {
  const transcript = {
    session: {
      sessionId: "test-session-transcript",
      provider: "claude_code",
      projectPath: "/test/project",
      gitBranch: "main",
      startedAt: new Date(),
      lastActivityAt: new Date(),
      modelProvider: "anthropic",
    },
    messages: [
      {
        sessionId: "test-session-transcript",
        provider: "claude_code",
        messageUuid: "msg-1",
        role: "user" as const,
        content: "Hello",
        isSidechain: false,
        timestamp: new Date(),
      },
      {
        sessionId: "test-session-transcript",
        provider: "claude_code",
        messageUuid: "msg-2",
        role: "assistant" as const,
        content: "Hi there!",
        isSidechain: false,
        timestamp: new Date(),
        inputTokens: 10,
        outputTokens: 5,
      },
    ],
    toolCalls: [
      {
        messageId: 2, // Sequential ID corresponding to the 2nd message (assistant)
        sessionId: "test-session-transcript",
        provider: "claude_code",
        toolUseId: "tool-1",
        toolName: "Read",
        toolInput: '{"file_path": "test.ts"}',
        isError: false,
        timestamp: new Date(),
      },
    ],
    agents: [
      {
        agentId: "agent-1",
        sessionId: "test-session-transcript",
        provider: "claude_code",
        subagentType: "Explore",
        status: "completed",
        totalTokens: 100,
      },
    ],
  };

  // Save entire transcript
  saveTranscript(transcript, TEST_DB_PATH);

  // Verify all data was saved
  const db = new Database(TEST_DB_PATH);
  const session = db.query("SELECT * FROM sessions WHERE session_id = ?").get("test-session-transcript");
  const messages = db.query("SELECT * FROM messages WHERE session_id = ?").all("test-session-transcript");
  const toolCalls = db.query("SELECT * FROM tool_calls WHERE session_id = ?").all("test-session-transcript");
  const agents = db.query("SELECT * FROM agents WHERE session_id = ?").all("test-session-transcript");
  db.close();

  expect(session).toBeTruthy();
  expect(messages.length).toBe(2);
  expect(toolCalls.length).toBe(1);
  expect(agents.length).toBe(1);
});
