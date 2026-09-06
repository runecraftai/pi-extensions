/**
 * Control Center for pi-tui — tabbed settings/overview overlay.
 *
 * Tabs: Overview, Conversas, Contexto, Aparência, Renderizadores, Configurações
 * Evolved from settings/settings-command.ts.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  Box,
  Container,
  Input,
  Key,
  matchesKey,
  SelectList,
  type SelectItem,
  Spacer,
  type TUI,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { FooterSegmentKey, FooterZone, PiTuiConfig, RenderersConfig, DiffMode } from "../config.ts";
import { loadConfig, saveConfig } from "../config.ts";
import { openConversationsPicker, type ConversationsPickerResult } from "../pickers/conversations.ts";
import { openLazyGit } from "./lazygit.ts";

/* ── Tab definitions ── */

type Tab = "overview" | "conversations" | "context" | "appearance" | "renderers" | "settings";
const TABS: Tab[] = ["overview", "conversations", "context", "appearance", "renderers", "settings"];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  conversations: "Conversas",
  context: "Contexto",
  appearance: "Aparência",
  renderers: "Renderizadores",
  settings: "Configurações",
};

/* ── Setting items ── */

interface SettingItem {
  id: string;
  label: string;
  currentValue: string;
}

const COPY = {
  title: "Pi TUI — Control Center",
  hint: "Tab/←/→: tabs · ↑/↓: move · Space: toggle · Enter: cycle/expand · Esc/q: close",
  labels: {
    enabled: "Extension enabled",
    headerEnabled: "Header",
    footerEnabled: "Footer",
    iconMode: "Icon mode",
    cursorStyle: "Cursor style",
    showBar: "Context bar (full)",
    showCompact: "Context compact fallback",
    headerMode: "Header mode",
    // Footer segments
    cwd: "CWD",
    timer: "Timer",
    gitBranch: "Git branch",
    gitStatus: "Git status",
    gitCommit: "Git commit",
    contextBar: "Context bar",
    model: "Model",
    thinking: "Thinking",
    tokens: "Tokens",
    cost: "Cost",
    extStatus: "Extension status",
  },
  values: {
    on: "On",
    off: "Off",
    iconModes: { auto: "Auto", nerd: "Nerd", ascii: "ASCII" },
    cursorStyles: { block: "Block", bar: "Bar", underline: "Underline" },
    headerModes: { auto: "Auto", welcome: "Welcome", compact: "Compact" },
  },
} as const;

/* ── Config mutators ── */

function toggleField<T, K extends keyof T>(obj: T, key: K): T {
  return { ...obj, [key]: !(obj[key] as boolean) } as T;
}

function cycleIconMode(config: PiTuiConfig): PiTuiConfig {
  const order: string[] = ["auto", "nerd", "ascii"];
  const idx = order.indexOf(config.icons.mode);
  return { ...config, icons: { ...config.icons, mode: order[(idx + 1) % order.length]! } };
}

function cycleCursorStyle(config: PiTuiConfig): PiTuiConfig {
  const order: string[] = ["block", "bar", "underline"];
  const idx = order.indexOf(config.editor.cursorStyle);
  return { ...config, editor: { ...config.editor, cursorStyle: order[(idx + 1) % order.length] as PiTuiConfig["editor"]["cursorStyle"] } };
}

function cycleHeaderMode(config: PiTuiConfig): PiTuiConfig {
  const order: Array<PiTuiConfig["header"]["mode"]> = ["auto", "welcome", "compact"];
  const idx = order.indexOf(config.header.mode);
  return { ...config, header: { ...config.header, mode: order[(idx + 1) % order.length]! } };
}

function toggleFooterSegment(config: PiTuiConfig, key: FooterSegmentKey): PiTuiConfig {
  const segs = config.footer.segments;
  return { ...config, footer: { ...config.footer, segments: { ...segs, [key]: !segs[key] } } };
}

function cycleFooterZone(config: PiTuiConfig, key: FooterSegmentKey): PiTuiConfig {
  const order: FooterZone[] = ["left", "center", "right"];
  const zones = config.footer.zones;
  const current = zones[key] ?? "left";
  const next = order[(order.indexOf(current) + 1) % order.length]!;
  return { ...config, footer: { ...config.footer, zones: { ...zones, [key]: next } } };
}

