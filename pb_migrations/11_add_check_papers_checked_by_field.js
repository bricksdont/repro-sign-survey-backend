/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("check_papers");

  collection.fields.add(new TextField({
    name: "checked_by",
    required: false,
    max: 200
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("check_papers");

  collection.fields.removeByName("checked_by");

  app.save(collection);
});
