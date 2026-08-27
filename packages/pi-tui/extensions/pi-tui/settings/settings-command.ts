/**
 * Interactive settings dialog for pi-tui.
 *
 * Pattern from pi-open-tui's /open-tui: tabbed SelectList inside ctx.ui.custom overlay.
 */

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
  Box,
  Key,
  matchesKey,
  SelectList,
  type SelectItem,
  type TUI,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { FooterSegmentKey, FooterZone, PiTuiConfig } from "../config.ts";
import { loadConfig, saveConfig } from "../config.ts";

/* ── Tab & copy ── */

type Tab = "general" | "appearance" | "footer";
const TABS: Tab[] = ["general", "appearance", "footer"];

interface SettingItem {
  id: string;
  label: string;
  currentValue: string;
}

const COPY = {
  title: "Pi TUI Settings",
  tabs: { general: "General", appearance: "Appearance", footer: "Footer" },
  hint: "Tab/←/→: tabs · ↑/↓: move · Space: toggle · Enter: cycle zone (Footer) · Esc/q: close",
  labels: {
    enabled: "Extension enabled",
    headerEnabled: "Header",
    footerEnabled: "Footer",
    iconMode: "Icon mode",
    cursorStyle: "Cursor style",
    // Footer segments
    cwd: "CWD",
    timer: "Timer",
    gitBranch: "Git branch",
    gitStatus: "Git status",
    gitCommit: "Git commit",
    runtime: "Runtime",
    contextBar: "Context bar",
    model: "Model",
    thinking: "Thinking",
    tokens: "Tokens",
    cost: "Cost",
    extStatus: "Extension status",
  },
  values: {
    on: "[ON]",
    off: "[OFF]",
    iconModes: { auto: "Auto", nerd: "Nerd", ascii: "ASCII" },
    cursorStyles: { block: "Block", bar: "Bar", underline: "Underline" },
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

/* ── Build tab items ── */

function buildGeneralItems(config: PiTuiConfig): SettingItem[] {
  const f = (v: boolean) => (v ? COPY.values.on : COPY.values.off);
  return [
    { id: "enabled", label: COPY.labels.enabled, currentValue: f(config.enabled) },
    { id: "headerEnabled", label: COPY.labels.headerEnabled, currentValue: f(config.header.enabled) },
    { id: "footerEnabled", label: COPY.labels.footerEnabled, currentValue: f(config.footer.enabled) },
  ];
}

function buildAppearanceItems(config: PiTuiConfig): SettingItem[] {
  return [
    { id: "iconMode", label: COPY.labels.iconMode, currentValue: COPY.values.iconModes[config.icons.mode as keyof typeof COPY.values.iconModes] ?? config.icons.mode },
    { id: "cursorStyle", label: COPY.labels.cursorStyle, currentValue: COPY.values.cursorStyles[config.editor.cursorStyle] },
  ];
}

function buildFooterItems(config: PiTuiConfig): SettingItem[] {
  const segs = config.footer.segments;
  const zones = config.footer.zones;
  const f = (v: boolean) => (v ? COPY.values.on : COPY.values.off);
  const order: FooterSegmentKey[] = [
    "cwd", "timer", "gitBranch", "gitStatus", "gitCommit",
    "runtime", "contextBar", "model", "thinking", "tokens", "cost", "extStatus",
  ];
  return order.map((key) => ({
    id: `seg:${key}`,
    label: COPY.labels[key],
    currentValue: `${f(segs[key])} · Zone: ${(zones[key] ?? "left").toUpperCase()}`,
  }));
}

function buildItems(tab: Tab, config: PiTuiConfig): SettingItem[] {
  switch (tab) {
    case "general": return buildGeneralItems(config);
    case "appearance": return buildAppearanceItems(config);
    case "footer": return buildFooterItems(config);
  }
}

function handleSettingChange(tab: Tab, itemId: string, config: PiTuiConfig): PiTuiConfig {
  if (tab === "general") {
    if (itemId === "enabled") return toggleField(config, "enabled");
    if (itemId === "headerEnabled") return { ...config, header: { ...config.header, enabled: !config.header.enabled } };
    if (itemId === "footerEnabled") return { ...config, footer: { ...config.footer, enabled: !config.footer.enabled } };
  }
  if (tab === "appearance") {
    if (itemId === "iconMode") return cycleIconMode(config);
    if (itemId === "cursorStyle") return cycleCursorStyle(config);
  }
  if (tab === "footer") {
    if (itemId.startsWith("seg:")) {
      const key = itemId.slice(4) as FooterSegmentKey;
      return toggleFooterSegment(config, key);
    }
    if (itemId.startsWith("zone:")) {
      const key = itemId.slice(5) as FooterSegmentKey;
      return cycleFooterZone(config, key);
    }
  }
  return config;
}

/* ── Settings UI component ── */

class SettingsUi {
  private tab: Tab = "general";
  private config: PiTuiConfig;
  private selectList: SelectList;
  private readonly container: Box;
  private readonly theme: Theme;
  private readonly onChange: (config: PiTuiConfig) => void;
  private readonly onClose: () => void;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;
  private compact = false;
  private readonly selectedItemByTab: Partial<Record<Tab, string>> = {};

  constructor(
    theme: Theme,
    config: PiTuiConfig,
    onChange: (config: PiTuiConfig) => void,
    onClose: () => void,
  ) {
    this.theme = theme;
    this.config = config;
    this.onChange = onChange;
    this.onClose = onClose;
    this.container = new Box(1, 1, (s: string) => theme.bg("customMessageBg", s));
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
    // Footer segments: Enter cycles zone, Space toggles enable/disable
    if (this.tab === "footer" && itemId.startsWith("seg:") && isEnter) {
      const key = itemId.slice(4);
      this.config = cycleFooterZone(this.config, key as FooterSegmentKey);
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

  private rebuild(preferredItemId = this.selectedItemByTab[this.tab]): void {
    this.container.clear();
    this.container.addChild(new Text(this.theme.bold(this.theme.fg("accent", COPY.title)), 1, 0));

    const tabBar = TABS.map((tab) => {
      const active = tab === this.tab;
      const label = active ? `[${COPY.tabs[tab]}]` : ` ${COPY.tabs[tab]} `;
      return active ? this.theme.fg("accent", label) : this.theme.fg("dim", label);
    }).join(" ");
    this.container.addChild(new Text(tabBar, 1, 0));
    this.container.addChild(new Text(this.theme.fg("dim", COPY.hint), 1, 0));

    const items = buildItems(this.tab, this.config).map((item) => ({
      value: item.id,
      label: this.compact ? `${item.label}: ${item.currentValue}` : item.label,
      description: this.compact ? undefined : item.currentValue,
    }));

    this.selectList = new SelectList(items, Math.min(items.length, 10), {
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
    if (matchesKey(data, Key.space) || data === " ") {
      const selected = this.selectList.getSelectedItem();
      if (selected) this.applySetting(selected.value, false);
    } else if (data === "\r" || data === "\n") {
      // Enter key: for footer segments, cycle zone; otherwise apply normally
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
}

/* ── Command registration ── */

export function registerSettingsCommand(
  pi: ExtensionAPI,
  hooks: {
    getConfig: () => PiTuiConfig;
    onConfigChanged: (config: PiTuiConfig) => void;
    onOverlayClosed?: () => void;
  },
): void {
  pi.registerCommand("pi-tui", {
    description: "Open the pi-tui settings UI, or use /pi-tui reload",
    handler: async (args, ctx: ExtensionContext) => {
      const subcommand = args?.trim() ?? "";

      if (subcommand === "reload") {
        hooks.onConfigChanged(loadConfig());
        ctx.ui.notify("TUI reloaded from config", "info");
        return;
      }

      if (subcommand !== "") {
        ctx.ui.notify(`Unknown /pi-tui subcommand: "${subcommand}". Available: settings, reload`, "warning");
        return;
      }

      if (!ctx.hasUI) return;

      await ctx.ui.custom<void>((tui: TUI, theme, _kb, done) => {
        const ui = new SettingsUi(
          theme,
          hooks.getConfig(),
          (config) => hooks.onConfigChanged(config),
          () => done(undefined),
        );
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
    },
  });
}
