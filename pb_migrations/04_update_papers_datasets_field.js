/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const datasetsCollection = app.findCollectionByNameOrId("datasets");
  const papersCollection = app.findCollectionByNameOrId("papers");

  papersCollection.fields.removeByName("datasets");
  papersCollection.fields.add(new RelationField({
    name: "datasets",
    collectionId: datasetsCollection.id,
    maxSelect: 9999,
  }));

  app.save(papersCollection);
}, (app) => {
  const papersCollection = app.findCollectionByNameOrId("papers");

  papersCollection.fields.removeByName("datasets");
  papersCollection.fields.add(new JSONField({
    name: "datasets",
  }));

  app.save(papersCollection);
});
