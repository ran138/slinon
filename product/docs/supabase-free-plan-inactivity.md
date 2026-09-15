# Supabase Free Plan inactivity and scheduled keepalive

**Checked:** 2026-09-16
**Scope:** Whether an inactive Supabase Free project loses its data, and whether a scheduled GitHub Actions request can prevent an automatic pause.

## Conclusion

Supabase does **not** say that a Free project is deleted after one inactive week. It says that Free projects with low activity over a seven-day period may be **paused**. A paused project can be restored from Supabase Studio for up to one year, with its data and configuration returned to their previous state. Paid projects are not automatically paused for inactivity. ([Supabase: Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Supabase pricing](https://supabase.com/pricing))

A scheduled keepalive can help because Supabase explicitly says that sufficient API or connected-application traffic can prevent a pending pause. However, Supabase measures **user database activity**, does not publish an exact threshold, and only says that a few user database requests per day are *typically* enough. Therefore, one empty HTTP request every 24 hours is not an official guarantee. ([Supabase: Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing))

## What should count as useful activity

The scheduled request should execute a real, successful, lightweight database query, such as a limited `SELECT`, and the workflow should fail on any non-success response. A request that returns `404`, only serves a static page, or never reaches Postgres should not be relied upon: the official policy refers specifically to user database activity and user queries. This distinction is an inference from Supabase's wording, not a separately documented threshold.

A prudent schedule is two or three lightweight requests per day rather than exactly one request every 24 hours. This aligns with Supabase's phrase “a few user requests to the database each day,” but it still cannot provide the same guarantee as a paid plan because Supabase does not specify a precise minimum. ([Supabase: Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing))

## GitHub Actions suitability and limitations

GitHub Actions supports scheduled workflows using POSIX cron syntax. Scheduled workflows run from the latest commit on the default branch, and the workflow file must exist on that branch. ([GitHub: Workflow syntax for scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule))

There are two reliability caveats:

- Scheduled jobs can be delayed during high load, and in sufficiently high load some queued jobs may be dropped. GitHub recommends avoiding the start of the hour. ([GitHub: Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule))
- In a **public** repository, GitHub automatically disables scheduled workflows after 60 days without repository activity. ([GitHub: Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule))

The workflow should also support manual execution (`workflow_dispatch`) so its connectivity can be tested and a disabled schedule can be noticed quickly.

## Credential handling

Prefer a Supabase publishable key for a minimal read that is permitted by Row Level Security. Supabase documents publishable keys as suitable for scripts and GitHub Actions. A secret/service-role key bypasses Row Level Security and must never be committed to source control. If elevated credentials are genuinely required, keep them in GitHub Actions secrets and expose them only to the workflow step that needs them. ([Supabase: API keys](https://supabase.com/docs/guides/getting-started/api-keys), [GitHub: Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets))

## Data-safety note

A keepalive is an availability workaround, not a backup. Free projects do not provide downloadable platform backups in the same way paid plans do, so important data should also be exported to an independent location on a regular schedule. ([Supabase: Database Backups](https://supabase.com/docs/guides/platform/backups))

## Recommended implementation decision

1. Run a lightweight, successful database `SELECT` two or three times per day at a non-round minute.
2. Make the job fail visibly when the HTTP status is not successful or the response does not prove the database query ran.
3. Keep credentials in GitHub Actions secrets; never hardcode a secret/service-role key.
4. Add manual execution and monitor failed runs.
5. Maintain an external backup independently of the keepalive.
6. Use a paid Supabase plan if “never pause for inactivity” must be guaranteed; Supabase identifies upgrading as the way to prevent automatic pausing altogether. ([Supabase: Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing))