function toggleRendererEnabled(config: PiTuiConfig, key: string): PiTuiConfig {
  const enabled = { ...config.renderers.enabled, [key]: !config.renderers.enabled[key] };
  return { ...config, renderers: { ...config.renderers, enabled } };
}

function toggleRendererExpanded(config: PiTuiConfig, key: string): PiTuiConfig {
  const defaultExpanded = { ...config.renderers.defaultExpanded, [key]: !config.renderers.defaultExpanded[key] };
  return { ...config, renderers: { ...config.renderers, defaultExpanded } };
}

function cycleDiffMode(config: PiTuiConfig): PiTuiConfig {
  const order: DiffMode[] = ["auto", "split", "unified"];
  const idx = order.indexOf(config.renderers.diff.prefer);
  const prefer = order[(idx + 1) % order.length]!;
  return { ...config, renderers: { ...config.renderers, diff: { ...config.renderers.diff, prefer } } };
}

/* ── Build tab items ── */

function buildAppearanceItems(config: PiTuiConfig): SettingItem[] {
  const f = (v: boolean) => (v ? COPY.values.on : COPY.values.off);
  return [
    { id: "headerEnabled", label: COPY.labels.headerEnabled, currentValue: f(config.header.enabled) },
    { id: "footerEnabled", label: COPY.labels.footerEnabled, currentValue: f(config.footer.enabled) },
    { id: "iconMode", label: COPY.labels.iconMode, currentValue: COPY.values.iconModes[config.icons.mode as keyof typeof COPY.values.iconModes] ?? config.icons.mode },
    { id: "cursorStyle", label: COPY.labels.cursorStyle, currentValue: COPY.values.cursorStyles[config.editor.cursorStyle] },
    { id: "headerMode", label: COPY.labels.headerMode, currentValue: COPY.values.headerModes[config.header.mode] },
  ];
}

function buildRendererItems(config: PiTuiConfig): SettingItem[] {
  const f = (v: boolean) => (v ? COPY.values.on : COPY.values.off);
  const rendererKeys = ["read", "search", "listing", "command", "diff", "image"];
  const items: SettingItem[] = rendererKeys.map((key) => ({
    id: `rend:${key}`,
    label: `Renderer: ${key}`,
    currentValue: f(config.renderers.enabled[key] ?? false),
  }));
  items.push({ id: "rend:diffMode", label: "Diff mode", currentValue: config.renderers.diff.prefer });
  items.push({ id: "rend:diffHighlight", label: "Diff syntax highlight", currentValue: f(config.renderers.diff.highlight) });
  items.push({ id: "rend:diffLineNumbers", label: "Diff line numbers", currentValue: f(config.renderers.diff.showLineNumbers) });
  // Default expanded
  for (const key of rendererKeys) {
    items.push({
      id: `exp:${key}`,
      label: `Default expanded: ${key}`,
      currentValue: f(config.renderers.defaultExpanded[key] ?? false),
    });
  }
  items.push({ id: "exp:error", label: "Default expanded: error", currentValue: f(config.renderers.defaultExpanded["error"] ?? true) });
  return items;
}

function buildFooterItems(config: PiTuiConfig): SettingItem[] {
  const segs = config.footer.segments;
  const zones = config.footer.zones;
  const f = (v: boolean) => (v ? COPY.values.on : COPY.values.off);
  const order: FooterSegmentKey[] = [
    "cwd", "timer", "gitBranch", "gitStatus", "gitCommit",
    "contextBar", "model", "thinking", "tokens", "cost", "extStatus",
  ];
  return order.map((key) => ({
    id: `seg:${key}`,
    label: COPY.labels[key],
    currentValue: `${f(segs[key])} · ${zones[key] ?? "left"}`,
  }));
}

function buildOverviewItems(config: PiTuiConfig): SettingItem[] {
  const f = (v: boolean) => (v ? COPY.values.on : COPY.values.off);
  return [
    { id: "ov:enabled", label: COPY.labels.enabled, currentValue: f(config.enabled) },
    { id: "ov:header", label: COPY.labels.headerEnabled, currentValue: f(config.header.enabled) },
    { id: "ov:footer", label: COPY.labels.footerEnabled, currentValue: f(config.footer.enabled) },
    { id: "ov:iconMode", label: COPY.labels.iconMode, currentValue: config.icons.mode },
    { id: "ov:cursor", label: COPY.labels.cursorStyle, currentValue: config.editor.cursorStyle },
    { id: "ov:headerMode", label: COPY.labels.headerMode, currentValue: config.header.mode },
    { id: "ov:diffMode", label: "Diff mode", currentValue: config.renderers.diff.prefer },
  ];
}

