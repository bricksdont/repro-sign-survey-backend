/// <reference path="../pb_data/types.d.ts" />
// Release abandoned edit locks.
//
// The `updateRule` on the locked collections is:
//
//     locked_by = "" || locked_by = @request.auth.id
//
// which has no time component, so a lock survives a crashed tab, a lost
// network connection or a closed laptop — anything that stops the frontend's
// `beforeunload` release from firing. The record then stays locked for every
// other user forever. Observed in production: locks held for 77 and 91 hours
// (issue #52).
//
// The obvious fix — a time comparison in the rule itself — is not expressible.
// PocketBase's filter DSL has no arithmetic, so `locked_at < @now - 1800` is
// rejected outright with `invalid number "-"`. `@now` alone would let anyone
// steal any lock instantly, and `@todayStart` is a calendar boundary rather
// than a rolling window (a lock taken at 23:59 would expire a minute later).
//
// So the cutoff is computed here in JS and passed to the filter as a literal,
// which sidesteps the DSL limitation entirely. The `updateRule` is left alone:
// a lock is still only reclaimable once this job has actually released it, so
// this adds no new way for one user to seize another's live lock.
//
// This runs in-process. It is dependable only because the machine is kept warm
// (`min_machines_running = 1` in fly.toml, issue #51) — with the previous
// auto-stop-on-idle config the cron would not have fired during exactly the
// quiet periods when abandoned locks matter most. Do not reintroduce
// auto-stop without moving this to an external scheduler.
//
// NOTE: everything the handler needs is declared *inside* it. PocketBase runs
// hook handlers in a separate pooled JS VM that does not share this file's
// scope, so a handler referencing a file-level `const` silently never runs —
// it loads without error and simply never fires. The same pattern is used in
// slack_workspace_guard.pb.js.

cronAdd("clear_stale_locks", "*/5 * * * *", () => {
  // Server-side authority for lock expiry. The frontend applies its own,
  // shorter, client-side expiry (30 min) purely for UI purposes; the margin
  // between the two avoids reaping a lock its holder still believes is live.
  // An actively edited lock is kept fresh by the frontend's heartbeat, so in
  // practice only genuinely abandoned locks ever reach this age.
  const lockTtlMinutes = 35;

  // Every collection carrying locked_by / locked_at.
  const lockedCollections = [
    "papers",
    "check_papers",
    "datasets",
    "metrics",
    "reproductions",
  ];

  // PocketBase stores dates as "YYYY-MM-DD HH:MM:SS.sssZ".
  const cutoff = new Date(Date.now() - lockTtlMinutes * 60 * 1000)
    .toISOString()
    .replace("T", " ");

  for (const name of lockedCollections) {
    // Each collection is isolated: a failure on one must not stop the rest.
    try {
      // locked_at != "" guards against a set locked_by with an empty
      // locked_at, where "" would otherwise sort below any cutoff.
      const stale = $app.findRecordsByFilter(
        name,
        'locked_by != "" && locked_at != "" && locked_at < {:cutoff}',
        "",
        0,
        0,
        { cutoff: cutoff },
      );

      if (!stale.length) {
        continue;
      }

      let released = 0;
      for (const record of stale) {
        try {
          record.set("locked_by", "");
          record.set("locked_at", "");
          $app.save(record);
          released++;
        } catch (err) {
          console.log(
            `[stale-lock-reaper] failed to release ${name}/${record.id}: ${err}`,
          );
        }
      }
      console.log(
        `[stale-lock-reaper] released ${released}/${stale.length} lock(s) in ${name} older than ${lockTtlMinutes}m`,
      );
    } catch (err) {
      console.log(`[stale-lock-reaper] error scanning ${name}: ${err}`);
    }
  }
});
