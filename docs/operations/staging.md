# Staging

## Preview attempts

- Mini App preview created: `https://project-12-demo-staging-public-7q0qc4bhy-tomupros-projects.vercel.app`
- Admin preview created: `https://project-12-admin-staging-pn3qin8kw-tomupros-projects.vercel.app`
- Both URLs currently resolve to the team's Vercel login wall in the verification browser, so they are not claimed as publicly accessible staging URLs.
- These preview artifacts were created before the final source-evidence/rule-version patch; the reproducible source of truth is the local repository and its passing build, not the protected preview URLs.
- API, Worker, PostgreSQL and Redis were not deployed to a public host.

The only external blocker is the authorized staging bundle: Bot token/webhook secret, HTTPS Mini App origin, hosting authorization and managed Postgres/Redis credentials. Once supplied, deploy API/Worker/data, remove preview protection or provide an authenticated verification path, set the demo-only environment values, and run the health/checklist gate. Keep real-money flags false.
