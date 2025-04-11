# 2.0.2

- Added `rateLimitMs` option to the `FetchHttpClient`.
  - This allows you to restrict how often the client is allowed to make calls, which can be useful when consuming an API with call rate limitations.

# 2.0.1

- Add repo information.

# 2.0.0

## Breaking Changes

- Package now bundles to ESM-only.
- `cross-fetch` peer dependency updated to `^4.0.0`.