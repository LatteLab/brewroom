# Monorepo migration record

This is the historical import and cutover record. The cutover is complete. Use [deployment.md](deployment.md) for current releases and [Portal database migrations](../apps/portal/docs/database-migrations.md) for schema changes.

The workspace imports these main commits without rewriting history.

| Source | Commit | New directory |
| --- | --- | --- |
| `LatteLab/brewroom` | `de1fb1de9c9b4f57866199a45edcaa1c14b1247d` | `apps/portal` |
| `LatteLab/cafe` | `cecbfc52defeda802792d056f7d0ea6f3f2c952f` | `apps/cafe` |

Commit `21a277fea20ed6010ef336b271976734f5affccb` moves the portal without changing content. Commit `df29f747a4dce335c9095dcf2580834815f46e14` imports Cafe with a non-squashed subtree merge. Both original trees were compared with their imported directories before workspace edits. Old commits retain their original paths and IDs.

Run `sh scripts/verify-migration.sh` in a full clone to repeat the history and source-tree checks. The migration PR used a merge commit to preserve the imported ancestry.

Cafe's npm lockfile was converted with `pnpm import` and combined with the portal lockfile. Shared transitive snapshots were consolidated where the original lockfiles selected different children for the same package version. Both apps retain their Next.js and React runtime versions. React type definitions are aligned to avoid incompatible global React types in the shared dependency tree. The workspace declares the form resolver's missing Zod peer so it uses the portal's Zod version. The portal's existing render-purity lint error was reproduced on main and fixed by giving the sidebar skeleton a stable width.

## Existing work

Cafe's uncommitted files and feature worktrees were excluded and left untouched. Source Git refs and refreshed remote refs were backed up before importing. No original repository was deleted or archived.

At migration start, [PR #5, Add event photos and mailing system](https://github.com/LatteLab/brewroom/pull/5), was separate at remote head `73b49d5`. The integration instructions recorded at that point were to create a follow-up branch from monorepo main, merge its original feature branch, and resolve files under `apps/portal`. Added root files require explicit placement. Keep root workspace configuration, combine dependency changes in the root lockfile, and verify schema and services separately. Check the PR's current status before using these historical instructions.

Git history does not migrate Cafe's issues, pull requests, or repository settings. Keep the source repository available for reference. Production cutover follows [deployment.md](deployment.md).

## Verification

- Both source commits remain ancestors and both imported trees exactly match their sources at the import commit.
- Frozen pnpm installation, both typechecks, both production builds, and all four Cafe tests pass locally on Node 24.10.0 with pnpm 10.24.0.
- Lint passes with five preexisting portal warnings.
- Local production browser checks cover Cafe navigation, gallery filtering, load-more, photo dialog and Escape/focus restoration, and mobile navigation. Both apps fit a 390px viewport.
- Portal login renders and unauthenticated `/admin` and `/user` visits redirect to login. Builds and browser checks use non-production placeholders; real OAuth, database, storage, and email operations remain unverified.
- Vercel configuration and deployed previews were pending at this original verification checkpoint. This does not state their current status.
