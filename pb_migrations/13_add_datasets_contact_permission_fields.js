/// <reference path="../pb_data/types.d.ts" />
// Add contact and permission tracking to `datasets` (issue #64):
//
//   contact_dates             json    array of ISO date strings, [] = never contacted
//   permission_to_reproduce   select  "" = unanswered | yes | no
//   permission_model_weights  select  "" = unanswered | yes | no
//
// `contact_dates` is a JSON array of "YYYY-MM-DD" strings rather than
// PocketBase's `date` type, which cannot represent a list — and fails silently
// if you try. A date field ignores maxSelect, accepts an array with HTTP 200
// and then stores "", and likewise swallows an unparseable string without an
// error. A JSON array stores the values verbatim.
//
// ISO ordering is deliberate: the strings sort chronologically as plain text,
// so "most recently contacted" is a max over the array with no parsing. The
// frontend can render them as DD.MM.YYYY. Entries are not validated, matching
// datasets.url and reproductions.url.
//
// This complements `correspondence`, which records the *state* of outreach
// (waiting / got a reply); these record *when* contact happened.
//
// Only contact_dates is backfilled: a JSONField leaves existing rows holding
// null, whereas the two SelectFields default to "" on their own. So this does
// write to every existing dataset row.
//
// Additive migration, per the append-only rule in CLAUDE.md.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("datasets");

    collection.fields.add(
      new JSONField({
        name: "contact_dates",
        required: false,
      }),
    );

    collection.fields.add(
      new SelectField({
        name: "permission_to_reproduce",
        required: false,
        maxSelect: 1,
        values: ["yes", "no"],
      }),
    );

    collection.fields.add(
      new SelectField({
        name: "permission_model_weights",
        required: false,
        maxSelect: 1,
        values: ["yes", "no"],
      }),
    );

    app.save(collection);

    const records = app.findRecordsByFilter("datasets", "", "", 0, 0);
    for (const record of records) {
      record.set("contact_dates", []);
      app.save(record);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("datasets");

    for (const name of [
      "contact_dates",
      "permission_to_reproduce",
      "permission_model_weights",
    ]) {
      collection.fields.removeByName(name);
    }

    app.save(collection);
  },
);
