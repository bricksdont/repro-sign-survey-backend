/// <reference path="../pb_data/types.d.ts" />
// Add `assignees` to `datasets` (issue #59): who is responsible for chasing up
// a dataset, stored as a JSON array of email address strings.
//
// Deliberately NOT a Relation into `users`, though that was the first
// implementation. The `users` collection has a restrictive listRule, so a
// normal reviewer token cannot list users to populate an assignee picker —
// which made a relation impractical for the frontend. Plain strings keep the
// field usable without loosening access to the user table.
//
// The trade-off is that nothing validates an address against a real account;
// a typo silently produces an assignee who does not exist.
//
// Existing rows are backfilled with []. Adding a JSONField leaves them holding
// null rather than an empty array (unlike a SelectField or RelationField), so
// without this the datasets already in the database would differ from freshly
// seeded ones and a UI mapping over the value would break on null.
//
// Additive migration, per the append-only rule in CLAUDE.md.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("datasets");

    collection.fields.add(
      new JSONField({
        name: "assignees",
        required: false,
      }),
    );

    app.save(collection);

    const records = app.findRecordsByFilter("datasets", "", "", 0, 0);
    for (const record of records) {
      record.set("assignees", []);
      app.save(record);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("datasets");

    collection.fields.removeByName("assignees");

    app.save(collection);
  },
);
