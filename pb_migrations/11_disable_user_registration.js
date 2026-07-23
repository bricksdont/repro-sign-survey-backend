/// <reference path="../pb_data/types.d.ts" />
// Disable self-service registration on `users`.
//
// The stock createRule was "" (public), so anyone could POST to
// /api/collections/users/records and create an account.
//
// We can't use null here: PocketBase performs OAuth2 sign-up by issuing an
// *internal* POST /api/collections/users/records, so null would also block
// "Sign in with Slack" for anyone who doesn't already have an account.
// `@request.context` distinguishes the two — it is "oauth2" only for that
// internal request and "default" for a direct API call.
//
// Superusers bypass API rules entirely, so admin-dashboard creation, the
// curl recipe in the README and `seed.py --create-users` are unaffected.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("users");

    collection.createRule = '@request.context = "oauth2"';

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("users");

    collection.createRule = "";

    app.save(collection);
  },
);
