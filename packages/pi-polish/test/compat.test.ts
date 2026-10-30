import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test, type TestContext } from "node:test";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import chrome from "../extensions/chrome.ts";
import tools from "../extensions/tools.ts";
import { shortCommand } from "../extensions/command.ts";

// Delivery-reader contract from Squad bin/sq-tmux-lib.sh: fm_busy_lines_match
// runs grep -qiE, using the first pattern for pi and pi-signed, the second
// for an unspecified harness. Keep the ASCII full stops, not a Unicode ellipsis.
const PI_BUSY = String.raw`Working\.\.\.`;
const DEFAULT_BUSY = String.raw`esc (to )?interrupt|Working\.\.\.|Ctrl\+c:cancel`;
function busy(line: string, pattern = PI_BUSY) {
  const result = spawnSync("grep", ["-qiE", pattern], { input: line, encoding: "utf8" });
  assert.ifError(result.error);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  return result.status === 0;
}

// Executable snapshot of fm_composer_idle_matches/fm_composer_classify_content
// in Squad bin/sq-composer-lib.sh. These are the real shell classifications,
// not a second classifier invented for this extension. No Squad checkout is
// required in CI. The caller supplies ANSI/border-stripped, trimmed content.
const COMPOSER_CLASSIFIER = String.raw`
fm_composer_idle_matches() {
  local content=$1 idle_re=$2 idle_case=$3
  [ -n "$idle_re" ] || return 1
  case "$idle_case" in
    insensitive) printf '%s' "$content" | grep -qiE "$idle_re" ;;
    *) printf '%s' "$content" | grep -qE "$idle_re" ;;
  esac
}
fm_composer_classify_content() {
  local bordered=$1 content=$2 idle_re=${'${3:-}'} idle_case=${'${4:-sensitive}'} plain_content
  plain_content=${'${5:-$content}'}
  if [ "$bordered" != 1 ] && [ -z "$content" ] && [ -n "$plain_content" ]; then
    case "$plain_content" in
      '❯'|'›'|'⟩') printf 'empty'; return 0 ;;
      *) printf 'unknown'; return 0 ;;
    esac
  fi
  case "$content" in
    '❯'|'›'|'⟩') printf 'empty'; return 0 ;;
    '>'|'$'|'%'|'#')
      if [ "$bordered" = 1 ]; then printf 'empty'; else printf 'unknown'; fi
      return 0 ;;
  esac
  [ -n "$content" ] || { printf 'empty'; return 0; }
  if fm_composer_idle_matches "$content" "$idle_re" "$idle_case"; then
    printf 'empty'; return 0
  fi
  case "$content" in
    '❯ '*|'› '*|'⟩ '*|'> '*|'$ '*|'% '*|'# '*) content=${'${content#??}'} ;;
    '❯'*|'›'*|'⟩'*|'>'*|'$'*|'%'*|'#'*) content=${'${content#?}'} ;;
  esac
  content=${'"${content#"${content%%[![:space:]]*}"}"'}
  content=${'"${content%"${content##*[![:space:]]}"}"'}
  [ -n "$content" ] || { printf 'empty'; return 0; }
  if fm_composer_idle_matches "$content" "$idle_re" "$idle_case"; then
    printf 'empty'; return 0
  fi
  printf 'pending'; return 0
}
`;

