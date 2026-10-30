# SW Tools repository conventions

## Delivery

The user wants completed code updates pushed to `mrkohkohnut/swtools` automatically, without a separate request each time.

- After each completed code change, run the existing tests, relevant syntax checks, and `git diff --check`.
- Review and stage only files belonging to the task. Never commit credentials, local account exports, raw replay captures, or deployment state.
- Commit verified changes and push to the current branch's configured upstream. Verify the remote branch SHA matches the local commit before reporting success.
- Do not force-push, change branches, merge unrelated work, or overwrite remote changes to make a push succeed. If authentication, branch protection, or remote divergence blocks delivery, report the blocker instead.
- This is an end-of-change delivery rule, not an unattended filesystem watcher or permission to publish unfinished edits.

## Checks

- `node test.js`
- `node --test rta-meta.test.js`
- `node --check app.js`
- `node --check sw.js`
- `node --check rta-meta.js`
- `node --check rta-meta-ui.js`
- `git diff --check`

## Hosting and privacy

The deployed static site uses an explicit public-file allowlist. Keep `data/account.json`, `.git`, collector state and raw replay payloads unserved. Account imports stay in the browser. No third-party RTA collector is currently enabled; do not imply that the draft RTA Meta interface has a live dataset.
