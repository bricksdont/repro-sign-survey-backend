/// <reference path="../pb_data/types.d.ts" />
// Add `on_modal` and `correspondence` to `datasets` (issue #56).
//
// Both follow the existing `available` pattern: a non-required select whose
// enum holds only the real answers, with the empty string standing for "not
// answered yet". That keeps the unanswered state representable without adding
// a sentinel enum member, and means existing records need no backfill — they
// already read as unanswered.
//
//   on_modal       ""  = not answered   | yes | no
//   correspondence ""  = not contacted  | contacted_waiting | contacted_got_reply
//
// Additive migration, per the append-only rule in CLAUDE.md.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("datasets");

    collection.fields.add(
      new SelectField({
        name: "on_modal",
        required: false,
        maxSelect: 1,
        values: ["yes", "no"],
      }),
    );

    collection.fields.add(
      new SelectField({
        name: "correspondence",
        required: false,
        maxSelect: 1,
        values: ["contacted_waiting", "contacted_got_reply"],
      }),
    );

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("datasets");

    collection.fields.removeByName("on_modal");
    collection.fields.removeByName("correspondence");

    app.save(collection);
  },
);
