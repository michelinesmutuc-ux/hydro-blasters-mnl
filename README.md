# Hydro Blasters MNL

A static, mobile-first Next.js storefront prototype for Hydro Blasters MNL. It has no backend, database, or checkout integration yet.

## Run locally

```bash
pnpm install
pnpm dev
```

To create the production-ready static export:

```bash
pnpm build
```

The exported site is generated in `out/`.

## Deploy to Cloudflare Pages

1. Push this folder to a Git repository.
2. In Cloudflare, create a **Pages** application and import the repository.
3. Choose the **Next.js (Static HTML Export)** framework preset, or set:
   - Build command: `pnpm build`
   - Build output directory: `out`
4. Deploy. Cloudflare Pages will publish the static site to a `pages.dev` URL.

This project uses `output: 'export'` in `next.config.ts`, so it is compatible with Cloudflare Pages static hosting and does not require a Node.js server.
