# Finance Podcast Ingestion Research

**Date checked:** 2026-09-16  
**Scope:** Daily ingestion for a public, commercial, AI-generated finance podcast. Sources requested: Calcalist, Ynet, Globes, TheMarker, Reuters, CNBC, Yahoo Finance, and SEC EDGAR. Target stack: Python and/or TypeScript, Supabase/PostgreSQL/pgvector, and OpenAI embeddings.

## Executive recommendation

There is no free scraper that makes commercial reuse of these publishers' full articles lawful. Open-source software can fetch and extract pages, but it does not grant content rights. For this product, use two distinct lanes:

1. **Open/public-data lane:** ingest SEC EDGAR filings and XBRL directly from the SEC. This can be built entirely with free/open-source software and is the safest foundation for financial facts.
2. **Licensed-news lane:** use publisher-approved feeds/APIs or written licenses for full article text. Until permission exists, use publishers' official RSS/sitemaps only as discovery signals where their terms allow it, store the minimum permitted metadata, and do not fetch or embed full text.

For the existing Vestory codebase, the strongest MVP is a **TypeScript ingestion worker** that reuses its existing OpenAI, Supabase, PostgreSQL, and Zod dependencies. Use native `fetch` for SEC JSON/filing HTML, an RSS parser for approved feeds, and Mozilla Readability for licensed HTML. Add **Playwright only as an authorized fallback** for JavaScript-rendered pages. Introduce a small Python/Arelle sidecar only when taxonomy-aware XBRL processing or difficult PDF/OCR extraction is genuinely needed. Run ingestion in a scheduled container or VM; use Supabase for state, queues, documents, facts, and vectors. Do not run a large crawl inside an Edge Function because hosted Edge Functions have strict CPU, memory, and wall-clock limits ([Supabase limits](https://supabase.com/docs/guides/functions/limits)).

For the named news publishers, the recommended launch position is **license first, scrape second**. For SEC EDGAR, proceed now.

## Source-by-source decision

| Source | Discovery | Full-text / reports | Commercial recommendation |
|---|---|---|---|
| Calcalist | A licensed feed, or a publisher-approved feed after written confirmation | The published terms prohibit automated crawlers, creation of collections/databases, copying, summarizing, derivative works, AI-related uses, and non-personal use without prior written consent | **Do not scrape. Obtain written permission/license.** The restriction is unusually explicit for this proposed AI podcast ([Calcalist terms](https://z.calcalist.co.il/mvc/long/2018/OrganizationalStructure/About/Terms.html)). |
| Ynet | Licensed feed or approved RSS/sitemap use only | Current terms prohibit crawler/robot collection and automated access/processing, including AI-platform access without a detailed written agreement. Ynet's own RSS terms describe the feeds as private, non-commercial use and prohibit modification | **Do not scrape. Obtain written permission/license.** RSS can identify candidates for editorial review, but it does not authorize this commercial AI workflow ([current Ynet terms](https://www.ynet.co.il/article/bkswwa3sn), [Ynet RSS terms](https://www.ynet.co.il/articles/0,7340,L-3124381,00.html), [Ynet robots](https://www.ynet.co.il/robots.txt)). |
| Globes | Licensed feed/API or written approval | Terms say use is personal/private only and prohibit crawlers/robots used to scan, copy, retrieve, or create a collection/database | **Do not scrape. Obtain written permission/license.** ([Globes terms](https://www.globes.co.il/news/article.aspx?did=1000252043), [Globes robots](https://www.globes.co.il/robots.txt)). |
| TheMarker | Official tag/author RSS can be a discovery mechanism; its robots file specifically allows those RSS patterns | Its official policy restricts use to personal/private use and prohibits external storage, commercial use, collections/summaries/news databases, automated extraction, AI/machine-learning use, and paywall circumvention | **Use approved RSS for discovery only; license full text. Never bypass the paywall.** ([TheMarker robots](https://www.themarker.com/robots.txt), [TheMarker site policy](https://www.themarker.com/misc/site-policy)). |
| Reuters | Reuters Connect/API under contract | Reuters' robots notice says automated collection is prohibited without prior written consent and only for the purposes in that consent. Reuters Connect terms also restrict scraping and unlicensed commercial/derivative use | **Do not scrape Reuters.com. License Reuters Connect/API.** Reuters markets its API and topical/regional feeds as subscription products ([Reuters robots](https://www.reuters.com/robots.txt), [Reuters Connect](https://reutersagency.com/content-delivery-platforms/reuters-connect/), [Reuters Connect terms](https://cdn1.agency.thomsonreuters.com/static/Reuters-Connect-Platform-Terms-and-Conditions.pdf), [license Reuters content](https://reutersagency.com/license-reuters-content/)). |
| CNBC | Official CNBC RSS feeds can identify new stories and provide links | NBCUniversal's terms grant personal use, and its prohibited-actions policy forbids manual or automated scraping/data mining and use of content to train, develop, or improve AI systems. CNBC robots rules also block Scrapy and many automated/AI agents | **Use official RSS only within its applicable terms; obtain NBCUniversal/CNBC permission for full text and podcast reuse.** Do not crawl article pages when the crawler is disallowed ([CNBC RSS](https://www.cnbc.com/rss-feeds/), [CNBC robots](https://www.cnbc.com/robots.txt), [NBCUniversal terms](https://www.nbcuniversal.com/terms), [prohibited actions](https://www.nbcuniversal.com/terms/prohibited-actions)). |
| Yahoo Finance | Official Yahoo pages/RSS may be used only as permitted discovery; many stories and market data come from third-party providers | Yahoo Finance explicitly says not to redistribute displayed/provided information; its robots file blocks Scrapy and many automated agents. There is no suitable, official, free Yahoo Finance API license for this commercial redistribution use | **Do not build on `yfinance` or scraped Yahoo endpoints for production.** License market/news data or go to the original issuer/SEC and original publisher ([Yahoo Finance provider notice](https://help.yahoo.com/kb/SLN2310.html), [Yahoo Finance robots](https://finance.yahoo.com/robots.txt), [Yahoo terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)). |
| SEC EDGAR | Submissions API, daily indexes, company tickers file, and filing metadata | Filing HTML, Inline XBRL, XBRL facts, exhibits, and attached PDFs | **Use directly.** The APIs are free, require no API key, and are updated throughout the day. SEC says government-created content and EDGAR public filing content are free to access and reuse. Declare the bot identity and remain at or below 10 requests/second ([EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [accessing EDGAR](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data), [SEC webmaster FAQ](https://www.sec.gov/about/webmaster-frequently-asked-questions)). |

### Important interpretation

`robots.txt` is an automated-access signal, not a copyright license. Conversely, a path not disallowed by `robots.txt` does not grant commercial copying rights. Both the robots rules and contractual/content rights must permit the planned use.

## 50 ILS budget options (checked 2026-09-16)

### Budget boundary and verdict

Using the Bank of Israel representative rates published for 2026-09-15 (USD 3.0490 and EUR 3.5169), and conservatively allowing for Israel's 18% VAT, a 50 ILS all-in ceiling is about **USD 13.90 before card/FX spread** ([Bank of Israel rates](https://www.boi.org.il/en), [Israel Tax Authority VAT information](https://www.gov.il/ar/pages/vat-rate-amount-new)). A card issuer's conversion margin makes the safe service-price ceiling slightly lower. The calculations below assume VAT is charged; the actual tax treatment depends on the supplier and the customer's registration/status.

**No product checked provides the requested combination—daily full text from the named publishers, production/commercial use, and downstream AI/podcast rights—within 50 ILS/month.** There are inexpensive tools that can technically retrieve pages, but buying retrieval does not buy copyright, database, AI-processing, or audio-publication rights. The named publishers' restrictions in the source table above still apply.

Within this budget, the workable commercial architecture is therefore:

1. Use SEC EDGAR, issuer investor-relations releases, regulator releases, and other sources whose reuse rights cover the intended product.
2. Use publisher-approved RSS or a news API only to discover links/metadata, subject to its license.
3. Use a scraping service only for a source for which written permission or a license has already been recorded in `source_rights_policies`.
4. Do not use an "unlocker," residential proxy, browser, or CAPTCHA service to bypass a paywall, robots rule, login, or publisher restriction.

### Scraping/extraction services

| Service | Lowest current offer | What the budget buys | Budget fit | Important minimums and limitations |
|---|---:|---:|---|---|
| **Bright Data Article Scraper / Web Unlocker** | Article Scraper free tier: **5,000 records/month**. Article Scraper and Web Unlocker PAYG: **$1.50/1,000** successful records/requests, no monthly commitment | At the conservative $13.90 ceiling: about **9,266 successful records/requests** on PAYG; alternatively 5,000/month on the recurring free tier | **Yes, technically; first choice for a pilot** | The Article Scraper accepts article URLs and returns structured article data. Pricing says failed deliveries are not charged and a monthly spend limit can be set. Bright Data's general FAQ says PAYG funding can start at **$10**, which remains under this budget, and confirms that the 5,000-unit free tiers renew monthly. Bright Data requires use-case/KYC review and prohibits violations of law or third-party rights. It does not license publisher text. Use only for an already-authorized target ([Article Scraper](https://brightdata.com/products/web-scraper/article-scraper), [Web Unlocker pricing](https://brightdata.com/pricing/web-unlocker), [free-tier/PAYG FAQ](https://docs.brightdata.com/general/faqs), [KYC](https://brightdata.com/trustcenter/kyc), [license/AUP](https://brightdata.com/license)). |
| **Zyte API** | Standard PAYG with **no monthly commitment**; initial **$5 credit applies only to the first billing month** | At $13.90: HTTP responses range from about **10,945/month** at the $1.27 advanced tier to **106,923/month** at the $0.13 simple tier; browser responses range from about **864/month** at $16.08/1,000 to **13,762/month** at $1.01/1,000 | **Yes, technically** | The domain/request tier is assigned automatically, so the real number cannot be promised before testing the exact domains. Extra actions, extraction, screenshots, bandwidth, and custom attributes cost more. The default PAYG plan has a $100 account spending ceiling, but the documentation allows an owner to create a lower blocking spending limit; set it below USD 13.90. CDP browser access additionally needs a paid/PAYG account and business verification. This is access infrastructure, not publisher rights ([pricing](https://www.zyte.com/pricing/), [detailed billing and limits](https://docs.zyte.com/zyte-api/pricing.html), [CDP requirements](https://docs.zyte.com/zyte-api/usage/cdp.html)). |
| **Apify** | Free: **$5 recurring monthly usage**; Starter: **$39/month** plus overage | Free credit equals up to **12.5 compute-unit hours** at $0.40/CU if spent only on compute; the official Website Content Crawler estimate is roughly 1,000 raw-HTTP pages per $0.20 or 1,000 browser pages per $0.50–$5, but actual usage, proxies, storage, transfer, and Actor event fees vary | **Free tier only** | The first paid tier is about 140 ILS with VAT at the checked FX rate. Free usage stops when its credit is exhausted; unused credit does not roll over. Store Actors may have their own pay-per-event prices, so $5 is not a guaranteed page quota. No publisher-content license is included ([pricing](https://apify.com/pricing), [Website Content Crawler costs](https://apify.com/apify/website-content-crawler), [terms](https://docs.apify.com/legal/general-terms-and-conditions)). |
| **Firecrawl** | Free: **1,000 credits/month**; Hobby: **$19 monthly**, or **$16/month billed annually** | Free tier: up to 1,000 basic page scrapes/month (about 33/day). Hobby: 5,000 basic pages/month | **Free tier only; paid plan exceeds cap** | Hobby is about 68 ILS/month with VAT; even the annual equivalent is about 58 ILS/month and requires annual billing. Basic scrape/crawl/map costs one credit per page, while advanced formats/features cost more. PAYG top-ups are available only on a paid plan, in $5 increments, and Hobby credits do not roll over. Firecrawl's terms require lawful use and do not grant rights in third-party content ([pricing and credit rules](https://www.firecrawl.dev/pricing), [terms](https://www.firecrawl.dev/terms-of-service)). |
| **ScrapingBee** | One-time trial: **1,000 credits**; Hobby: **$19/month**, prices excluding VAT, for 75,000 credits | Trial only under the cap. A request costs 1 credit without JS, 5 with JS, 10/25 with premium proxy, or 75 with stealth proxy; therefore 75,000 plan credits represent 1,000–75,000 successful page calls depending on mode | **No recurring paid fit** | Hobby is about 68 ILS/month with VAT. The terms place responsibility on the user to check and comply with target-site terms and prohibit using the service to breach third-party terms or IP rights ([pricing](https://www.scrapingbee.com/pricing/), [credit costs](https://www.scrapingbee.com/documentation/), [terms](https://www.scrapingbee.com/terms-and-conditions/)). |
| **Browserless** | Free: **1,000 units/month**; Prototyping: **$25/month billed annually** for 20,000 units | Free tier is at most 1,000 browser connections of up to 30 seconds each if no proxy traffic/CAPTCHA units are consumed; it allows two concurrent browsers and a two-minute maximum session | **Free tier only** | Every started 30-second block costs a unit; residential proxy traffic costs 6 units/MB, datacenter proxy traffic 2 units/MB, and a solved CAPTCHA 10 units. The paid tier is about 90 ILS/month with VAT and annual billing. Browser infrastructure does not confer third-party content rights ([pricing](https://www.browserless.io/pricing), [unit accounting](https://docs.browserless.io/overview/unit-consumption), [terms](https://www.browserless.io/terms-of-service)). |

The two genuinely usage-based choices under 50 ILS are therefore **Bright Data PAYG** and **Zyte API PAYG**. Bright Data is easier to budget by successful request; Zyte can be much cheaper for simple HTTP pages but its domain tier is variable. Neither should be aimed at Calcalist, Ynet, Globes, TheMarker, Reuters, CNBC, or Yahoo Finance until the corresponding commercial full-text/AI/audio rights are in place.

### News-discovery APIs

None of the news APIs checked offers a clearly licensed, production-ready full-article feed for the requested commercial podcast within the budget:

- **NewsAPI:** free use is development/testing only, limited to 100 requests/day with a 24-hour delay. Production/commercial use begins at **$449/month**, and the API explicitly says it does not provide full article content ([pricing and FAQ](https://newsapi.org/pricing)).
- **GNews API:** free is development/testing only. The commercial Essential plan is **EUR 49.99/month** (EUR 39.99/month only with annual billing) and advertises full content, but its terms still require respect for third-party copyrights; it is well above the cap ([pricing](https://gnews.io/), [terms](https://gnews.io/legal/terms-of-service)).
- **Mediastack:** the free plan is non-commercial and limited to 100 calls/month. Commercial use begins at **$24.99/month** ($22.99 annual equivalent), above the cap; its terms also prohibit public/newsletter/radio/television/internet distribution and derivative exploitation except as expressly licensed, so the advertised "Commercial Use" label is not by itself a podcast republication license ([pricing](https://mediastack.com/pricing), [terms](https://mediastack.com/terms)).
- **Marketaux:** free gives 100 requests/day and three results/request; Basic is **$29/month**. It supplies only short snippets and links, not full articles. Its public terms do not clearly grant this commercial podcast use, so treat it as discovery-only unless Marketaux confirms the exact use in writing ([pricing](https://www.marketaux.com/pricing), [FAQ](https://www.marketaux.com/faq), [terms](https://www.marketaux.com/tos)).
- **The News API:** free gives 100 requests/day and three results/request; Basic is **$19/month** ($16 annual equivalent), both above the all-in cap once VAT is allowed for. Its FAQ says it provides only a short snippet and link, not full article content; the public terms do not clearly authorize the proposed commercial derivative use ([pricing](https://www.thenewsapi.com/pricing), [FAQ](https://www.thenewsapi.com/faq), [terms](https://www.thenewsapi.com/tos)).

### Recommended spend at this stage

Spend **0 ILS on scraping news pages** until rights are resolved. Build the daily SEC EDGAR and primary-source lane with direct HTTP/RSS, and use a free news-discovery allowance only for evaluation—not production unless its terms explicitly allow the commercial use. If an authorized source later proves difficult to retrieve, start with Bright Data's free 5,000-request tier; move to its $1.50/1,000 PAYG tier with a hard USD 12–13 cap to leave room for VAT/FX movement. Zyte PAYG is the alternative when per-domain tests show a better success/cost ratio.

## The 12 tools in ScraperAPI's comparison (re-checked 2026-09-16)

The [ScraperAPI comparison article](https://www.scraperapi.com/web-scraping/tools/free/) is a useful directory, but it is vendor-authored and several figures in its table no longer match the vendors' current pages. The comparison below uses each product's own current documentation and pricing. “Maintenance” means the work still left to this project: finding URLs, defining fields/selectors, repairing extraction when a publisher changes its site, scheduling, validating output, and operating the pipeline.

| Rank | Tool | Type and current price | Capabilities | Fit and maintenance |
|---:|---|---|---|---|
| **1** | **Diffbot** | Managed extraction API/dashboard. Recurring free plan: **10,000 credits/month**; ordinary Extract costs 1 credit/page or 2 through its datacenter proxy. Paid Startup is **$299/month**. | Its purpose-built Article API fetches/renders and returns clean article text, normalized HTML, title, author, date, images, tags and language as JSON without per-site rules. The free plan includes Extract, but not Crawl/Bulk, so this project must discover and queue URLs itself. | **Best technical pilot fit and low extraction maintenance.** The allowance is about 10,000 ordinary or 5,000 proxied pages/month, but the paid cliff is far above budget. Test Hebrew fields and body completeness on every target. ([Article API](https://www.diffbot.com/docs/extract/article), [Extract and credits](https://www.diffbot.com/docs/extract/), [pricing](https://www.diffbot.com/pricing), [free plan](https://blog.diffbot.com/announcing-the-diffbot-free-plan/)) |
| **2** | **Bright Data Article Scraper** | Managed article extractor via API or dashboard. **5,000 successfully delivered records/month free**; PAYG **$1.50/1,000** successful records. | Structured JSON/NDJSON/CSV; browser/JS rendering, residential proxies, CAPTCHA handling, retries and rotation; API, webhook/cloud delivery and bulk input up to 5,000 URLs. It expects article URLs; the caller supplies the daily discovery/schedule. | **Best paid path under ₪50 and low maintenance.** Unlike a generic proxy API, it normalizes article fields. Its free quota is smaller than Diffbot's, but paid continuation is dramatically cheaper. ([Article Scraper](https://brightdata.com/products/web-scraper/article-scraper), [pricing](https://brightdata.com/pricing/web-scraper)) |
| **3** | **Scrapy** | Free, BSD-licensed, code-first Python crawling framework; hosting/proxies are separate. | Async requests, queues, retries, throttling, CSS/XPath selectors and item pipelines. It supplies no browser or proxy pool; JS rendering, proxies, monitoring and scheduling require extensions/services and project code. | **Best for SEC EDGAR, RSS, investor-relations and stable public sources.** It offers maximum control but the highest labor cost for eight publishers: one parser/spider per site plus ongoing repairs. ([official site](https://www.scrapy.org/), [repository](https://github.com/scrapy/scrapy)) |
| **4** | **Decodo Web Scraping API** | Managed API/dashboard. Free: **2,000 standard**, **1,000 standard+JS**, **1,000 premium**, or **667 premium+JS** requests; paid starts at **$19/month**, above the all-in cap. | Proxy rotation, rendering, anti-bot/retries and geotargeting; HTML, JSON, CSV, XHR, PNG or LLM-ready Markdown; synchronous/asynchronous calls and 100+ maintained target templates. | **Good free benchmark, especially for Markdown, but not a confirmed general-news Article API.** Arbitrary publisher pages may still need metadata/body normalization. ([product/pricing](https://decodo.com/scraping/web), [documentation](https://help.decodo.com/docs/web-scraping-api-introduction)) |
| **5** | **ScraperAPI** | Managed fetching/unblocking API plus DataPipeline. Free: **1,000 credits/month** and five concurrent connections; first seven days get 5,000 credits. Paid starts at **$49/month**. | Proxies, retries, anti-bot/CAPTCHA handling, async API and JS rendering. JS/harder modes consume 10–75 credits/page. DataPipeline provides schedules/webhooks. General publisher URLs return mainly HTML; structured endpoints target selected sites, not arbitrary news. | **Useful transport layer, weak article solution.** The project still owns title/date/author/body parsing. The free tier may cover only about 100 rendered pages/month. ([pricing](https://www.scraperapi.com/pricing/), [JS costs](https://docs.scraperapi.com/making-requests/customizing-requests/rendering-javascript), [structured endpoints](https://docs.scraperapi.com/structured-data-endpoints/overview), [DataPipeline](https://docs.scraperapi.com/datapipeline/datapipeline-endpoints/how-to-use)) |
| **6** | **Bardeen AI** | Chrome/no-code scraper and workflow platform, mainly for sales/GTM. **100 free credits**; Basic is **$10/month plus 100 credits** and Premium $50/month plus 1,000 credits; a scraped row costs 1 credit. | Visual/AI scraper models, deep/background scraping, browser actions, integrations and scheduled workflows. It is not a drop-in article API like Diffbot or Bright Data. | **Price can fit; architecture fits poorly.** Eight changing news sites require visual models and the backend/Supabase handoff is less natural than a server API. Good for a tiny demo, not the ingestion core. ([pricing](https://www.bardeen.ai/pricing), [scraper/background automation](https://www.bardeen.ai/release-notes)) |
| **7** | **Browse AI** | No-code cloud robots trained by recording browser actions. Free: **50 credits/month on two websites**; Personal is **$48 monthly** or **$19/month annually**. | Browser execution, residential proxies, supported CAPTCHA handling, deep scraping, monitors, REST API/SDKs, webhooks and JSON/CSV. Standard credit: up to ten rows; protected sites can cost 2–10 credits/task. | **Easy prototype, but the two-domain cap excludes the eight-source plan.** Recorded robots/selectors need retraining when layouts change. ([pricing](https://www.browse.ai/pricing), [API capabilities](https://www.browse.ai/website-to-api), [credits](https://help.browse.ai/en/articles/10440592-how-are-credits-calculated)) |
| **8** | **ScrapingBee** | Developer scraping API. One-time **1,000-credit trial**; Hobby is **$19/month** for 75,000 credits, excluding VAT. | Managed Chrome, classic/premium/stealth proxies, browser actions, custom JS and optional AI extraction. Basic request costs 1 credit, JS 5, premium+JS 25, stealth 75, and AI extraction adds 5. Scheduling is project-owned. | **Strong generic API, but no recurring free production allowance and no general-news Article API.** Parsing, validation and scheduling stay in the codebase. ([pricing](https://www.scrapingbee.com/pricing/), [API/credit costs](https://www.scrapingbee.com/documentation/)) |
| **9** | **ParseHub** | Visual no-code desktop/cloud scraper. Free: **200 pages/run**, five **public** projects and 14-day retention; Standard is **$189/month**. | Handles JS/AJAX, pagination, scrolling/forms/login; REST API/webhooks and CSV/JSON. Scheduling and IP rotation are paid-only. | **Experiment only.** Eight sources exceed the five-project cap, public projects/data are a poor commercial fit, and per-site selectors need maintenance. ([pricing](https://www.parsehub.com/pricing), [API](https://www.parsehub.com/docs/ref/api/v2/)) |
| **10** | **Webscraper.io** | Free point-and-click browser extension plus cloud service. Extension is free locally; cloud Project is **$50/month billed annually**, with 5,000 URL credits and a seven-day trial. | Local mode handles JS/navigation and exports CSV/XLSX, but lacks unattended scheduling, API, cloud proxies and webhooks. Cloud adds those capabilities and JSON/cloud exports. | **Good one-off visual test, poor daily backend.** Local mode needs an open browser; cloud is far above budget; each visual sitemap needs layout-change repairs. ([extension](https://webscraper.io/web-scraper-extension), [pricing](https://webscraper.io/pricing), [scheduler](https://webscraper.io/documentation/web-scraper-cloud/scheduler)) |
| **11** | **ScrapeStorm** | Desktop no-code visual/AI-assisted scraper. Free: ten tasks and **100 exported rows/day**; Professional **$45/month**; scheduling starts at Premium **$89/month**; REST API/webhooks require Business **$179/month**. | Dynamic pages, pagination/login, cleanup/deduplication and direct PostgreSQL/MySQL export. Proxy rotation is paid and proxies are separate. | **Not suitable for this server pipeline.** The free tier is local/manual and limited; the daily scheduling/API features cost many times the budget. ([pricing/features](https://api.scrapestorm.com/?type=pricing), [scheduling](https://www.scrapestorm.com/tutorial/what-is-scheduled-job-in-flowchart-mode/)) |
| **12** | **Databar.ai** | No-code spreadsheet-style API/enrichment/orchestration platform. **100 one-time trial credits**; Build is **$99/month** for 5,000 credits. | 150+ connectors/scrapers, AI research/extraction, tables/formulas, schedules, integrations, webhooks and REST API/CLI. | **Wrong price and focus.** It adds an extra table layer before Supabase and is aimed at sales/RevOps rather than full-news article ingestion. ([pricing](https://databar.ai/pricing), [overview](https://docs.databar.ai/product-guide/what-is-databar), [API/CLI](https://databar.ai/product/api-cli)) |

### Ranked shortlist and decision

1. **Run a Diffbot-vs-Bright Data bake-off.** Diffbot is the best free technical match because Article API is built specifically for news and supplies 10,000 monthly credits. Bright Data is the best budget-safe production path because its article parser is also managed and its PAYG continuation stays below ₪50.
2. **Keep Scrapy for primary/structured sources.** SEC EDGAR, RSS, issuer sites and stable regulatory sources do not need an expensive browser/unblocking layer.
3. **Use Decodo as a third benchmark**, particularly to see whether its Markdown output preserves Hebrew articles well enough. It is an access layer, not necessarily a complete article normalizer.
4. **Do not choose a visual/no-code tool as the core backend.** Bardeen, Browse AI, ParseHub, Webscraper.io and ScrapeStorm can demonstrate a small scrape quickly, but their limits, selector maintenance, scheduling tiers and backend integration are poor matches for eight daily sources.
5. **Do not pay for ScraperAPI or ScrapingBee unless a test proves a unique access advantage.** Their paid floors exceed the budget and the project still owns article extraction rules.

Before committing, test the same 20–30 representative URLs in Diffbot, Bright Data and Decodo: Hebrew and English; static and JavaScript-heavy; short and multi-page; at least one URL from every publisher; plus several SEC/IR documents. Score retrieval success, body completeness, title/author/date accuracy, boilerplate, Hebrew encoding, duplicates, latency and cost. Choose from measured output, not advertised success rate.

These rankings cover technical acquisition only. None of the twelve products grants a license to store, send to OpenAI, transform or publish third-party news text; source rights remain separate from scraper choice.

## Recommended free/open-source toolchain

### Fit with the existing TypeScript/Supabase application

The current product already uses Node 22, TypeScript, `openai`, `@supabase/supabase-js`, `postgres`, and Zod. Do not place crawling inside a Next.js request handler. Add a separate idempotent worker/command in the same repository so deployments and schemas stay shared while failures and runtime limits stay isolated from the web app.

Recommended TypeScript MVP components:

- Native Node `fetch` for the SEC APIs and authorized static HTML.
- An RSS/Atom parser for publisher-approved discovery feeds.
- **Mozilla Readability (Apache-2.0)** plus a DOM implementation for licensed article HTML. Readability returns the main article content and metadata, but its own documentation warns that output should be sanitized before display ([repository](https://github.com/mozilla/readability)).
- The existing Zod dependency to validate every external response before database writes.
- The existing PostgreSQL/Supabase clients for idempotent upserts and the existing OpenAI client for embeddings.
- Playwright only for an explicitly licensed source that cannot provide a feed/API/static document.

This TypeScript path is enough for the first milestone: watchlist, SEC submissions, Company Facts, filing HTML, chunking, embeddings, and provenance. A separate Python worker is justified later for Arelle and complex financial-document extraction; it should not become a prerequisite for the SEC JSON MVP.

### Core ingestion

- **Scrapy (BSD-3-Clause):** orchestration, queues, retries, request throttling, per-domain concurrency, pipelines, and crawl statistics. Its AutoThrottle feature adapts request delay to server latency while respecting configured concurrency/delay limits ([repository](https://github.com/scrapy/scrapy), [AutoThrottle documentation](https://docs.scrapy.org/en/latest/topics/autothrottle.html)). Use it only for sources where automated access is authorized.
- **feedparser (BSD):** parse RSS/Atom discovery feeds and preserve GUID, publication time, link, ETag, and Last-Modified metadata ([repository](https://github.com/kurtmckee/feedparser)).
- **Trafilatura (Apache-2.0 in current releases):** remove navigation/boilerplate and extract article text and metadata from authorized HTML ([repository and license](https://github.com/adbar/trafilatura), [documentation](https://trafilatura.readthedocs.io/)).
- **Playwright (Apache-2.0):** render JavaScript only when an authorized page has no stable static/API representation ([repository](https://github.com/microsoft/playwright), [documentation](https://playwright.dev/docs/intro)). It is slower and more fragile than HTTP/RSS/API ingestion, so it should be an exception rather than the default.

### Financial reports

- Prefer **SEC JSON + HTML/iXBRL** over PDF. The SEC Company Facts API already normalizes common US-GAAP/IFRS facts, and filing HTML preserves narrative notes and tables ([SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)).
- SEC covers US filings, including many foreign issuers, but it does not cover every company listed only in Israel. For those companies, add a separate authorized connector for the official TASE **MAYA** disclosure system; TASE describes MAYA as the system that publishes listed-company announcements and financial reports ([TASE MAYA reports](https://market.tase.co.il/he/market_data/index/147/reports_maya)). Confirm automation and reuse terms with TASE before building that connector; do not substitute scraped newspaper coverage for the filed report.
- Use **Arelle (Apache-2.0)** where taxonomy-aware XBRL/iXBRL validation or extraction is required. It supports XBRL 2.1, Dimensions, Inline XBRL, SEC validation, CLI, Python API, and a web service ([Arelle repository](https://github.com/Arelle/Arelle)).
- For an authorized PDF that has no structured alternative, use **pypdf (BSD-3-Clause)** for text/metadata and **pdfplumber (MIT)** for layout/table-oriented extraction ([pypdf](https://github.com/py-pdf/pypdf), [pdfplumber](https://github.com/jsvine/pdfplumber)). Use OCR only for image-only pages, record that OCR was used, and retain page references and confidence/quality flags.

### Free software versus paid services

The libraries above are free/open source. The following are not free parts of the proposed system:

- Publisher licenses, Reuters Connect/API, or another licensed news/data vendor.
- OpenAI embeddings. `text-embedding-3-small` is usage-priced; the official model page currently lists **$0.02 per million input tokens** and `text-embedding-3-large` **$0.13 per million input tokens** ([OpenAI embedding model pricing](https://developers.openai.com/api/docs/models/text-embedding-3-large)). Re-check pricing before budgeting.
- Hosted compute, storage, database egress, backups, and monitoring beyond free-tier allowances.
- Managed scraping services such as Apify, Zyte API, Bright Data, Diffbot, or managed Firecrawl. They may reduce maintenance but do not grant rights to publisher content.

## Proposed daily architecture

### 1. Watchlist and discovery

Maintain an `entities` table with canonical company name, ticker(s), exchange, SEC CIK, optional TASE security/company identifier, Hebrew and English aliases, subsidiaries, executives, and ambiguous-name exclusions. Maintain a separate `topics` table with phrases and query rules.

Run discovery once per day (or more often if later required):

- SEC submissions by watched CIK; include at least 10-K, 10-Q, 8-K, 20-F, 40-F, and 6-K.
- Licensed publisher feeds/APIs.
- Official RSS only when its terms permit this use.

Match candidates in two stages: a cheap alias/title/summary filter, followed by entity classification that requires context for ambiguous names. Keep the reason and confidence for every match.

### 2. Rights gate before fetching

Give every source a machine-readable policy such as:

- `metadata_only`
- `licensed_full_text`
- `public_reuse`
- `blocked`

The fetcher must refuse full-text retrieval unless the source is `licensed_full_text` or `public_reuse`. Store the agreement name, permitted purposes, start/end dates, attribution requirements, retention limits, and whether sending the content to an external AI API is permitted. This prevents a future code change from silently turning discovery into unauthorized copying.

### 3. Fetch, extract, and preserve provenance

For authorized resources:

- Send an identifiable User-Agent and contact address; apply per-domain concurrency and delays.
- Enable Scrapy's `ROBOTSTXT_OBEY` for authorized web sources. Treat a robots disallow as a hard stop, not as a technical obstacle.
- Honor ETag and Last-Modified conditional requests.
- Never bypass authentication, paywalls, CAPTCHAs, anti-bot systems, or access controls.
- Store canonical URL, source stable ID/GUID, author, timestamps, language, retrieval timestamp, HTTP status, content type, license/policy ID, and extraction version.
- Store the raw response privately only when the license permits it; store a content hash even when raw retention is not allowed.
- For reports, retain accession number, CIK, form, period, filing date, document URL, XBRL concept/taxonomy/unit/context, and page/section references.

For SEC, use `data.sec.gov/submissions/CIK##########.json` for filing discovery and `data.sec.gov/api/xbrl/companyfacts/CIK##########.json` for structured facts. For large backfills, use the SEC nightly bulk ZIPs rather than issuing many small requests. The SEC documents these endpoints and update schedules on its [API page](https://www.sec.gov/search-filings/edgar-application-programming-interfaces).

### 4. Deduplicate and version

Use several independent keys:

1. Unique `(source_id, source_document_id)`; SEC uses accession number.
2. Unique normalized canonical URL where stable.
3. SHA-256 of normalized main text for exact copies.
4. A near-duplicate check based on normalized headline, publication window, named entities, and similarity. Do not use vector similarity alone to delete records; it can merge distinct updates to the same story.

When a source changes an article, create a new `document_version` rather than overwriting the old one. Re-embed only changed chunks.

### 5. Chunking and embeddings

Keep source documents separate from chunks. A useful starting point is 500–900 tokens per chunk with modest overlap, split on headings and paragraphs. Financial tables, accounting facts, and footnotes should become typed records/chunks with period, unit, and taxonomy context rather than flattened prose.

Recommended tables:

- `sources`, `source_rights_policies`
- `entities`, `entity_aliases`, `topics`
- `documents`, `document_versions`, `document_entities`
- `chunks` with `embedding vector(...)`
- `financial_facts`
- `ingestion_runs`, `ingestion_errors`

Add unique constraints before using upserts. Keep `embedding_model`, dimensions, chunker version, and input hash so a model migration is repeatable. pgvector is the PostgreSQL extension used by Supabase for vector storage and similarity search ([Supabase pgvector guide](https://supabase.com/docs/guides/database/extensions/pgvector)).

The OpenAI embeddings endpoint supports batched inputs, but enforce the current model limits and retry 429/5xx responses with backoff ([OpenAI embeddings API](https://developers.openai.com/api/reference/ruby/resources/embeddings/methods/create)). OpenAI states that API data is not used to train its models by default unless the customer opts in; default abuse-monitoring logs may retain customer content for up to 30 days. Publisher rights must still allow sending the text to OpenAI ([OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)).

### 6. Scheduling and operations

Use one scheduled container/VM job for discovery and extraction. Supabase Cron can trigger an HTTP worker or Edge Function and records run state, but Supabase recommends keeping cron jobs short; its documentation recommends no more than eight concurrent jobs and about ten minutes per job ([Supabase Cron](https://supabase.com/docs/guides/cron)). The crawler itself should run outside the database and outside a short-lived Edge Function.

Use a queue for documents awaiting extraction/embedding, with bounded retries and a dead-letter state. Track per-source success rate, discovered/fetched/skipped counts, HTTP 403/429 rates, extraction length shifts, duplicate rate, embedding cost, and last successful run. Alert on schema/extraction drift rather than silently publishing an empty episode.

## Podcast publication controls

Embedding content for retrieval is not the same as obtaining publication rights. The podcast should:

- Generate original analysis rather than a readout, translation, or close paraphrase of any article.
- Attribute factual sources in show notes and keep a per-claim evidence trail.
- Prefer primary material: SEC filings, company investor-relations releases, regulator releases, and official statistics.
- Use quotations only under a reviewed editorial/legal policy and within licensed limits.
- Distinguish fact, reported allegation, analysis, and opinion.
- Require human editorial review for financial accuracy, defamation, market-moving claims, sponsorship disclosure, and hallucinations.
- Avoid presenting content as personalized investment advice; add appropriately reviewed disclosures.

Before launch, counsel should review Israeli and US copyright, database rights where applicable, contract/terms compliance, defamation, financial-promotion/investment-advice issues, and the exact publisher licenses. This report is technical research, not legal advice.

## Implementation order

1. Build the watchlist, SEC connector, Company Facts ingestion, filing HTML/iXBRL extraction, deduplication, provenance, and embeddings.
2. Add company investor-relations and regulator sources whose terms explicitly permit the intended use.
3. Contact Calcalist, Ynet, Globes, TheMarker, Reuters, and CNBC for commercial text/AI/audio rights. Ask specifically about automated retrieval, internal full-text storage, embeddings/RAG, sending text to OpenAI, generated audio, attribution, territories, retention, and traffic limits.
4. Treat Yahoo Finance only as a user-facing discovery reference unless Yahoo and its underlying providers grant the required rights; obtain market data from a licensed source.
5. Enable a publisher connector only after its rights policy is recorded and tested.

## Bottom line

For this repository, the best first implementation is a focused TypeScript worker built around SEC APIs, approved RSS discovery, Mozilla Readability for licensed pages, the existing Supabase/PostgreSQL/OpenAI clients, and pgvector. Add Python with Arelle only for advanced XBRL/PDF cases. The best compliant source is SEC EDGAR. The requested publishers are not a viable pool of free full-text content for a public commercial podcast: several explicitly prohibit the proposed automated collection, and Reuters requires prior written consent. Budget for content licenses, or redesign the editorial workflow around public primary sources and metadata-only news discovery.
