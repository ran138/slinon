import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export function readRepositoryFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

export function jsonRequest(
  path: string,
  body: unknown,
  init: { method?: string; origin?: string; host?: string } = {},
): Request {
  const host = init.host ?? "www.slinon.me";
  const headers = new Headers({ "content-type": "application/json", host });
  if (init.origin) headers.set("origin", init.origin);
  return new Request(`https://${host}${path}`, {
    method: init.method ?? "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}
