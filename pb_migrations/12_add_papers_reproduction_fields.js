/// <reference path="../pb_data/types.d.ts" />
// Add the reproduction-tracking fields to `papers` (issue #58):
//
//   reproduction_assignees  json    array of email strings, [] = unassigned
//   reproduction_status     select  "" = not started | in_progress | finished
//   reproduction_url        json    array of URL strings, [] = none
//
// `reproduction_assignees` holds plain email strings rather than a Relation
// into `users`, matching `datasets.assignees` (issue #59). The `users`
// collection has a restrictive listRule, so a normal reviewer token cannot
// list users to populate a picker. The trade-off is that nothing validates an
// address against a real account.
//
// `reproduction_url` mirrors `datasets.url` / `metrics.url`: a JSON array, not
// PocketBase's `url` type, because that type holds a single value. Note this
// means the URLs are unvalidated.
//
// The two JSON fields are backfilled with []. Adding a JSONField leaves
// existing rows holding null rather than an empty array, so without this the
// papers already in the database would differ from freshly seeded ones and a
// UI mapping over the value would break on null. The select needs no backfill:
// PocketBase gives existing rows "" automatically.
//
// Additive migration, per the append-only rule in CLAUDE.md.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("papers");

    collection.fields.add(
      new JSONField({
        name: "reproduction_assignees",
        required: false,
      }),
    );

    collection.fields.add(
      new SelectField({
        name: "reproduction_status",
        required: false,
        maxSelect: 1,
        values: ["in_progress", "finished"],
      }),
    );

    collection.fields.add(
      new JSONField({
        name: "reproduction_url",
        required: false,
      }),
    );

    app.save(collection);

    const records = app.findRecordsByFilter("papers", "", "", 0, 0);
    for (const record of records) {
      record.set("reproduction_assignees", []);
      record.set("reproduction_url", []);
      app.save(record);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("papers");

    for (const name of [
      "reproduction_assignees",
      "reproduction_status",
      "reproduction_url",
    ]) {
      collection.fields.removeByName(name);
    }

    app.save(collection);
  },
);
