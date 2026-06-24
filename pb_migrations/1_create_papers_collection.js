/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "papers",
    type: "base",
    fields: [
      {
        name: "paper_id",
        type: "text",
        required: true,
        min: 1,
        max: 200,
        pattern: ""
      },
      {
        name: "pdf_url",
        type: "url",
        required: false
      },
      {
        name: "title",
        type: "text",
        required: false,
        max: 1000
      },
      {
        name: "year",
        type: "number",
        required: false,
        min: 1900,
        max: 2100
      },
      {
        name: "venue",
        type: "text",
        required: false,
        max: 100
      },
      {
        name: "peer_reviewed",
        type: "bool",
        required: false
      },
      {
        name: "code_repos",
        type: "json",
        required: false
      },
      {
        name: "datasets",
        type: "json",
        required: false
      },
      {
        name: "metrics",
        type: "json",
        required: false
      },
      {
        name: "status",
        type: "select",
        required: false,
        values: ["needs_review", "final", "flagged", "rejected"],
        maxSelect: 1
      },
      {
        name: "flag_reason",
        type: "text",
        required: false,
        max: 500
      },
      {
        name: "rejection_reason",
        type: "text",
        required: false,
        max: 500
      },
      {
        name: "locked_by",
        type: "text",
        required: false,
        max: 200
      },
      {
        name: "locked_at",
        type: "date",
        required: false
      }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_papers_paper_id ON papers (paper_id)"
    ],
    listRule: "@request.auth.id != \"\"",
    viewRule: "@request.auth.id != \"\"",
    createRule: "",
    updateRule: "locked_by = \"\" || locked_by = @request.auth.id",
    deleteRule: ""
  });

  app.save(collection);

}, (app) => {
  const collection = app.findCollectionByNameOrId("papers");
  app.delete(collection);
});
