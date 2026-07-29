/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("papers");
  const records = app.findRecordsByFilter("papers", "", "", 0, 0);
  const previous = {};
  for (const record of records) previous[record.id] = record.get("area_of_slp");

  collection.fields.removeByName("area_of_slp");
  collection.fields.add(new JSONField({
    name: "area_of_slp",
    required: false
  }));
  app.save(collection);

  for (const record of records) {
    record.set("area_of_slp", previous[record.id] || []);
    app.save(record);
  }
}, (app) => {
  const collection = app.findCollectionByNameOrId("papers");
  const records = app.findRecordsByFilter("papers", "", "", 0, 0);
  const previous = {};
  for (const record of records) previous[record.id] = record.get("area_of_slp");

  collection.fields.removeByName("area_of_slp");
  collection.fields.add(new SelectField({
    name: "area_of_slp",
    required: false,
    maxSelect: 12,
    values: [
      "Translation",
      "Recognition",
      "Segmentation / tokenization",
      "Alignment",
      "Signing detection",
      "Generation / production",
      "Unsupervised / representation learning",
      "Spotting / glossing",
      "Transcription",
      "Language identification",
      "Retrieval",
      "Avatar systems"
    ]
  }));
  app.save(collection);

  for (const record of records) {
    const prev = Array.isArray(previous[record.id]) ? previous[record.id] : [];
    record.set("area_of_slp", prev);
    app.save(record);
  }
});
