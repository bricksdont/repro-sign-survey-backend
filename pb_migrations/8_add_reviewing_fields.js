/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("papers");

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

  collection.fields.add(new SelectField({
    name: "main_experiment_has_ranking",
    required: false,
    maxSelect: 1,
    values: ["yes", "no"]
  }));

  collection.fields.add(new TextField({
    name: "what_to_reproduce",
    required: false,
    max: 1000
  }));

  collection.fields.add(new TextField({
    name: "compute_requirements",
    required: false,
    max: 1000
  }));

  collection.fields.add(new TextField({
    name: "textual_conclusion",
    required: false,
    max: 2000
  }));

  collection.fields.add(new SelectField({
    name: "includes_human_evaluation",
    required: false,
    maxSelect: 1,
    values: ["yes", "no"]
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("papers");

  for (const name of [
    "area_of_slp",
    "main_experiment_has_ranking",
    "what_to_reproduce",
    "compute_requirements",
    "textual_conclusion",
    "includes_human_evaluation"
  ]) {
    collection.fields.removeByName(name);
  }

  app.save(collection);
});
