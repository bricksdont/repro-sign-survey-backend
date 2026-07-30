/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "check_papers",
    type: "base",
    fields: [
      {
        name: "paper_id",
        type: "text",
        required: true,
        min: 1,
        max: 200,
      },
      {
        name: "pdf_url",
        type: "url",
        required: false,
      },
      {
        name: "title",
        type: "text",
        required: false,
        max: 1000,
      },
      {
        name: "year",
        type: "number",
        required: false,
        min: 1900,
        max: 2100,
      },
      {
        name: "has_empirical_results",
        type: "select",
        required: false,
        maxSelect: 1,
        values: ["yes", "no"],
      },
      {
        name: "is_sign_language_processing",
        type: "select",
        required: false,
        maxSelect: 1,
        values: ["yes", "no"],
      },
      {
        name: "status",
        type: "select",
        required: false,
        maxSelect: 1,
        values: ["needs_check", "checked", "flagged"],
      },
      {
        name: "flag_reason",
        type: "text",
        required: false,
        max: 500,
      },
      {
        name: "language",
        type: "text",
        required: false,
        max: 20,
      },
      {
        name: "abstract",
        type: "text",
        required: false,
        max: 10000,
      },
      {
        name: "filters",
        type: "json",
        required: false,
      },
      {
        name: "filter_explanations",
        type: "json",
        required: false,
      },
      {
        name: "checked_by",
        type: "text",
        required: false,
        max: 200,
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
      "CREATE UNIQUE INDEX idx_check_papers_paper_id ON check_papers (paper_id)",
    ],
    listRule: "@request.auth.id != \"\"",
    viewRule: "@request.auth.id != \"\"",
    createRule: null,
    updateRule: "locked_by = \"\" || locked_by = @request.auth.id",
    deleteRule: null,
  });

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("check_papers");
  app.delete(collection);
});
