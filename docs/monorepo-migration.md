# Monorepo migration record

The workspace imports these main commits without rewriting history.

| Source | Commit | New directory |
| --- | --- | --- |
| `LatteLab/brewroom` | `de1fb1de9c9b4f57866199a45edcaa1c14b1247d` | `apps/portal` |
| `LatteLab/cafe` | `cecbfc52defeda802792d056f7d0ea6f3f2c952f` | `apps/cafe` |

Commit `21a277fea20ed6010ef336b271976734f5affccb` moves the portal without changing content. Commit `df29f747a4dce335c9095dcf2580834815f46e14` imports Cafe with a non-squashed subtree merge. Both original trees were compared with their imported directories before workspace edits. Old commits retain their original paths and IDs.

Run `sh scripts/verify-migration.sh` in a full clone to repeat the history and source-tree checks. Merge this PR with a merge commit; squash/rebase merging would discard imported ancestry.

Cafe's npm lockfile was converted with `pnpm import` and combined with the portal lockfile. Shared transitive snapshots were consolidated where the original lockfiles selected different children for the same package version. Both apps retain their Next.js and React runtime versions. React type definitions are aligned to avoid incompatible global React types in the shared dependency tree. The workspace declares the form resolver's missing Zod peer so it uses the portal's Zod version. The portal's existing render-purity lint error was reproduced on main and fixed by giving the sidebar skeleton a stable width.

## Existing work

Cafe's uncommitted files and feature worktrees were excluded and left untouched. Source Git refs and refreshed remote refs were backed up before importing. No original repository was deleted or archived.

[PR #5, Add event photos and mailing system](https://github.com/LatteLab/brewroom/pull/5), remains separate. Its remote head at migration start was `73b49d5`. Before merging that work, create a follow-up branch from monorepo main and merge its original feature branch. Resolve renamed files under `apps/portal`, and explicitly move newly added root files there too. Rename detection cannot place every added file automatically. Keep root workspace configuration, incorporate dependency changes into the combined lockfile, and verify its schema and services separately. Preserve the original feature branch until that work is verified.

Git history does not migrate Cafe's issues, pull requests, or repository settings. Keep the source repository available for reference. Production cutover follows [deployment.md](deployment.md).

## Verification

- Both source commits remain ancestors and both imported trees exactly match their sources at the import commit.
- Frozen pnpm installation, both typechecks, both production builds, and all four Cafe tests pass locally on Node 24.10.0 with pnpm 10.24.0.
- Lint passes with five preexisting portal warnings.
- Local production browser checks cover Cafe navigation, gallery filtering, load-more, photo dialog and Escape/focus restoration, and mobile navigation. Both apps fit a 390px viewport.
- Portal login renders and unauthenticated `/admin` and `/user` visits redirect to login. Builds and browser checks use non-production placeholders; real OAuth, database, storage, and email operations remain unverified.
- Vercel configuration and deployed previews remain for the manual cutover.