/* ── Handle setting changes ── */

function handleSettingChange(tab: Tab, itemId: string, config: PiTuiConfig): PiTuiConfig {
  if (tab === "appearance") {
    if (itemId === "headerEnabled") return { ...config, header: { ...config.header, enabled: !config.header.enabled } };
    if (itemId === "footerEnabled") return { ...config, footer: { ...config.footer, enabled: !config.footer.enabled } };
    if (itemId === "iconMode") return cycleIconMode(config);
    if (itemId === "cursorStyle") return cycleCursorStyle(config);
    if (itemId === "headerMode") return cycleHeaderMode(config);
  }
  if (tab === "settings") {
    if (itemId === "seg:cwd") return toggleFooterSegment(config, "cwd");
    if (itemId === "seg:timer") return toggleFooterSegment(config, "timer");
    if (itemId === "seg:gitBranch") return toggleFooterSegment(config, "gitBranch");
    if (itemId === "seg:gitStatus") return toggleFooterSegment(config, "gitStatus");
    if (itemId === "seg:gitCommit") return toggleFooterSegment(config, "gitCommit");
    if (itemId === "seg:contextBar") return toggleFooterSegment(config, "contextBar");
    if (itemId === "seg:model") return toggleFooterSegment(config, "model");
    if (itemId === "seg:thinking") return toggleFooterSegment(config, "thinking");
    if (itemId === "seg:tokens") return toggleFooterSegment(config, "tokens");
    if (itemId === "seg:cost") return toggleFooterSegment(config, "cost");
    if (itemId === "seg:extStatus") return toggleFooterSegment(config, "extStatus");
  }
  if (tab === "renderers") {
    if (itemId.startsWith("rend:")) {
      const key = itemId.slice(5);
      if (key === "diffMode") return cycleDiffMode(config);
      if (key === "diffHighlight") return { ...config, renderers: { ...config.renderers, diff: { ...config.renderers.diff, highlight: !config.renderers.diff.highlight } } };
      if (key === "diffLineNumbers") return { ...config, renderers: { ...config.renderers, diff: { ...config.renderers.diff, showLineNumbers: !config.renderers.diff.showLineNumbers } } };
      return toggleRendererEnabled(config, key);
    }
    if (itemId.startsWith("exp:")) {
      const key = itemId.slice(4);
      return toggleRendererExpanded(config, key);
    }
  }
  return config;
}

function handleFooterCycle(tab: Tab, itemId: string, config: PiTuiConfig): PiTuiConfig {
  if (tab === "settings" && itemId.startsWith("seg:")) {
    const key = itemId.slice(4) as FooterSegmentKey;
    return cycleFooterZone(config, key);
  }
  return config;
}

/* ── Control Center UI ── */

class ControlCenterUi {
  private tab: Tab = "overview";
  private config: PiTuiConfig;
  private selectList: SelectList;
  private readonly container: Container;
  private readonly theme: Theme;
  private readonly onChange: (config: PiTuiConfig) => void;
  private readonly onClose: () => void;
  private readonly openConversations: () => Promise<ConversationsPickerResult>;
  private readonly openContext: () => void;
  private readonly openGit: () => Promise<void>;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;
  private compact = false;
  private readonly selectedItemByTab: Partial<Record<Tab, string>> = {};

  constructor(
    theme: Theme,
    config: PiTuiConfig,
    onChange: (config: PiTuiConfig) => void,
    onClose: () => void,
    openConversations: () => Promise<ConversationsPickerResult>,
    openContext: () => void,
    openGit: () => Promise<void>,
  ) {
    this.theme = theme;
    this.config = config;
    this.onChange = onChange;
    this.onClose = onClose;
    this.openConversations = openConversations;
    this.openContext = openContext;
    this.openGit = openGit;
    this.container = new Container();
    this.selectList = new SelectList([], 10, {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });
    this.rebuild();
  }

