// Builds README.md and data/destinations.json from the public Submitlist catalog.
// Run: bun scripts/build-readme.js   (or: node scripts/build-readme.js)

import { writeFile, readFile } from "node:fs/promises";

const CATALOG_URL = "https://api.submitlist.io/catalog/destinations";
const SITE_URL = "https://submitlist.io";
const CATALOG_PAGE = `${SITE_URL}/catalog`;

const SECTIONS = [
  {
    type: "directory",
    anchor: "directories",
    title: "Directories",
    icon: "type-directory.svg",
    intro: "The classic move. Fill a form, wait for an editor, get a listing and usually a link. The top of this list is Trustpilot and the BBB territory, where a listing is a trust signal more than a traffic source. Further down are the maker directories that still send real visitors.",
  },
  {
    type: "product-launch-site",
    anchor: "product-launch-sites",
    title: "Product launch sites",
    icon: "type-launch.svg",
    intro: "One day, one shot. Product Hunt is the obvious one and still the biggest. The rest are smaller but easier to win, and a top spot on a small launch site beats page four on a big one.",
  },
  {
    type: "newsletter",
    anchor: "newsletters",
    title: "Newsletters",
    icon: "type-newsletter.svg",
    intro: "No form, no queue. You write to a human who curates an inbox that people actually open. Reader counts and open rates are the newsletter's own published numbers. Pitch short, pitch specific, and read three back issues first.",
  },
  {
    type: "community",
    anchor: "communities",
    title: "Communities",
    icon: "type-community.svg",
    intro: "Forums and groups where showing your work is welcome as long as you are a member first and a marketer second. The good ones have long memories for drive-by promotion.",
  },
  {
    type: "subreddit",
    anchor: "subreddits",
    title: "Subreddits",
    icon: "type-subreddit.svg",
    intro: "Reddit will bury a bad post and its author in about four minutes. Every entry says which route the moderators allow: a direct post, a weekly promotion thread, or comments only. When it says unknown, ask the mods before you post.",
  },
  {
    type: "marketplace",
    anchor: "marketplaces",
    title: "Marketplaces",
    icon: "type-marketplace.svg",
    intro: "App, extension, and plugin stores. Listing here is distribution, not PR. Reviews take longer, developer accounts sometimes cost money, and once you are in, the store keeps sending users for years.",
  },
  {
    type: "citation",
    anchor: "citations",
    title: "Citations",
    icon: "type-citation.svg",
    intro: "Places that do not run a directory but mention products inside articles, rankings, and profiles. Nobody accepts a submission here. You earn the mention, and the second line of each entry says what that takes.",
  },
];

