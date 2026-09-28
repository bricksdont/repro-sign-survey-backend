/// <reference path="../pb_data/types.d.ts" />
// Add language tracking to `datasets` (issue #66):
//
//   signed_languages  json  array of ISO 639-3 codes, [] = unspecified
//   spoken_languages  json  array of ISO 639-3 codes, [] = unspecified
//
// The issue asked for a single `languages` list. Split in review because most
// SLP datasets are bilingual — PHOENIX-2014-T pairs German Sign Language with
// written German — and a flat ["gsg", "deu"] records both while losing which
// is which. Two fields keep "all ASL datasets" and "all datasets with English
// text" as separate queries.
//
// PocketBase has no language-code type, so ISO 639-3 is a convention, not
// something the database enforces. 639-3 rather than 639-1 because the
// two-letter standard contains no sign languages at all: ASL is `ase`, DGS
// `gsg`, BSL `bfi`, LSF `fsl`. Note `check_papers.language` predates this and
// holds 639-1 ("en"); the two fields are deliberately different standards for
// different purposes.
//
// JSON arrays rather than a SelectField with a fixed vocabulary: 639-3 has
// ~7900 codes, and `area_of_slp` already had to be migrated from a 12-value
// select to a free-form JSONField for exactly this reason. Values are
// unvalidated, matching datasets.url and contact_dates.
//
// Both fields are backfilled with []. A JSONField leaves existing rows holding
// null, so this writes to every existing dataset row.
//
// Additive migration, per the append-only rule in CLAUDE.md.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("datasets");

    collection.fields.add(
      new JSONField({
        name: "signed_languages",
        required: false,
      }),
    );

    collection.fields.add(
      new JSONField({
        name: "spoken_languages",
        required: false,
      }),
    );

    app.save(collection);

    const records = app.findRecordsByFilter("datasets", "", "", 0, 0);
    for (const record of records) {
      record.set("signed_languages", []);
      record.set("spoken_languages", []);
      app.save(record);
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("datasets");

    collection.fields.removeByName("signed_languages");
    collection.fields.removeByName("spoken_languages");

    app.save(collection);
  },
);
