/// <reference path="../pb_data/types.d.ts" />
// Fix: "" was used as the superuser-only sentinel but PocketBase treats it as
// "public" (no filter). null is the correct value to block regular-user access.
migrate((app) => {
  for (const name of ["papers", "check_papers"]) {
    const col = app.findCollectionByNameOrId(name);
    col.createRule = null;
    col.deleteRule = null;
    app.save(col);
  }
  const datasets = app.findCollectionByNameOrId("datasets");
  datasets.deleteRule = null;
  app.save(datasets);
}, (app) => {
  for (const name of ["papers", "check_papers"]) {
    const col = app.findCollectionByNameOrId(name);
    col.createRule = "";
    col.deleteRule = "";
    app.save(col);
  }
  const datasets = app.findCollectionByNameOrId("datasets");
  datasets.deleteRule = "";
  app.save(datasets);
});
