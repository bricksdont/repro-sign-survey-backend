/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Remove checking fields that were added to papers by migration 2
  const papers = app.findCollectionByNameOrId("papers");
  for (const name of [
    "has_empirical_results",
    "is_sign_language_processing",
    "check_status",
    "check_flag_reason",
    "check_locked_by",
    "check_locked_at",
  ]) {
    papers.fields.removeByName(name);
  }
  app.save(papers);

  // Create the check_papers collection
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
        name: "check_status",
        type: "select",
        required: false,
        maxSelect: 1,
        values: ["needs_check", "checked", "flagged"],
      },
      {
        name: "check_flag_reason",
        type: "text",
        required: false,
        max: 500,
      },
      {
        name: "check_locked_by",
        type: "text",
        required: false,
        max: 200,
      },
      {
        name: "check_locked_at",
        type: "date",
        required: false,
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_check_papers_paper_id ON check_papers (paper_id)",
    ],
    listRule: "@request.auth.id != \"\"",
    viewRule: "@request.auth.id != \"\"",
    createRule: "",
    updateRule: "check_locked_by = \"\" || check_locked_by = @request.auth.id",
    deleteRule: "",
  });

  app.save(collection);
}, (app) => {
  const check = app.findCollectionByNameOrId("check_papers");
  app.delete(check);

  const papers = app.findCollectionByNameOrId("papers");
  papers.fields.addAt(papers.fields.length, new SelectField({
    name: "has_empirical_results",
    maxSelect: 1,
    values: ["yes", "no"],
  }));
  papers.fields.addAt(papers.fields.length, new SelectField({
    name: "is_sign_language_processing",
    maxSelect: 1,
    values: ["yes", "no"],
  }));
  papers.fields.addAt(papers.fields.length, new SelectField({
    name: "check_status",
    maxSelect: 1,
    values: ["needs_check", "checked", "flagged"],
  }));
  papers.fields.addAt(papers.fields.length, new TextField({
    name: "check_flag_reason",
    max: 500,
  }));
  papers.fields.addAt(papers.fields.length, new TextField({
    name: "check_locked_by",
    max: 200,
  }));
  papers.fields.addAt(papers.fields.length, new DateField({
    name: "check_locked_at",
  }));
  app.save(papers);
});
