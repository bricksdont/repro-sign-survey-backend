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
  for (const name of ["datasets", "metrics"]) {
    const col = app.findCollectionByNameOrId(name);
    col.deleteRule = null;
    app.save(col);
  }
}, (app) => {
  for (const name of ["papers", "check_papers"]) {
    const col = app.findCollectionByNameOrId(name);
    col.createRule = "";
    col.deleteRule = "";
    app.save(col);
  }
  for (const name of ["datasets", "metrics"]) {
    const col = app.findCollectionByNameOrId(name);
    col.deleteRule = "";
    app.save(col);
  }
});
