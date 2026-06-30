/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("papers");

  collection.fields.addAt(collection.fields.length, new SelectField({
    name: "has_empirical_results",
    maxSelect: 1,
    values: ["yes", "no"],
  }));

  collection.fields.addAt(collection.fields.length, new SelectField({
    name: "is_sign_language_processing",
    maxSelect: 1,
    values: ["yes", "no"],
  }));

  collection.fields.addAt(collection.fields.length, new SelectField({
    name: "check_status",
    maxSelect: 1,
    values: ["needs_check", "checked", "flagged"],
  }));

  collection.fields.addAt(collection.fields.length, new TextField({
    name: "check_flag_reason",
    max: 500,
  }));

  collection.fields.addAt(collection.fields.length, new TextField({
    name: "check_locked_by",
    max: 200,
  }));

  collection.fields.addAt(collection.fields.length, new DateField({
    name: "check_locked_at",
  }));

  app.save(collection);

  // Backfill check_status on all existing records
  const records = app.findRecordsByFilter("papers", "check_status = ''", "", 0, 0);
  for (const record of records) {
    record.set("check_status", "needs_check");
    app.save(record);
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("papers");

  for (const name of [
    "has_empirical_results",
    "is_sign_language_processing",
    "check_status",
    "check_flag_reason",
    "check_locked_by",
    "check_locked_at",
  ]) {
    collection.fields.removeByName(name);
  }

  return app.save(collection);
});
