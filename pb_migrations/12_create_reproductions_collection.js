/// <reference path="../pb_data/types.d.ts" />
// `reproductions` collection: one reproduction attempt per paper (issue #58).
//
// A separate collection rather than reproduction_* fields on `papers`, because
// PocketBase access rules are per-record, not per-field. A second lock on
// `papers` could not have enabled concurrent editing: the existing updateRule
// gates every write to the record, so whoever held the review lock also
// blocked reproduction edits. Separate collections each get their own
// updateRule, so a reviewer editing a paper and someone editing its
// reproduction touch different records and never collide.
//
// Records are created lazily. A paper with no reproduction row *is* "not
// started", so nothing has to be backfilled or kept in sync as papers are
// added. The frontend can read the state in one request via the back-relation:
//
//     GET /api/collections/papers/records?expand=reproductions_via_paper
//
// `paper` is unique, so there is at most one reproduction per paper, and
// cascadeDelete is true: a reproduction without its paper is meaningless.
// (Contrast `datasets.assignees`, where cascade is deliberately off.)
//
// Not seedable: this is runtime data, so the collection is absent from
// seed.py's tables and has no seed_data file.
migrate(
  (app) => {
    const papers = app.findCollectionByNameOrId("papers");

    const collection = new Collection({
      name: "reproductions",
      type: "base",
      fields: [
        {
          name: "paper",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: papers.id,
          cascadeDelete: true,
        },
        {
          // Email address strings, matching datasets.assignees. Not a Relation
          // into `users`: that collection's listRule stops a reviewer token
          // from listing users to populate a picker.
          name: "assignees",
          type: "json",
          required: false,
        },
        {
          // "" should not occur in practice — a row only exists once a
          // reproduction has started — but the field is left optional for
          // consistency with every other select in this schema, and to avoid a
          // create-time failure if the client omits it.
          name: "status",
          type: "select",
          required: false,
          maxSelect: 1,
          values: ["in_progress", "finished"],
        },
        {
          // Array of URL strings, like datasets.url. Unvalidated.
          name: "url",
          type: "json",
          required: false,
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
      indexes: ["CREATE UNIQUE INDEX idx_reproductions_paper ON reproductions (paper)"],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      // Any authenticated reviewer may start a reproduction, as for
      // datasets/metrics. Deleting stays superuser-only; cascadeDelete already
      // removes a reproduction when its paper goes.
      createRule: '@request.auth.id != ""',
      updateRule: 'locked_by = "" || locked_by = @request.auth.id',
      deleteRule: null,
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("reproductions");
    app.delete(collection);
  },
);
