import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { HistoryPage } from "../components/history-page";
import { EpisodeDetail } from "../components/episode-detail";
import type { BriefView } from "../lib/domain";
import { readRepositoryFile } from "../../tests/helpers";

// Exercise event handlers and rerenders without a browser or new test dependencies.
// Effects are intentionally excluded; these tests cover component state/callbacks.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
    }];
  },
}));

type Element = ReactElement<Record<string, any>>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, any>>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function find(tree: ReactNode, predicate: (element: Element) => boolean): Element {
  const result = elements(tree).find(predicate);
  if (!result) throw new Error("Expected UI control was not rendered");
  return result;
}
function rowIds(tree: ReactNode) {
  return elements(tree).filter(e => e.props.className === "history-row").map(e => e.key);
}
function episode(id: string, date: string, topic: string): BriefView {
  return { id, title: `Podcast ${id}`, createdAt: date, audioUrl: "/podcast.wav",
    status: "completed", durationMs: 90000, sources: [],
    chapters: [{ id: `${id}-1`, title: "First chapter", reasonKind: "interest", reasonLabel: topic,
      startMs: 0, durationMs: 52000, script: "Actual transcript" },
    { id: `${id}-2`, title: "Second chapter", reasonKind: "general", reasonLabel: "",
      startMs: 52000, durationMs: 38000, script: "" }],
  } as BriefView;
}
const briefs = [episode("older", "2025-01-01T10:00:00Z", "SPY"), episode("newer", "2026-01-01T10:00:00Z", "AI")];
const callbacks = () => ({ onNav: vi.fn(), onPreferences: vi.fn(), onSignOut: vi.fn(), email: null, plan: "daily" as const });
beforeEach(() => { hooks.values = []; hooks.cursor = 0; });

describe("History favorites and episode controls", () => {
  function setup(input = briefs) {
    const props = { ...callbacks(), briefs: input, onOpen: vi.fn(), onPlay: vi.fn() };
    const render = () => { hooks.cursor = 0; return HistoryPage(props); };
    return { props, render };
  }
  const control = (tree: ReactNode, className: string) => find(tree, e => e.props.className === className);
  const library = (tree: ReactNode, favorite: boolean) => {
    const group = find(tree, e => e.props["aria-label"] === "סינון פרקים");
    return elements(group).filter(e => e.type === "button")[favorite ? 1 : 0];
  };
  it("defaults to all episodes, newest first, without mutating incoming data", () => {
    const { render } = setup();
    expect(rowIds(render())).toEqual(["newer", "older"]);
    expect(library(render(), false).props["aria-pressed"]).toBe(true);
    expect(briefs.map(b => b.id)).toEqual(["older", "newer"]);
  });
  it("toggles heart fill/state and explicitly filters favorites and all episodes", () => {
    const { render } = setup();
    expect(control(render(), "history-heart").props["aria-pressed"]).toBe(false);
    control(render(), "history-heart").props.onClick();
    const heart = control(render(), "history-heart");
    expect(heart.props["aria-pressed"]).toBe(true);
    expect(elements(heart).some(e => e.props.fill === "currentColor")).toBe(true);
    library(render(), true).props.onClick();
    expect(rowIds(render())).toEqual(["newer"]);
    expect(library(render(), true).props["aria-pressed"]).toBe(true);
    control(render(), "history-heart").props.onClick();
    expect(rowIds(render())).toEqual([]);
    expect(control(render(), "history-empty")).toBeTruthy();
    library(render(), false).props.onClick();
    expect(rowIds(render())).toEqual(["newer", "older"]);
  });
  it("combines topic/year filters, supports oldest first, and resets an empty filter", () => {
    const { render } = setup();
    find(render(), e => e.props["aria-label"] === "סדר הפרקים").props.onChange({ target: { value: "oldest" } });
    expect(rowIds(render())).toEqual(["older", "newer"]);
    find(render(), e => e.props.className === "history-tags" && e.type === "div").props.children[0].props.onClick();
    expect(rowIds(render())).toEqual(["older"]);
    find(render(), e => e.props["aria-label"] === "סינון לפי שנה").props.onChange({ target: { value: "2026" } });
    expect(rowIds(render())).toEqual([]);
    find(control(render(), "history-empty"), e => e.type === "button").props.onClick();
    expect(rowIds(render())).toEqual(["older", "newer"]);
  });
  it("routes playback and detail actions to the actual episode id; gates unavailable audio", () => {
    const { render, props } = setup();
    control(render(), "history-play").props.onClick();
    control(render(), "history-episode-title").props.onClick();
    expect(props.onPlay).toHaveBeenCalledWith("newer");
    expect(props.onOpen).toHaveBeenCalledWith("newer");
    for (const unavailable of [{ ...briefs[0], audioUrl: null }, { ...briefs[0], status: "processing" }]) {
      expect(control(setup([unavailable as BriefView]).render(), "history-play").props.disabled).toBe(true);
    }
  });
  it("keeps the three-dot menu share-only and omits empty-state microphone artwork", () => {
    const { render } = setup();
    control(render(), "history-dots").props.onClick();
    const menu = find(render(), e => e.props.role === "menu");
    const items = elements(menu).filter(e => e.props.role === "menuitem");
    expect(items).toHaveLength(1);
    expect(items[0].props.children).toContain("שיתוף");
    expect(elements(setup([]).render()).some(e => e.props.className === "history-empty" && elements(e).some(child => child.props.size))).toBe(false);
  });
});