const PRICING_LABEL = { free: "Free", paid: "Paid", unknown: "" };
const LINK_LABEL = { dofollow: "Dofollow", nofollow: "Nofollow", unknown: "" };
const PROMOTION_LABEL = {
  direct_post: "Direct posts OK",
  promotion_thread: "Promotion thread only",
  promo_thread: "Promotion thread only",
  recurring_thread: "Promotion thread only",
  "direct_post+promotion_thread": "Post or promotion thread",
  comments_only: "Comments only",
  restricted: "Restricted",
  prohibited: "No promotion",
  unknown: "Rules unclear",
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

function clean(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function shorten(text, maxLength = 230) {
  const value = clean(text);
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentenceEnd > 80) return cut.slice(0, sentenceEnd + 1);
  const wordEnd = cut.lastIndexOf(" ");
  return `${cut.slice(0, wordEnd > 80 ? wordEnd : maxLength).replace(/[,;:]$/, "")}…`;
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

function logo(destination) {
  const src = destination.logo_url || `https://www.google.com/s2/favicons?domain=${hostname(destination.website_url)}&sz=64`;
  return `<a href="${destinationLink(destination)}"><img src="${src}" width="16" height="16" alt=""></a>`;
}

function chips(values) {
  return values.filter(Boolean).map((value) => `\`${value}\``).join(" ");
}

function entry(destination, chipValues, text, secondLine = "") {
  const lines = [
    `- ${logo(destination)} **[${clean(destination.name)}](${destinationLink(destination)})** ${chips(chipValues)}<br>`,
    `  ${text}${secondLine ? "<br>" : ""}`,
  ];
  if (secondLine) lines.push(`  ${secondLine}`);
  return lines.join("\n");
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

function trafficChip(destination) {
  return destination.monthly_traffic ? `${compactNumber(destination.monthly_traffic)} visits/mo` : "";
}

function ratingChip(destination) {
  return destination.domain_rating !== null && destination.domain_rating !== undefined ? `DR ${destination.domain_rating}` : "";
}

function directoryEntries(items) {
  return items.sort(byRatingThenName).map((d) =>
    entry(d, [ratingChip(d), trafficChip(d), PRICING_LABEL[d.pricing], LINK_LABEL[d.link_type]], shorten(d.description)),
  );
}

function newsletterEntries(items) {
  return items.sort(bySubscribersThenName).map((d) =>
    entry(
      d,
      [
        d.newsletter_subscribers ? `${compactNumber(d.newsletter_subscribers)} readers` : "",
        d.newsletter_open_rate ? `${d.newsletter_open_rate}% open rate` : "",
        PLATFORM_LABEL[d.newsletter_platform] ?? clean(d.newsletter_platform),
      ],
      shorten(d.description),
    ),
  );
}

function growthChip(subreddit) {
  const growth = subreddit?.growth_30d_absolute;
  const members = subreddit?.members_count;
  if (!growth || !members) return "";
  const previous = members - growth;
  if (previous <= 0) return `+${compactNumber(growth)} in 30d`;
  const percent = (growth / previous) * 100;
  return `+${percent >= 10 ? Math.round(percent) : percent.toFixed(1)}% in 30d`;
}

function subredditEntries(items) {
  return items.sort(byMembersThenName).map((d) =>
    entry(
      d,
      [
        d.subreddit?.members_count ? `${compactNumber(d.subreddit.members_count)} members` : "",
        growthChip(d.subreddit),
        PROMOTION_LABEL[d.subreddit?.promotion_mode] ?? clean((d.subreddit?.promotion_mode ?? "").replace(/_/g, " ")),
      ],
      shorten(d.description),
    ),
  );
}

function citationEntries(items) {
  return items.sort(byRatingThenName).map((d) =>
    entry(
      d,
      [ratingChip(d), trafficChip(d), PRICING_LABEL[d.pricing]],
      shorten(d.description, 200),
      d.eligibility ? `<sub>How to get in: ${shorten(d.eligibility, 260)}</sub>` : "",
    ),
  );
}

const ENTRIES_BY_TYPE = {
  newsletter: newsletterEntries,
  subreddit: subredditEntries,
  citation: citationEntries,
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
    const render = ENTRIES_BY_TYPE[section.type] ?? directoryEntries;
    return [
      `## <a name="${section.anchor}"></a><a href="${CATALOG_PAGE}?type=${section.type}"><img src="assets/${section.icon}" width="30" alt=""></a> ${section.title}`,
      "",
      `<sub>${items.length} ${items.length === 1 ? "entry" : "entries"} · [filter and sort these on submitlist.io](${CATALOG_PAGE}?type=${section.type})</sub>`,
      "",
      section.intro,
      "",
      render(items).join("\n"),
      "",
      `<p align="right"><a href="#contents">back to contents ↑</a></p>`,
    ].join("\n");
  }).join("\n\n");

  return `<p align="center">
  <a href="${SITE_URL}"><img src="assets/hero.svg" alt="The Submitlist pigeon dispatching envelopes to directories, launch sites, newsletters, and communities" width="760"></a>
</p>

<h1 align="center">awesome-submitlist</h1>

<p align="center"><b>${total} places to submit your startup.</b><br>Directories, launch sites, newsletters, communities, subreddits, marketplaces, and the press pages that mention products. With the numbers attached.</p>

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

You built the thing. Now where do you post it? Every list that answers this question is either five years stale, padded with dead domains, or a lead magnet for an agency. This one is none of those. It is generated from the live [Submitlist catalog](${CATALOG_PAGE}), where each site was opened by a person, checked for whether it still takes submissions, and tagged with the four numbers that decide if it is worth your afternoon: Ahrefs Domain Rating, monthly organic traffic, what it costs, and whether the backlink is dofollow.

Dead sites get archived and vanish from here on the next weekly sync. Right now ${highAuthority} of the ${total} destinations have a Domain Rating of 80 or higher, ${free} are free, and ${dofollow} give you a dofollow link. The pigeon keeps count.

<img src="assets/pigeon-wave.svg" alt="" width="190" align="right">

## Contents

${contents}

- [How to read an entry](#how-to-read-an-entry)
- [How this list is built](#how-this-list-is-built)
- [Contributing](#contributing)

## How to read an entry

Each line is one destination. The name links straight to the submission page when there is one, otherwise to the site. The chips after it are the data:

- \`DR 91\` is Domain Rating by [Ahrefs](https://ahrefs.com), 0 to 100. Higher means the site's own backlinks are stronger, so a link from it is worth more.
- \`4.2M visits/mo\` is Ahrefs' estimate of monthly organic search traffic to the whole site, not to your listing.
- \`Free\` or \`Paid\` is what the listing costs. Free sites often sell a faster review or a featured slot on top.
- \`Dofollow\` or \`Nofollow\` is the kind of link a listing gives you. No chip means nobody has checked yet.
- Newsletters show readers and open rate. Subreddits show members, 30-day growth, and the promotion route the mods allow.

Sections are sorted by DR, subreddits by members, newsletters by readers. A missing chip means unknown, not zero.

${sections}

## How this list is built

<img src="assets/pigeon-clipboard.svg" alt="" width="210" align="right">

The catalog lives in [Submitlist](${SITE_URL}), a free workspace for tracking startup and product submissions. Nothing lands in it from a scrape. Someone opens the site, confirms it still accepts submissions, writes down the eligibility rules and the pricing, and pulls Domain Rating and traffic from Ahrefs. When a site dies, parks its domain, or stops taking listings, it gets archived, and the next sync drops it from this page.

This README is rendered by [\`scripts/build-readme.js\`](scripts/build-readme.js) from the public catalog endpoint. A GitHub Action re-runs it every Monday, so the entries, counts, and badges track production without anyone touching markdown. The same data ships as [\`data/destinations.json\`](data/destinations.json) if you would rather script against it than scroll.

If you want more than a list, the app does the boring half: one launch kit holding your copy and assets, a board that moves each site from *To submit* to *Listed*, and an MCP server so Claude Code, Codex, or opencode can research destinations, pick the right ones for your product, and move the cards for you. It is free. [Open Submitlist](${SITE_URL})

## Contributing

Know a directory, launch site, newsletter, community, subreddit, or marketplace that is missing? Two ways in:

1. **Suggest it in the app.** The [contact page](${SITE_URL}/contact) has a "Request a site for the catalog" form. It takes a URL and a note, and the request lands in the same review queue as everything else.
2. **Open an issue here** using the *Suggest a destination* template. Include the submission URL and, if you know it, the price and whether links are dofollow.

Do not send pull requests that edit \`README.md\` directly. It is generated, and the next sync would overwrite your change. Fixes to the build script, the assets, or the docs are welcome as PRs. See [CONTRIBUTING.md](CONTRIBUTING.md).

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
    logo_url: destination.logo_url || null,
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
