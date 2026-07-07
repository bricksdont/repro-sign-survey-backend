/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "datasets",
    type: "base",
    fields: [
      {
        name: "name",
        type: "text",
        required: true,
        min: 1,
        max: 500,
      },
      {
        name: "license",
        type: "text",
        required: false,
        max: 200,
      },
      {
        name: "url",
        type: "json",
        required: false,
      },
      {
        name: "available",
        type: "select",
        required: false,
        maxSelect: 1,
        values: ["yes", "no"],
      },
      {
        name: "comments",
        type: "text",
        required: false,
        max: 1000,
      },
      {
        name: "locked_by",
        type: "text",
        required: false,
        max: 200,
      },
      {
        name: "locked_at",
        type: "date",
        required: false,
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_datasets_name ON datasets (name)",
    ],
    listRule: "@request.auth.id != \"\"",
    viewRule: "@request.auth.id != \"\"",
    createRule: "@request.auth.id != \"\"",
    updateRule: "locked_by = \"\" || locked_by = @request.auth.id",
    deleteRule: "",
  });

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("datasets");
  app.delete(collection);
});
