import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pages = [
  ["home", "index.html"],
  ["compare", "compare/index.html"],
  ["demo", "demo/index.html"],
  ["examples", "examples/index.html"],
  ["how it works", "how-it-works/index.html"],
  ["privacy", "privacy/index.html"],
  ["terms", "terms/index.html"],
  ["trust", "trust/index.html"],
  ["AI comparison", "compare/ai/index.html"],
  ["news comparison", "compare/news/index.html"],
  ["newsletter comparison", "compare/newsletters/index.html"],
  ["podcast comparison", "compare/podcasts/index.html"],
] as const;

function html(relativePath: string) {
  return readFileSync(resolve(process.cwd(), "marketing_page", relativePath), "utf8");
}

describe("marketing page document contracts", () => {
  it.each(pages)("%s declares Hebrew right-to-left content", (_name, path) => {
    expect(html(path)).toMatch(/<html[^>]*lang="he"[^>]*dir="rtl"/i);
  });

  it.each(pages)("%s has a non-empty unique page title", (_name, path) => {
    const match = html(path).match(/<title>([^<]+)<\/title>/i);
    expect(match?.[1].trim().length).toBeGreaterThan(5);
  });

  it.each(pages)("%s declares charset and a responsive viewport", (_name, path) => {
    const page = html(path);
    expect(page).toMatch(/<meta[^>]*charset="utf-8"/i);
    expect(page).toMatch(/<meta[^>]*name="viewport"[^>]*width=device-width/i);
  });

  it.each(pages)("%s exposes a keyboard skip link to main content", (_name, path) => {
    const page = html(path);
    expect(page).toMatch(/class="skip-link"[^>]*href="#content"/i);
    expect(page).toMatch(/<main[^>]*id="content"/i);
  });

  it.each(pages)("%s links to both legal documents", (_name, path) => {
    const page = html(path);
    expect(page).toMatch(/href="[^"]*privacy(?:\/index\.html|\/?)"/i);
    expect(page).toMatch(/href="[^"]*terms(?:\/index\.html|\/?)"/i);
  });
});
