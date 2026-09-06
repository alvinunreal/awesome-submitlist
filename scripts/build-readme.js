// Builds README.md and data/destinations.json from the public Submitlist catalog.
// Run: bun scripts/build-readme.js   (or: node scripts/build-readme.js)

import { writeFile, readFile } from "node:fs/promises";

const CATALOG_URL = "https://api.submitlist.io/catalog/destinations";
const SITE_URL = "https://submitlist.io";
const CATALOG_PAGE = `${SITE_URL}/catalog`;
const REPO_URL = "https://github.com/alvinunreal/awesome-submitlist";

const SECTIONS = [
  {
    type: "directory",
    anchor: "directories",
    title: "Directories",
    icon: "type-directory.svg",
    intro: "Curated listing sites. Most accept a URL, a short description, and a category. Sorted by Domain Rating, so the strongest links sit at the top.",
  },
  {
    type: "product-launch-site",
    anchor: "product-launch-sites",
    title: "Product launch sites",
    icon: "type-launch.svg",
    intro: "Launch-day platforms. Timing and the maker comment matter more than the form itself, so read each site's rules before you schedule.",
  },
  {
    type: "newsletter",
    anchor: "newsletters",
    title: "Newsletters",
    icon: "type-newsletter.svg",
    intro: "Maker and startup inboxes that feature products. Reader counts and open rates come from the newsletter's own public stats. There is rarely a form. Write to the editor.",
  },
  {
    type: "community",
    anchor: "communities",
    title: "Communities",
    icon: "type-community.svg",
    intro: "Forums and groups where posting your product is welcome when you follow the house rules. Lurk first.",
  },
  {
    type: "subreddit",
    anchor: "subreddits",
    title: "Subreddits",
    icon: "type-subreddit.svg",
    intro: "Niche reddit audiences. Every row carries the promotion route the moderators allow. \"Unknown\" means the rules do not say, so ask before you post.",
  },
  {
    type: "marketplace",
    anchor: "marketplaces",
    title: "Marketplaces",
    icon: "type-marketplace.svg",
    intro: "App, extension, and plugin stores. Listing here is a distribution channel in its own right, and the developer accounts are often paid.",
  },
  {
    type: "citation",
    anchor: "citations",
    title: "Citations",
    icon: "type-citation.svg",
    intro: "Places that mention products inside articles, lists, or profiles instead of running a directory. You earn the mention. The link tells you where to pitch.",
  },
];

const PRICING_LABEL = { free: "Free", paid: "Paid", unknown: "" };
const LINK_LABEL = { dofollow: "Dofollow", nofollow: "Nofollow", unknown: "" };
const PROMOTION_LABEL = {
  direct_post: "Direct post",
  promotion_thread: "Promotion thread",
  promo_thread: "Promotion thread",
  recurring_thread: "Promotion thread",
  "direct_post+promotion_thread": "Post or thread",
  comments_only: "Comments only",
  restricted: "Restricted",
  prohibited: "Prohibited",
  unknown: "Unknown",
};
const PLATFORM_LABEL = {
  beehiiv: "beehiiv",
  substack: "Substack",
  kit: "Kit",
  ghost: "Ghost",
  mailchimp: "Mailchimp",
  buttondown: "Buttondown",
  other: "",
};

function compactNumber(value) {
  if (value === null || value === undefined) return "";
  if (value >= 1e9) return `${trimDecimal(value / 1e9)}B`;
  if (value >= 1e6) return `${trimDecimal(value / 1e6)}M`;
  if (value >= 1e3) return `${trimDecimal(value / 1e3)}K`;
  return String(value);
}

