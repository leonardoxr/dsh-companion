# Releasing dsh-companion

Releases are built from reviewed source on `main`. The release workflow never modifies the repository and does not publish to npm.

> The unscoped `dsh-companion` name on npm belongs to an unrelated project. Do not run `npm publish` from this repository. `package.json` is marked private to prevent accidental publication.

## Prepare a release

1. Update `version` in both `package.json` and `package-lock.json`.
2. Update source, tests, and documentation as needed.
3. Rebuild and validate:

   ```sh
   npm ci
   npm test
   npm pack --dry-run
   git diff --exit-code -- dist
   ```

4. Commit the version change and generated `dist/` output to `main` through a pull request.
5. Confirm CI passes on the merged commit.

## Publish

Create and push a tag that exactly matches `v<package.json version>`:

```sh
git switch main
git pull --ff-only
git tag -a v0.1.1 -m "dsh-companion v0.1.1"
git push origin v0.1.1
```

The [release workflow](../.github/workflows/release.yml) verifies that:

- the tag is a stable semantic version;
- tag, manifest, and lockfile versions match;
- the tagged commit belongs to `main`;
- tests pass and committed `dist/` output is current.

It then creates an installable npm-format tarball, writes `SHA256SUMS.txt`, and publishes both files in a GitHub Release with generated release notes.

## Verify

Download the release assets and verify the checksum:

```sh
sha256sum --check SHA256SUMS.txt
dsh plugin --profile web add ./dsh-companion-0.1.1.tgz
```

Start `dsh web` and request `/api/companion/workspaces` before announcing the release.

## Failed releases

Do not move or reuse a tag. A transient failure can be rerun against the same tag while no GitHub Release exists. If the fix requires a repository change, merge it to `main`, increment the version, and publish a new tag. If an artifact was already released, treat it as immutable and issue a new patch version.