describe("Episode playback detail", () => {
  function setup(activeChapter = 0, audioUrl: string | null = "/podcast.wav") {
    const props = { ...callbacks(), brief: { ...briefs[0], audioUrl }, children: "Existing audio player",
      activeChapter, onChapter: vi.fn(), onSources: vi.fn(), speed: 1, onSpeed: vi.fn() };
    return { props, tree: EpisodeDetail(props) };
  }
  it("offers all playback speeds and forwards numeric speed changes", () => {
    const { tree, props } = setup();
    const select = find(tree, e => e.props["aria-label"] === "מהירות ניגון");
    expect(elements(select).filter(e => e.type === "option").map(e => e.props.value)).toEqual([.5, 1, 1.25, 1.5, 2]);
    select.props.onChange({ target: { value: "0.5" } });
    expect(props.onSpeed).toHaveBeenCalledWith(.5);
  });
  it("shows chapter start timestamps, one-based numbering, and active state while paused", () => {
    const { tree, props } = setup(1);
    const chapters = find(tree, e => e.props["aria-label"] === "פרקים");
    expect(elements(chapters).filter(e => e.type === "time").map(e => e.props.children)).toEqual(["0:00", "0:52"]);
    expect(elements(chapters).filter(e => e.props.className === "episode-chapter-number").map(e => e.props.children)).toEqual([1, 2]);
    find(chapters, e => e.props["aria-current"] === "true").props.onClick();
    expect(props.onChapter).toHaveBeenCalledWith(1);
  });
  it("preserves navigation and disables chapter skipping at boundaries or without audio", () => {
    const { tree, props } = setup();
    find(tree, e => e.props.className === "episode-back").props.onClick();
    expect(props.onNav).toHaveBeenCalledWith("history");
    find(tree, e => e.type === "button" && e.props.onClick === props.onSources).props.onClick();
    expect(props.onSources).toHaveBeenCalledOnce();
    expect(find(tree, e => e.props["aria-label"] === "הפרק הקודם").props.disabled).toBe(true);
    find(tree, e => e.props["aria-label"] === "הפרק הבא").props.onClick();
    expect(props.onChapter).toHaveBeenCalledWith(1);
    expect(find(setup(1).tree, e => e.props["aria-label"] === "הפרק הבא").props.disabled).toBe(true);
    expect(find(setup(0, null).tree, e => e.props["aria-label"] === "הפרק הבא").props.disabled).toBe(true);
  });
});

describe("History hero and Sources integration contracts", () => {
  it("uses one continuous cover background and no separate microphone layers", () => {
    const styles = readRepositoryFile("product/app/globals.css");
    const block = styles.match(/\.history-hero-wave\s*\{([^}]+)\}/)?.[1];
    expect(block).toContain('url("/assets/history-hero-banner.png")');
    expect(block).toContain("background-size:cover");
    expect(block).toContain("background-position:center 42%");
    expect(styles).not.toMatch(/\.history-hero-wave::(?:before|after)/);
    expect(readRepositoryFile("product/components/episode-detail.tsx")).not.toContain("history-microphone");
  });
  it("keeps Sources in the shared sidebar shell, real chapter groups, and safe external links", () => {
    const app = readRepositoryFile("product/components/vestory-app.tsx");
    const sources = app.slice(app.indexOf("function SourcesScreen("), app.indexOf("function SourcesScreen(") + 4000);
    expect(sources).toContain("<AppSidebar");
    expect(sources).toContain('className="today-shell sources-shell"');
    expect(sources).toContain('onNav("player")');
    expect(sources).toContain("href={s.url}");
    expect(sources).toContain('rel="noopener noreferrer"');
    expect(sources).not.toContain("<TopBar");
    expect(sources).not.toMatch(/זמני|דוגמה|לא נשמר/);
  });
});