function classify(content: string, bordered = false, plain = content) {
  const result = spawnSync("bash", ["-c", `${COMPOSER_CLASSIFIER}\nfm_composer_classify_content "$1" "$2" "$3" "$4" "$5"`,
    "squad-composer", bordered ? "1" : "0", content.trim(), "", "sensitive", plain.trim()], { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text, appearance: "dark" };
function harness(t: TestContext, withCustomEditor = false) {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: 100_000 });
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  let renderer: any;
  const pi = {
    on(name: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerToolRenderer(resolve: any) { renderer = resolve; },
  };
  const tui = { requestRender() {}, terminal: { rows: 40, columns: 80 } };
  const editorTheme = { borderColor: (text: string) => text, selectList: {} };
  const keybindings = { matches: () => false };
  const editor = new CustomEditor(tui as never, editorTheme as never, keybindings as never);
  const setText = editor.setText.bind(editor);
  const editorWrites: string[] = [];
  editor.setText = (text: string) => { editorWrites.push(text); setText(text); };
  const initialFactory = withCustomEditor ? () => editor : undefined;
  let editorFactory: any = initialFactory;
  const widgets = new Map<string, any>();
  const working: Array<string | undefined> = [];
  const ui = {
    setWorkingIndicator() {},
    setWorkingMessage(message?: string) { working.push(message); },
    setWidget(key: string, factory: any) { widgets.set(key, factory?.(tui, theme)); },
    getEditorText: () => editor.getText(),
    setEditorText: (text: string) => editor.setText(text),
    getEditorComponent: () => editorFactory,
    setEditorComponent: (factory: any) => { editorFactory = factory; },
  };
  const ctx = { hasUI: true, ui, sessionManager: { getBranch: () => [] } };
  chrome(pi as never);
  tools(pi as never);
  const emit = async (name: string, event: any = {}) => {
    for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
  };
  t.after(() => emit("session_shutdown"));
  return {
    emit, ctx, working, widgets, editor, editorWrites,
    type: setText,
    renderEditor: (width: number) => (editorFactory?.(tui, editorTheme, keybindings) ?? editor).render(width),
    assertEditorUnchanged: () => assert.equal(editorFactory, initialFactory),
    tool: (name: string, next = () => undefined) => renderer(name, next),
  };
}

test("all rendered phases match Squad's pi, pi-signed, and generic busy patterns", async (t) => {
  const h = harness(t);
  await h.emit("session_start");
  await h.emit("agent_start");
  const check = (phase: string) => {
    const line = h.working.at(-1)!;
    assert.ok(busy(line), `Squad cannot recognize ${line}`);
    assert.ok(busy(line, DEFAULT_BUSY));
    assert.ok(stripTerminalSequences(line).includes(`${phase}…`), line);
  };
  check("Thinking");
  for (const [type, phase] of [["text", "Responding"], ["toolCall", "Preparing a tool call"], ["thinking", "Thinking"]]) {
    await h.emit("message_update", { message: { role: "assistant", content: [{ type, text: "answer", thinking: "reason" }] } });
    t.mock.timers.tick(1000);
    check(phase);
  }
  for (const [toolName, phase] of [
    ["bash", "Running"], ["read", "Reading"], ["edit", "Editing"], ["write", "Writing"],
    ["grep", "Searching"], ["find", "Searching"], ["tool_search", "Searching"],
    ["bg_run", "Starting a background job"], ["questionnaire", "Waiting for your answer"],
    ["mcp__docs__lookup", "Calling"], ["custom_tool", "Running custom_tool"],
  ]) {
    await h.emit("tool_execution_start", { toolName, toolCallId: toolName, args: {} });
    check(phase);
    await h.emit("tool_execution_end", { toolCallId: toolName, isError: false });
  }
  await h.emit("agent_end");
  assert.equal(h.working.at(-1), undefined);
  const summary = [...h.widgets.values()].flatMap((widget) => widget?.render(80) ?? []).join("\n");
  assert.match(summary, /Worked for/);
  assert.equal(busy(summary), false);
  assert.equal(busy("Thinking… (2s · ↓ 10 tokens)"), false);
  assert.equal(busy("Working… Thinking…"), false);
});

for (const withCustomEditor of [false, true]) {
  test(`composer stays untouched with ${withCustomEditor ? "custom" : "default"} editor`, async (t) => {
    const h = harness(t, withCustomEditor);
    const baseline = new Map([20, 40, 80].map((width) => [width, h.renderEditor(width)]));
    await h.emit("session_start");
    await h.emit("agent_start");
    for (const width of [20, 40, 80]) {
      const lines = h.renderEditor(width);
      assert.deepEqual(lines, baseline.get(width), "Polish must not decorate live editor content");
      assert.equal(classify(stripTerminalSequences(lines[1])), "empty");
      assert.equal(h.editor.getText(), "");
    }
    for (const text of ["a pending message", "line one\nline two", "❯ a literal prompt", "你好"]) {
      h.type(text);
      await h.emit("message_update", { message: { role: "assistant", content: [{ type: "text", text: "reply" }] } });
      t.mock.timers.tick(1000);
      assert.equal(h.editor.getText(), text);
      const rows = h.renderEditor(80).slice(1, -1);
      assert.ok(rows.some((row: string) => classify(stripTerminalSequences(row)) === "pending"));
    }
    h.type("");
    await h.emit("agent_end");
    await h.emit("session_tree");
    await h.emit("session_shutdown");
    assert.equal(classify(stripTerminalSequences(h.renderEditor(80)[1])), "empty");
    assert.deepEqual(h.editorWrites, [], "extension must never write the composer buffer");
    h.assertEditorUnchanged();
  });
}

test("Squad's classifier preserves empty, pending, and unsafe-shell unknown verdicts", () => {
  for (const glyph of ["", "❯", "›", "⟩"]) assert.equal(classify(glyph), "empty");
  for (const glyph of [">", "$", "%", "#"]) {
    assert.equal(classify(glyph), "unknown");
    assert.equal(classify(glyph, true), "empty");
  }
  for (const content of ["typed text", "❯ typed text", "›typed text", "> typed text"]) {
    assert.equal(classify(content), "pending");
  }
  assert.equal(classify("", false, "hidden non-agent content"), "unknown");
  assert.equal(classify("", false, "❯"), "empty");
});

test("tools still group calls and render highlighted edit/write diffs without replacing execution", async (t) => {
  const h = harness(t);
  await h.emit("session_start");
  await h.emit("agent_start");
  const context = { toolCallId: "one", invalidate() {}, executionStarted: true, isPartial: true, args: { command: "printf hello" } };
  await h.emit("tool_execution_start", { toolName: "bash", toolCallId: "one", args: context.args });
  await h.emit("tool_execution_update", { toolCallId: "one", partialResult: { content: [{ type: "text", text: "hello\nlatest output\n" }] } });
  const bash = h.tool("bash");
  const running = bash.renderCall(context.args, theme, context).render(80).join("\n");
  assert.match(running, /Running 1 shell command/);
  assert.match(running, /latest output/);
  await h.emit("tool_execution_end", { toolCallId: "one", isError: false });
  assert.match(bash.renderCall(context.args, theme, context).render(80).join("\n"), /Ran 1 shell command/);
  const fallback = { renderShell: "default" };
  assert.equal(h.tool("unknown_tool", () => fallback), fallback);
  for (const name of ["edit", "write"]) {
    const renderer = h.tool(name);
    const result = { content: [], details: { diff: '-1 const x = "before";\n+1 const x = "after";' } };
    const component = renderer.renderResult(result, { expanded: true, isPartial: false }, theme,
      { args: { path: "example.ts", content: 'const x = "after";' }, isError: false });
    const lines = component.render(80);
    assert.ok(lines.some((line: string) => line.includes("\x1b[38;2;")), "syntax highlighting must be retained");
    assert.match(stripTerminalSequences(lines.join("\n")), /after/);
    assert.ok(lines.every((line: string) => visibleWidth(line) <= 80));
  }
});

test("codemode calls fold into one compact row and expand to bounded full code", async (t) => {
  const h = harness(t);
  await h.emit("session_start");

  const code = `\n${"const value = 1; // " + "x".repeat(70)}\n${Array.from({ length: 61 }, (_, i) => `const line${i} = ${i};`).join("\n")}`;
  const args = { code };
  const call = h.tool("codemode");
  const context = { toolCallId: "code-one", invalidate() {}, executionStarted: true, isPartial: true, args };
  const labelContext = { ...context, toolCallId: "code-label", executionStarted: false };
  const labelRows = call.renderCall(args, theme, labelContext).render(100);
  const firstLine = args.code.split("\n").map((line) => line.trim()).find(Boolean)!;
  assert.equal(labelRows.length, 1);
  assert.equal(stripTerminalSequences(labelRows[0]).trim(), `Codemode ${firstLine.slice(0, 60)}`);
  assert.equal(stripTerminalSequences(labelRows[0]).includes("const line0"), false);
  const emptyRows = call.renderCall({ code: " \n " }, theme, { toolCallId: "code-empty" }).render(100);
  assert.equal(stripTerminalSequences(emptyRows[0]).trim(), "Codemode");

  await h.emit("agent_start");
  await h.emit("tool_execution_start", { toolName: "codemode", toolCallId: "code-one", args });
  const running = call.renderCall(args, theme, context).render(100);
  assert.equal(running.length, 1);
  assert.equal(stripTerminalSequences(running[0]).includes("const value"), false);
  await h.emit("tool_execution_end", { toolCallId: "code-one", isError: false });
  const collapsed = call.renderCall(args, theme, context).render(100);
  assert.equal(collapsed.length, 1);
  assert.equal(stripTerminalSequences(collapsed[0]).trim(), "Ran 1 code block");

  const expanded = call.renderCall(args, theme, { ...context, expanded: true }).render(120).map(stripTerminalSequences).join("\n");
  assert.ok(expanded.includes(firstLine));
  assert.ok(expanded.includes("const line58 = 58;"));
  assert.ok(expanded.includes("... 2 more lines"));
  assert.equal(expanded.includes("const line60 = 60;"), false);

  const secondArgs = { code: "return 2;\nmore();" };
  await h.emit("tool_execution_start", { toolName: "codemode", toolCallId: "code-two", args: secondArgs });
  await h.emit("tool_execution_end", { toolCallId: "code-two", isError: false });
  const grouped = call.renderCall(args, theme, context).render(100);
  assert.equal(grouped.length, 1);
  assert.equal(stripTerminalSequences(grouped[0]).trim(), "Ran 2 code blocks");
});

test("command helper shortens only cwd prefixes and preserves other commands", () => {
  assert.equal(shortCommand(`cd "${process.cwd()}" && npm test`, process.cwd()), "npm test");
  assert.equal(shortCommand("printf hello\nprintf goodbye", process.cwd()), "printf hello");
  assert.equal(shortCommand("cd /elsewhere && npm test", process.cwd()), "cd …/elsewhere && npm test");
});
