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

## Connect Supabase

1. In the project root, create a new file named `.env.local`.
2. In Supabase, open your project’s **Connect** panel and copy the **Project URL** and **Publishable Key**.
3. Add them to `.env.local` exactly like this:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The reusable client is at `lib/supabase/client.ts`. It does not query any tables yet. `.env.local` is ignored by Git, so do not place credentials in `.env.example`, source files, or commits.

## Deploy to Cloudflare Pages

1. Push this folder to a Git repository.
2. In Cloudflare, create a **Pages** application and import the repository.
3. Choose the **Next.js (Static HTML Export)** framework preset, or set:
   - Build command: `pnpm build`
   - Build output directory: `out`
4. Deploy. Cloudflare Pages will publish the static site to a `pages.dev` URL.

This project uses `output: 'export'` in `next.config.ts`, so it is compatible with Cloudflare Pages static hosting and does not require a Node.js server.
