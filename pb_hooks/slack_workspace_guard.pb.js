/// <reference path="../pb_data/types.d.ts" />

// Restrict "Sign in with Slack" (the `oidc` provider configured by
// scripts/configure_oauth.py) to an allowlist of Slack workspaces. Slack's OIDC
// userInfo response carries a
// `https://slack.com/team_id` claim identifying the workspace; we reject any
// login whose team_id is not in SLACK_ALLOWED_TEAM_IDS (comma-separated, e.g.
// "T0123ABCD" or "T0123ABCD,T0456WXYZ").
onRecordAuthWithOAuth2Request((e) => {
  if (e.providerName === "oidc") {
    const allowed = ($os.getenv("SLACK_ALLOWED_TEAM_IDS") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const claims = (e.oAuth2User && e.oAuth2User.rawUser) || {};
    const teamId = claims["https://slack.com/team_id"];

    if (allowed.length === 0 || !allowed.includes(teamId)) {
      throw new ForbiddenError("This Slack workspace is not permitted to sign in.");
    }
  }

  e.next();
}, "users");
