/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "metrics",
    type: "base",
    fields: [
      {
        name: "name",
        type: "text",
        required: true,
        min: 1,
        max: 200,
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
      "CREATE UNIQUE INDEX idx_metrics_name ON metrics (name)",
    ],
    listRule: "@request.auth.id != \"\"",
    viewRule: "@request.auth.id != \"\"",
    createRule: "@request.auth.id != \"\"",
    updateRule: "locked_by = \"\" || locked_by = @request.auth.id",
    deleteRule: "",
  });

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("metrics");
  app.delete(collection);
});
