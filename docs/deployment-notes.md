# Deployment notes: why the live demo resets

The live demo at https://quippe.vercel.app keeps all data in memory. Asks you confirm, offers you accept, and approvals you make can disappear between steps. Run the full demo path locally (`npm run dev`) to see every step build on the last one.

This note explains why, based on the Next.js and Vercel docs (looked up with the Context7 power), and what we would use in production.

## How Quippe stores data today

`src/lib/data/repo.ts` builds one in-memory store from `seed.json` and keeps it on `globalThis.__quippeRepo`. Every route handler and page in the same Node.js process shares that store. The `shared-repo-singleton` bugfix made this work under `next dev`, where Next re-evaluates server bundles after each compile.

That fix only covers one process. A deployed app on Vercel does not run as one long-lived process.

## Why state is not shared on Vercel

- **Each request is a function invocation.** Vercel creates a function invocation for each request and reuses a running instance when one is available. It scales instances up with traffic and down to zero when there are no requests ([Vercel Functions lifecycle](https://vercel.com/docs/functions)).
- **Instances can share state, but only inside one instance.** With Fluid compute, invocations on the same instance share its global state, such as in-memory caches ([What is compute](https://vercel.com/docs/fundamentals/what-is-compute)). A second instance has its own memory, so it builds its own fresh store from the seed.
- **Cold starts start from nothing.** When no warm instance is available, a new one starts. Vercel says cold starts are less frequent with Fluid compute but still happen, for example during low traffic ([What is compute](https://vercel.com/docs/fundamentals/what-is-compute)). For a demo with a handful of clicks spread over minutes, that is the normal case.
- **Functions scale out.** Vercel runs as many instances as traffic needs, up to 30,000 on Hobby and Pro ([Concurrency scaling](https://vercel.com/docs/functions/concurrency-scaling)). Two requests can land on two instances with two different stores.
- **Next.js says the same about its own caches.** The Next.js 14 self-hosting docs tell you to turn off the default in-memory cache (`cacheMaxMemorySize: 0`) and use a shared cache handler when you run more than one instance, so that every instance sees the same data ([Next.js deploying docs](https://github.com/vercel/next.js/blob/v14.3.0-canary.87/docs/02-app/01-building-your-application/10-deploying/index.mdx)).

So on the live site a write lands in whichever instance served that request. The next request may hit a different instance, or a new instance after the old one scaled to zero, and see only seed data. The demo session cookie holds just the account id, so you stay signed in while the data underneath resets.

## What we would use in production

Postgres, provisioned through the Vercel Marketplace (Neon, Supabase, or AWS Aurora Postgres). Vercel injects the connection string as an environment variable ([Vercel storage](https://vercel.com/docs/storage)).

The change is contained in the data layer:

1. Write a `PostgresRepo` that implements the existing `Repo` interface in `src/lib/data/repo.ts`. Every method already returns a `Promise`, so no route or page has to change.
2. Create one `pg` connection pool per instance and register it with `attachDatabasePool(pool)` from `@vercel/functions`, which releases idle clients before a function suspends ([@vercel/functions reference](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)).
3. Load `seed.json` into the database once with a seed script, validated by the same `SeedSchema`.
4. Keep the in-memory repo for tests and the offline demo, chosen by an environment variable.

Two things move from the process into the database: the per-company capacity checks on accept (they need a transaction so two liaisons can't overbook an offer) and the timeline writes that go with each accept, approve, and confirm.

A Redis store (Upstash, also on the Marketplace) would work for sessions, but Postgres alone covers the MVP.
