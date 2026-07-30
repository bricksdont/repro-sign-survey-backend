/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const metricsCollection = app.findCollectionByNameOrId("metrics");
  const papersCollection = app.findCollectionByNameOrId("papers");

  papersCollection.fields.removeByName("metrics");
  papersCollection.fields.add(new RelationField({
    name: "metrics",
    collectionId: metricsCollection.id,
    maxSelect: 9999,
  }));

  app.save(papersCollection);
}, (app) => {
  const papersCollection = app.findCollectionByNameOrId("papers");

  papersCollection.fields.removeByName("metrics");
  papersCollection.fields.add(new JSONField({
    name: "metrics",
  }));

  app.save(papersCollection);
});
