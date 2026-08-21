/// <reference path="../pb_data/types.d.ts" />
// Add `assignees` to `datasets` (issue #59): zero or more users responsible for
// chasing up a dataset. A multi-select Relation into the built-in `users`
// collection, optional and empty by default.
//
// maxSelect: 9999 because PocketBase treats null/0/1 as single-select — a
// multi-select relation needs an explicit value greater than 1.
//
// cascadeDelete is false (also the default, set here explicitly because the
// consequence is severe): deleting a user must detach them from the dataset,
// never delete the dataset itself.
//
// Additive migration, per the append-only rule in CLAUDE.md.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("datasets");
    const users = app.findCollectionByNameOrId("users");

    collection.fields.add(
      new RelationField({
        name: "assignees",
        collectionId: users.id,
        maxSelect: 9999,
        required: false,
        cascadeDelete: false,
      }),
    );

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("datasets");

    collection.fields.removeByName("assignees");

    app.save(collection);
  },
);
