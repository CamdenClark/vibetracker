# Vibetracker Docs

This is a Hugo documentation site using the hugo-book theme, deployed to Cloudflare Workers.

## Development

Run the local development server:

```bash
hugo server
```

Build the site:

```bash
hugo
```

The built site outputs to `public/`.

## Deployment

Deploy to Cloudflare Workers:

```bash
wrangler deploy
```

## Content Structure

- `content/docs/` - Main documentation pages
- `content/docs/installation/` - Installation guides for each supported tool
- `content/docs/analyze/` - Analytics and analysis documentation
- `archetypes/default.md` - Template for new pages

## Writing Documentation

Use markdown with YAML frontmatter:

```md
---
title: "Page Title"
weight: 1
---

# Page Title

Content here...
```

The `weight` field controls ordering in the sidebar (lower = higher).

## Hugo Shortcodes

Link to other docs pages:

```md
{{< relref "installation/claude" >}}
```

Button linking to a page:

```md
{{< button relref="/docs/installation" >}}Button Text{{< /button >}}
```

## Adding a New Installation Guide

1. Create `content/docs/installation/<tool>.md`
2. Add frontmatter with title and weight
3. Include installation steps for both plugin and manual methods
4. Add link to `content/docs/_index.md` under Supported Tools