  private applySetting(itemId: string, isEnter = false): void {
    this.selectedItemByTab[this.tab] = itemId;
    if (this.tab === "settings" && itemId.startsWith("seg:") && isEnter) {
      this.config = handleFooterCycle(this.tab, itemId, this.config);
    } else {
      this.config = handleSettingChange(this.tab, itemId, this.config);
    }
    this.onChange(this.config);
    this.rebuild(itemId);
  }

  private switchTab(offset: number): void {
    const idx = TABS.indexOf(this.tab);
    this.tab = TABS[(idx + offset + TABS.length) % TABS.length]!;
    this.rebuild();
  }

  private goToTab(tab: Tab): void {
    this.tab = tab;
    this.rebuild();
  }

  private buildTabBar(): string {
    return TABS.map((tab) => {
      const active = tab === this.tab;
      const label = active ? `[${TAB_LABELS[tab]}]` : ` ${TAB_LABELS[tab]} `;
      return active ? this.theme.fg("accent", label) : this.theme.fg("dim", label);
    }).join(" ");
  }

  private rebuild(preferredItemId = this.selectedItemByTab[this.tab]): void {
    this.container.clear();
    this.container.addChild(new Text(this.theme.bold(this.theme.fg("accent", COPY.title)), 1, 0));
    this.container.addChild(new Text(this.buildTabBar(), 1, 0));
    this.container.addChild(new Text(this.theme.fg("dim", COPY.hint), 1, 0));
    this.container.addChild(new Spacer(1));

    // Handle non-list tabs
    if (this.tab === "overview") {
      this.renderOverview();
      return;
    }
    if (this.tab === "conversations") {
      this.renderConversationsTab();
      return;
    }
    if (this.tab === "context") {
      this.renderContextTab();
      return;
    }

    // List-based tabs
    const items = this.buildItems().map((item) => ({
      value: item.id,
      label: this.compact ? `${item.label}: ${item.currentValue}` : item.label,
      description: this.compact ? undefined : item.currentValue,
    }));

    this.selectList = new SelectList(items, Math.min(items.length, 12), {
      selectedPrefix: (t) => this.theme.fg("accent", t),
      selectedText: (t) => this.theme.fg("accent", t),
      description: (t) => this.theme.fg("muted", t),
      scrollInfo: (t) => this.theme.fg("dim", t),
      noMatch: (t) => this.theme.fg("warning", t),
    });

    const selectedIndex = items.findIndex((item) => item.value === preferredItemId);
    if (selectedIndex >= 0) this.selectList.setSelectedIndex(selectedIndex);
    this.selectedItemByTab[this.tab] = this.selectList.getSelectedItem()?.value;

    this.selectList.onSelectionChange = (item) => {
      this.selectedItemByTab[this.tab] = item.value;
    };
    this.selectList.onSelect = (item) => {
      this.applySetting(item.value);
    };
    this.selectList.onCancel = () => {
      this.onClose();
    };

    this.container.addChild(this.selectList);
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private renderOverview(): void {
    const f = (v: boolean) => (v ? COPY.values.on : COPY.values.off);
    const lines: string[] = [
      this.theme.fg("accent", "System Status"),
      "",
      `  Extension: ${f(this.config.enabled)}`,
      `  Header:    ${f(this.config.header.enabled)} (${this.config.header.mode})`,
      `  Footer:    ${f(this.config.footer.enabled)}`,
      `  Icons:     ${this.config.icons.mode}`,
      `  Cursor:    ${this.config.editor.cursorStyle}`,
      `  Diff mode: ${this.config.renderers.diff.prefer}`,
      "",
      this.theme.fg("dim", "Press Space to toggle, or switch tabs for detailed settings"),
    ];
    for (const line of lines) {
      this.container.addChild(new Text(line, 1, 0));
    }
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private renderConversationsTab(): void {
    this.container.addChild(new Text(this.theme.fg("dim", "Opening conversations picker..."), 1, 0));
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private renderContextTab(): void {
    this.container.addChild(new Text(this.theme.fg("dim", "Opening context inspector..."), 1, 0));
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private buildItems(): SettingItem[] {
    switch (this.tab) {
      case "appearance": return buildAppearanceItems(this.config);
      case "renderers": return buildRendererItems(this.config);
      case "settings": return buildFooterItems(this.config);
      default: return [];
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
      this.switchTab(1);
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
      this.switchTab(-1);
      this.invalidate();
      return;
    }
    if (matchesKey(data, Key.escape) || data === "q") {
      this.onClose();
      return;
    }

    // Tab-specific actions
    if (this.tab === "conversations") {
      // Open the conversations picker
      this.openConversations().then((result) => {
        if (result.type === "select" && result.sessionInfo) {
          this.onClose();
        }
      });
      return;
    }

    if (this.tab === "context") {
      this.openContext();
      return;
    }

    // List tabs: toggle on space, cycle on enter
    if (matchesKey(data, Key.space) || data === " ") {
      const selected = this.selectList.getSelectedItem();
      if (selected) this.applySetting(selected.value, false);
    } else if (data === "\r" || data === "\n") {
      const selected = this.selectList.getSelectedItem();
      if (selected) this.applySetting(selected.value, true);
    } else {
      this.selectList.handleInput?.(data);
    }
    this.invalidate();
  }

  render(width: number): string[] {
    const compact = width <= 60;
    if (compact !== this.compact) {
      this.compact = compact;
      this.rebuild();
    }
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    this.cachedWidth = width;
    this.cachedLines = this.container.render(width);
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    this.container.invalidate();
  }

  /** Navigate to a specific tab (for subcommands). */
  navigateTo(tab: Tab): void {
    this.goToTab(tab);
  }
}

/* ── Command registration ── */

export function registerControlCenter(
  pi: ExtensionAPI,
  hooks: {
    getConfig: () => PiTuiConfig;
    onConfigChanged: (config: PiTuiConfig) => void;
    onOverlayClosed?: () => void;
    refreshGitStatus?: () => void;
  },
): void {
  const openCenter = async (ctx: ExtensionContext, initialTab?: Tab) => {
    if (!ctx.hasUI) return;

    await ctx.ui.custom<void>((tui: TUI, theme, _kb, done) => {
      let closed = false;
      const ui = new ControlCenterUi(
        theme,
        hooks.getConfig(),
        (config) => hooks.onConfigChanged(config),
        () => {
          closed = true;
          done(undefined);
        },
        // openConversations
        () => openConversationsPicker(ctx, theme),
        // openContext — placeholder (Phase 2 context picker)
        () => {
          ctx.ui.notify("Context inspector coming in Phase 2", "info");
        },
        // openGit
        () => openLazyGit(ctx).then(() => hooks.refreshGitStatus?.()),
      );

      if (initialTab) {
        ui.navigateTo(initialTab);
      }

      return {
        render: (w: number) => ui.render(w),
        invalidate: () => ui.invalidate(),
        handleInput: (data: string) => {
          ui.handleInput(data);
          tui.requestRender();
        },
      };
    }, { overlay: true });

    hooks.onOverlayClosed?.();
  };

  // Main /pi-tui command
  pi.registerCommand("pi-tui", {
    description: "Open the pi-tui Control Center, or use /pi-tui <subcommand>",
    handler: async (args, ctx: ExtensionContext) => {
      const subcommand = (args?.trim() ?? "").toLowerCase();

      if (subcommand === "reload") {
        hooks.onConfigChanged(loadConfig());
        ctx.ui.notify("TUI reloaded from config", "info");
        return;
      }

      // Subcommands that navigate to specific tabs
      const tabMap: Record<string, Tab> = {
        conversations: "conversations",
        context: "context",
        git: "overview", // Git opens LazyGit directly
        renderers: "renderers",
        appearance: "appearance",
        settings: "settings",
      };

      if (subcommand === "git") {
        await openLazyGit(ctx);
        hooks.refreshGitStatus?.();
        return;
      }

      if (subcommand in tabMap) {
        await openCenter(ctx, tabMap[subcommand]!);
        return;
      }

      if (subcommand !== "" && subcommand !== "reload") {
        ctx.ui.notify(
          `Unknown /pi-tui subcommand: "${subcommand}". Available: reload, conversations, context, git, renderers, appearance, settings`,
          "warning",
        );
        return;
      }

      // No subcommand: open the full Control Center
      await openCenter(ctx);
    },
  });
}
