const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function assertLocalUrl(name, value) {
  if (!value) throw new Error(`Missing ${name}`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Refusing non-local ${name}: ${url.hostname}`);
  }
  return url;
}

/** @param {Record<string, string | undefined>} environment */
export function assertLocalServiceEnvironment(environment = process.env) {
  const values = [
    ["SUPABASE_URL", environment.SUPABASE_URL],
    ["NEXT_PUBLIC_SUPABASE_URL", environment.NEXT_PUBLIC_SUPABASE_URL],
    ["POSTGRES_URL", environment.POSTGRES_URL],
    ["POSTGRES_URL_NON_POOLING", environment.POSTGRES_URL_NON_POOLING],
  ].filter(([, value]) => Boolean(value));

  if (!values.length) throw new Error("No local service URLs are configured");
  for (const [name, value] of values) assertLocalUrl(name, value);
}
