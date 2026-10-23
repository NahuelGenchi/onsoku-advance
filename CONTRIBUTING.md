# Contributing

Keep the work small, traceable, and honest about its current limitations.

## One work item, one delivery trail

1. **Start with an issue.** Reuse the issue that already owns the work, or open the work-item form. Record the goal, scope, completion criteria, dependencies, and milestone before editing files. Bugs, enhancements, documentation, research and repository operations are work items too.
2. **Create a new branch for the issue.** Every work item is developed on its own new branch, created from the latest `main`:

   ```sh
   git fetch origin
   git switch -c feat/4-rom-extractor origin/main
   ```

   Name it `<type>/<issue>-<slug>`. Types are `feat`, `fix`, `enh`, `docs`, `research` and `ops`. One branch holds one issue: never reuse a merged or existing branch for new work, and never mix two features on one branch. Use focused commits such as `feat: decode sprite palettes from the ROM (#4)`. Do not commit directly to `main`. Delete the branch after its PR merges.
3. **Open a linked PR.** Include a standalone `Closes #N` line for each completed, same-repository issue. Set the PR to the same milestone as its primary issue. Split cross-milestone changes into separate PRs. Use `Refs #N` for unfinished parent or related work; it does not replace a closing reference to the scoped issue.
4. **Record the outcome.** Describe exactly what changed, which checks ran, and what was not run. Close the issue only when its stated scope is complete.

For non-file operations (repository settings, releases), put sanitized commands and results in the issue. When an operation produces no code change, deliver its lasting decision through a small documentation PR instead of an empty PR.

## What belongs where

**Issues** own scope, decisions, blockers, dependencies, and outcomes. **Milestones** group outcomes. **PRs** own the proposed diff and delivery record. **Documentation** owns reusable knowledge, not duplicate task status.

Every meaningful action must stay discoverable through that chain. Routine reads do not need separate issues. Split genuinely new scope into a linked issue instead of expanding a task indefinitely.

## Checks

Source checks establish that the code builds or passes its tests, nothing more. Browser checks run the game: name the browser and version, the scene and the input, and attach what the run produced.

Every screenshot, frame or clip in an issue or PR comes from a recorded run of this project's build, with the contributor's own ROM copy. Never present an invented, reconstructed or approximated frame as a capture, and never pull in footage from another project or from the original game without saying so.

## Private data

ROMs, save files, extracted game assets, sound dumps and build output stay out of commits. The ignore rules are an accidental-staging guard, not permission to collect that data. If a secret is exposed, stop sharing it and revoke it.

## License

The project's own files are licensed under GPL-3.0-or-later ([LICENSE](LICENSE)), and contributions are accepted under the same license. The SAT-R decompilation is a research reference only: none of its code or data is copied into this repository.

Sonic Advance and everything inside the ROM belong to Sega. This is an unofficial fan project, not affiliated with or endorsed by Sega or Sonic Team. Anything bundled from elsewhere, such as fonts or sounds, needs a license compatible with GPL-3.0-or-later, its notices kept next to the files, and a line in the README credits.

## Documentation standard

Write clear English. Prefer specific paths and actionable instructions. Distinguish **implemented**, **planned**, **blocked**, and **unknown**. Do not invent commands, measurements, frame rates or compatibility. Update documentation in the same PR as the change it describes. Keep `README.md` approachable.

## Tracking automation is not branch protection

The metadata workflow assigns missing milestones and labels PRs that need tracking. It does not run checks or block pushes or merges. See [docs/TRACKING.md](docs/TRACKING.md).
