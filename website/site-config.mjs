export const REPOSITORY = "mbagagli/trolley";
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;

export const DOC_PAGES = [
  { slug: "getting-started", title: "Getting started",
    source: "website/docs/getting-started.md", group: "Using Trolley" },
  { slug: "planning-views", title: "Four planning views",
    source: "website/docs/planning-views.md", group: "Using Trolley" },
  { slug: "data-and-backups", title: "Data and backups",
    source: "website/docs/data-and-backups.md", group: "Using Trolley" },
  { slug: "installation", title: "Install the beta",
    source: "website/docs/installation.md", group: "Using Trolley" },
  { slug: "development", title: "Development",
    source: "website/docs/development.md", group: "Building Trolley" },
  { slug: "security", title: "Security and data safety",
    source: "SECURITY.md", group: "Building Trolley" },
  { slug: "architecture", title: "Architecture",
    source: "ARCHITECTURE.md", group: "Building Trolley" },
  { slug: "releasing", title: "Releases and website",
    source: "RELEASING.md", group: "Building Trolley" },
];

/** Normalize a local or GitHub Pages deployment prefix.
 *
 * Args:
 *     value: The optional path prefix, without a host or query.
 * Returns:
 *     string: A validated path with leading and trailing slashes.
 */
export function siteBase(value = "/") {
  if (!/^\/?[a-zA-Z0-9_/-]*$/.test(value)) {
    throw new Error("SITE_BASE must be a URL path, such as /trolley/");
  }
  const segments = value.split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}/` : "/";
}
