/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("check_papers");

  collection.fields.add(new TextField({
    name: "language",
    required: false,
    max: 20
  }));

  collection.fields.add(new TextField({
    name: "abstract",
    required: false,
    max: 10000
  }));

  collection.fields.add(new JSONField({
    name: "filters"
  }));

  collection.fields.add(new JSONField({
    name: "filter_explanations"
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("check_papers");

  for (const name of ["language", "abstract", "filters", "filter_explanations"]) {
    collection.fields.removeByName(name);
  }

  app.save(collection);
});
