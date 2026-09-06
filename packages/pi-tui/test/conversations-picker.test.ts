/**
 * Tests for pi-tui conversations picker (pickers/conversations.ts).
 *
 * Tests the pure helper functions by importing from source.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { relativeTime, formatSize } from "../extensions/pi-tui/pickers/conversations.ts";

/* ── Tests ── */

describe("Conversations Picker", () => {
  describe("relativeTime", () => {
    it("formats seconds ago", () => {
      const now = Date.now();
      assert.equal(relativeTime(new Date(now - 5000)), "5s ago");
      assert.equal(relativeTime(new Date(now - 30000)), "30s ago");
    });

    it("formats minutes ago", () => {
      const now = Date.now();
      assert.equal(relativeTime(new Date(now - 60000)), "1m ago");
      assert.equal(relativeTime(new Date(now - 1800000)), "30m ago");
    });

    it("formats hours ago", () => {
      const now = Date.now();
      assert.equal(relativeTime(new Date(now - 3600000)), "1h ago");
      assert.equal(relativeTime(new Date(now - 86400000 / 2)), "12h ago");
    });

    it("formats days ago", () => {
      const now = Date.now();
      assert.equal(relativeTime(new Date(now - 86400000)), "1d ago");
      assert.equal(relativeTime(new Date(now - 86400000 * 7)), "7d ago");
    });
  });

  describe("formatSize", () => {
    it("formats bytes", () => {
      assert.equal(formatSize(0), "0B");
      assert.equal(formatSize(512), "512B");
      assert.equal(formatSize(1023), "1023B");
    });

    it("formats kilobytes", () => {
      assert.equal(formatSize(1024), "1.0KB");
      assert.equal(formatSize(5120), "5.0KB");
      assert.equal(formatSize(1048575), "1024.0KB");
    });

    it("formats megabytes", () => {
      assert.equal(formatSize(1048576), "1.0MB");
      assert.equal(formatSize(5242880), "5.0MB");
    });

    it("returns empty for undefined", () => {
      assert.equal(formatSize(undefined), "");
    });
  });

  describe("ConversationEntry shape", () => {
    it("has required fields", () => {
      const entry = {
        id: "test-id",
        name: "test-session",
        cwd: "/home/user/project",
        model: "claude-sonnet",
        created: new Date(),
        modified: new Date(),
        messageCount: 10,
        firstMessage: "Hello world",
        isCurrentSession: false,
      };
      assert.equal(typeof entry.id, "string");
      assert.equal(typeof entry.name, "string");
      assert.equal(typeof entry.cwd, "string");
      assert.equal(typeof entry.model, "string");
      assert.ok(entry.created instanceof Date);
      assert.ok(entry.modified instanceof Date);
      assert.equal(typeof entry.messageCount, "number");
      assert.equal(typeof entry.firstMessage, "string");
      assert.equal(typeof entry.isCurrentSession, "boolean");
    });
  });
});
