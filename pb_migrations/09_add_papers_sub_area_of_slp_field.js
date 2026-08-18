/// <reference path="../pb_data/types.d.ts" />
// Add `sub_area_of_slp` to `papers`: a JSON array of free-form strings, driven
// by a chip input on the frontend. Mirrors `area_of_slp` — deliberately a
// JSONField rather than a SelectField so the vocabulary is not pinned to a
// fixed enum (see the 13_convert_area_of_slp_to_json migration that used to
// exist before consolidation, which made exactly that change for area_of_slp).
//
// Additive migration: the deployed instance holds real review data, so
// migration history stays stable. See the append-only rule in CLAUDE.md.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("papers");

    collection.fields.add(
      new JSONField({
        name: "sub_area_of_slp",
        required: false,
      }),
    );

    app.save(collection);

    // Backfill existing rows with []. Adding a JSONField leaves existing
    // records holding null, not an empty array, so without this the papers
    // already in production would differ from freshly seeded ones and a
    // chip input mapping over the value would break on null.
    const records = app.findRecordsByFilter("papers", "", "", 0, 0);
    for (const record of records) {
      record.set("sub_area_of_slp", []);
      app.save(record);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("papers");

    collection.fields.removeByName("sub_area_of_slp");

    app.save(collection);
  },
);
