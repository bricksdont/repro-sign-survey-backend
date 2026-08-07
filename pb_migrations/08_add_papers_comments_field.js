/// <reference path="../pb_data/types.d.ts" />
// Add a free-form `comments` field to `papers`.
//
// Additive migration rather than an edit to 01_create_papers_collection.js:
// the deployed instance now holds real review data, so migration history has
// to stay stable. Editing 01 would have no effect on a database that already
// applied it, leaving production without the field.
//
// max: 1000 matches the existing `comments` fields on `datasets` and `metrics`.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("papers");

    collection.fields.add(
      new TextField({
        name: "comments",
        required: false,
        max: 1000,
      }),
    );

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("papers");

    collection.fields.removeByName("comments");

    app.save(collection);
  },
);
