# Contributing to dsh-companion

Thanks for helping improve the project. Bug fixes, tests, documentation, and focused feature proposals are welcome.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces. Security issues should be reported privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Open a feature request before making a large API or behavior change.
- Keep the API read-only and avoid exposing complete Harness service objects.
- Treat the trusted-host checks as a security boundary; changes to them need tests.

## Local setup

Requirements:

- Node.js 22 or newer
- npm (the lockfile is authoritative)

```sh
git clone https://github.com/leonardoxr/dsh-companion.git
cd dsh-companion
npm ci
npm test
```

## Making a change

1. Create a focused branch.
2. Update source and tests together.
3. Run the full checks:

   ```sh
   npm test
   npm pack --dry-run
   ```

4. Commit generated changes under `dist/`. They are intentionally versioned because DSH can install the plugin directly from GitHub.
5. Update documentation when behavior, installation, compatibility, or response shapes change.
6. Open a pull request and explain the user-visible effect and how it was tested.

Please do not edit `dist/` by hand; run `npm run build` instead. Do not bump the version unless a maintainer asks for it.

## Pull-request expectations

A pull request should:

- stay limited to one logical change;
- keep `npm test` passing on supported Node.js versions;
- keep compiled output synchronized with `src/`;
- avoid new runtime dependencies unless they are clearly justified;
- preserve read-only behavior and clean route disposal.

Maintainers may ask for changes before merging. By contributing, you agree that your contribution is licensed under the project's [MIT License](LICENSE).