function trimDecimal(value) {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

function cell(text) {
  return String(text ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function firstSentence(text, maxLength = 170) {
  const clean = cell(text);
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentenceEnd > 60) return cut.slice(0, sentenceEnd + 1);
  const wordEnd = cut.lastIndexOf(" ");
  return `${cut.slice(0, wordEnd > 60 ? wordEnd : maxLength).replace(/[,;:]$/, "")}…`;
}

function destinationLink(destination) {
  return destination.submission_url || destination.website_url;
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function nameCell(destination) {
  return `[${cell(destination.name)}](${destinationLink(destination)})`;
}

function byRatingThenName(a, b) {
  const ratingA = a.domain_rating ?? -1;
  const ratingB = b.domain_rating ?? -1;
  if (ratingB !== ratingA) return ratingB - ratingA;
  return a.name.localeCompare(b.name);
}

function byMembersThenName(a, b) {
  const membersA = a.subreddit?.members_count ?? -1;
  const membersB = b.subreddit?.members_count ?? -1;
  if (membersB !== membersA) return membersB - membersA;
  return a.name.localeCompare(b.name);
}

function bySubscribersThenName(a, b) {
  const subsA = a.newsletter_subscribers ?? -1;
  const subsB = b.newsletter_subscribers ?? -1;
  if (subsB !== subsA) return subsB - subsA;
  return a.name.localeCompare(b.name);
}

function table(header, rows) {
  const divider = header.map((label, index) => (index === 0 || label === "What it is" || label === "About" || label === "How to earn a mention" || label === "What it covers" ? "---" : ":---:"));
  return [
    `| ${header.join(" | ")} |`,
    `| ${divider.join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function directoryTable(items) {
  return table(
    ["Site", "What it is", "DR", "Traffic", "Pricing", "Link"],
    items.sort(byRatingThenName).map((d) => [
      nameCell(d),
      firstSentence(d.description),
      d.domain_rating ?? "",
      compactNumber(d.monthly_traffic),
      PRICING_LABEL[d.pricing] ?? "",
      LINK_LABEL[d.link_type] ?? "",
    ]),
  );
}

function newsletterTable(items) {
  return table(
    ["Newsletter", "What it covers", "Subscribers", "Opens", "Platform"],
    items.sort(bySubscribersThenName).map((d) => [
      nameCell(d),
      firstSentence(d.description),
      compactNumber(d.newsletter_subscribers),
      d.newsletter_open_rate ? `${d.newsletter_open_rate}%` : "",
      PLATFORM_LABEL[d.newsletter_platform] ?? cell(d.newsletter_platform ?? ""),
    ]),
  );
}

function subredditTable(items) {
  return table(
    ["Subreddit", "About", "Members", "30d growth", "Promotion"],
    items.sort(byMembersThenName).map((d) => [
      nameCell(d),
      firstSentence(d.description),
      compactNumber(d.subreddit?.members_count),
      growthCell(d.subreddit),
      PROMOTION_LABEL[d.subreddit?.promotion_mode] ?? cell((d.subreddit?.promotion_mode ?? "").replace(/_/g, " ")),
    ]),
  );
}

function growthCell(subreddit) {
  const growth = subreddit?.growth_30d_absolute;
  const members = subreddit?.members_count;
  if (!growth || !members) return "";
  const previous = members - growth;
  if (previous <= 0) return `+${compactNumber(growth)}`;
  const percent = (growth / previous) * 100;
  return `+${percent >= 10 ? Math.round(percent) : percent.toFixed(1)}%`;
}

function citationTable(items) {
  return table(
    ["Source", "How to earn a mention", "DR", "Traffic", "Pricing"],
    items.sort(byRatingThenName).map((d) => [
      nameCell(d),
      firstSentence(d.eligibility || d.description),
      d.domain_rating ?? "",
      compactNumber(d.monthly_traffic),
      PRICING_LABEL[d.pricing] ?? "",
    ]),
  );
}

const TABLE_BY_TYPE = {
  newsletter: newsletterTable,
  subreddit: subredditTable,
  citation: citationTable,
};

function badge(label, value, color) {
  const encode = (text) => encodeURIComponent(text).replace(/-/g, "--").replace(/_/g, "__");
  return `https://img.shields.io/badge/${encode(label)}-${encode(value)}-${color}?style=flat-square`;
}

function renderReadme(destinations, syncedOn) {
  const groups = Object.fromEntries(SECTIONS.map((section) => [section.type, destinations.filter((d) => d.type === section.type)]));
  const total = destinations.length;
  const free = destinations.filter((d) => d.pricing === "free").length;
  const dofollow = destinations.filter((d) => d.link_type === "dofollow").length;
  const highAuthority = destinations.filter((d) => (d.domain_rating ?? 0) >= 80).length;
  const purple = "6864e5";

  const contents = SECTIONS.map((section) => `- [${section.title}](#${section.anchor}) <sub>${groups[section.type].length}</sub>`).join("\n");

  const sections = SECTIONS.map((section) => {
    const items = groups[section.type];
    const render = TABLE_BY_TYPE[section.type] ?? directoryTable;
    return [
      `## <a name="${section.anchor}"></a><a href="${CATALOG_PAGE}?type=${section.type}"><img src="assets/${section.icon}" width="30" alt=""></a> ${section.title}`,
      "",
      `<sub>${items.length} ${items.length === 1 ? "entry" : "entries"} · [browse with filters](${CATALOG_PAGE}?type=${section.type})</sub>`,
      "",
      section.intro,
      "",
      render(items),
      "",
      `<p align="right"><a href="#contents">back to contents ↑</a></p>`,
    ].join("\n");
  }).join("\n\n");

  return `<p align="center">
  <a href="${SITE_URL}"><img src="assets/banner.png" alt="awesome-submitlist: 300+ places to submit your startup" width="920"></a>
</p>

<p align="center">
  <a href="https://awesome.re"><img src="https://awesome.re/badge-flat2.svg" alt="Awesome"></a>
  <a href="${CATALOG_PAGE}"><img src="${badge("destinations", String(total), purple)}" alt="${total} destinations"></a>
  <a href="#how-this-list-is-built"><img src="${badge("synced", syncedOn, purple)}" alt="synced ${syncedOn}"></a>
  <a href="#contributing"><img src="${badge("PRs", "welcome", "1f8a4c")}" alt="PRs welcome"></a>
  <a href="LICENSE"><img src="${badge("license", "CC0 1.0", "8b8b8b")}" alt="CC0 1.0 license"></a>
</p>

<p align="center">
  <b><a href="${SITE_URL}">submitlist.io</a></b> · <a href="${CATALOG_PAGE}">Browse the catalog</a> · <a href="${SITE_URL}/guides">Guides</a> · <a href="#contributing">Suggest a site</a>
</p>

Every place a software product can be submitted, listed, launched, or mentioned, in one list. **${total} destinations** across ${SECTIONS.length} kinds, each with the metrics you actually decide on: Domain Rating, monthly organic traffic, price, and whether the link you get back is dofollow.

The list is generated from the live [Submitlist catalog](${CATALOG_PAGE}), the same data behind the app that tracks your submissions on a kanban board. Entries are hand-verified before they go in, metrics are re-audited, and dead or parked sites get archived instead of rotting here. ${highAuthority} destinations have a Domain Rating of 80 or higher, ${free} are free, and ${dofollow} hand back a dofollow link.

<img src="assets/pigeon-wave.svg" alt="" width="190" align="right">

## Contents

${contents}

- [How this list is built](#how-this-list-is-built)
- [Contributing](#contributing)

## How to read the tables

- **DR** is Domain Rating by [Ahrefs](https://ahrefs.com), 0 to 100. Higher means the site's own backlink profile is stronger, so a link from it carries more weight.
- **Traffic** is Ahrefs' estimate of monthly organic search visits to the whole site, not to your listing.
- **Pricing** is what the listing itself costs. Free sites often sell a faster review or a featured slot on top.
- **Link** says whether a listing's outbound link is dofollow or nofollow. Blank means it has not been checked yet.
- **Promotion** on subreddits is the route the moderators allow: a direct post, a recurring promotion thread, or comments only.
- Each table is sorted by DR (subreddits by members, newsletters by subscribers). Blank cells mean the data point is unknown, not zero.

${sections}

## How this list is built

<img src="assets/pigeon-clipboard.svg" alt="" width="210" align="right">

The catalog lives in [Submitlist](${SITE_URL}), a free workspace for tracking startup and product submissions. Every destination there is added by hand: someone opens the site, confirms it still accepts submissions, records the eligibility rules and the pricing, and pulls Domain Rating and traffic from Ahrefs. Sites that go dead, parked, or stop accepting listings are archived and drop out of this list on the next sync.

This README is rendered by [\`scripts/build-readme.js\`](scripts/build-readme.js) from the public catalog endpoint. A GitHub Action re-runs it every week, so the tables, counts, and badges above track production without anyone editing markdown by hand. The same data ships as [\`data/destinations.json\`](data/destinations.json) if you would rather script against it.

If you want more than a list, the app does the boring part: one launch kit with your copy and assets, a board that moves each site from *To submit* to *Listed*, and an MCP server so Claude Code, Codex, or opencode can research destinations, pick the right ones for your product, and move the cards for you. It is free. [Open Submitlist →](${SITE_URL})

## Contributing

Know a directory, launch site, newsletter, community, subreddit, or marketplace that is missing? Two ways in:

1. **Suggest it in the app.** The [contact page](${SITE_URL}/contact) has a "Request a site for the catalog" form. It takes a URL and a note, and the request lands in the same review queue as everything else.
2. **Open an issue here** using the *Suggest a destination* template. Include the submission URL and, if you know it, the price and whether links are dofollow.

Do not send pull requests that edit \`README.md\` directly. It is generated and the next sync would overwrite your change. Fixes to the build script, the assets, or the docs are welcome as PRs. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[CC0 1.0](LICENSE). The list is public domain. Domain Rating figures are provided by Ahrefs under their [Domain Rating license](http://ahrefs.com/legal/domain-rating-license).

<p align="center"><sub>Maintained by <a href="https://github.com/alvinunreal">Alvin</a> · Built from <a href="${CATALOG_PAGE}">submitlist.io/catalog</a> · Last synced ${syncedOn}</sub></p>
`;
}

function publicSnapshot(destination) {
  return {
    slug: destination.slug,
    name: destination.name,
    type: destination.type,
    website_url: destination.website_url,
    submission_url: destination.submission_url || null,
    description: destination.description,
    audience: destination.audience || null,
    eligibility: destination.eligibility || null,
    pricing: destination.pricing,
    pricing_note: destination.pricing_note || null,
    link_type: destination.link_type,
    domain_rating: destination.domain_rating,
    monthly_traffic: destination.monthly_traffic,
    categories: (destination.categories ?? []).map((category) => category.slug),
    ...(destination.type === "newsletter"
      ? {
          newsletter: {
            category: destination.newsletter_category,
            topic: destination.newsletter_topic,
            platform: destination.newsletter_platform,
            subscribers: destination.newsletter_subscribers,
            open_rate: destination.newsletter_open_rate,
          },
        }
      : {}),
    ...(destination.subreddit
      ? {
          subreddit: {
            members_count: destination.subreddit.members_count,
            growth_30d_absolute: destination.subreddit.growth_30d_absolute,
            promotion_mode: destination.subreddit.promotion_mode,
            rules_url: destination.subreddit.rules_url,
          },
        }
      : {}),
  };
}

async function loadDestinations() {
  const response = await fetch(CATALOG_URL, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status} ${response.statusText}`);
  const payload = await response.json();
  if (!Array.isArray(payload.destinations) || payload.destinations.length === 0) throw new Error("Catalog returned no destinations");
  return payload.destinations.filter((d) => d.availability !== "paused" && !d.archived_at);
}

const destinations = await loadDestinations();
const syncedOn = new Date().toISOString().slice(0, 10);
const readme = renderReadme(destinations, syncedOn);
const snapshot = {
  source: CATALOG_URL,
  synced_on: syncedOn,
  count: destinations.length,
  destinations: destinations.map(publicSnapshot).sort((a, b) => a.slug.localeCompare(b.slug)),
};

const previousReadme = await readFile("README.md", "utf8").catch(() => "");
const previousSnapshot = await readFile("data/destinations.json", "utf8").catch(() => "");
const stripDate = (text) => text.replace(/\d{4}-\d{2}-\d{2}/g, "DATE");
const unchanged = stripDate(previousReadme) === stripDate(readme) && stripDate(previousSnapshot) === stripDate(`${JSON.stringify(snapshot, null, 2)}\n`);

if (unchanged && !process.argv.includes("--force")) {
  console.log(`Catalog unchanged (${destinations.length} destinations). README.md left as is.`);
} else {
  await writeFile("README.md", readme);
  await writeFile("data/destinations.json", `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote README.md and data/destinations.json with ${destinations.length} destinations (synced ${syncedOn}).`);
}
