#!/usr/bin/env python3
"""
One-off ops script: enable "Sign in with Slack" (OpenID Connect) on the
`users` collection of a PocketBase instance.

Usage:
    python3 scripts/configure_oauth.py \
        --pb-url https://repro-sign-survey-backend.fly.dev \
        --email me@x.com --password <superuser-pw> \
        --client-id <slack-client-id> --client-secret <slack-client-secret>

Re-running is idempotent: it overwrites the oidc provider config. Note that it
replaces the entire providers list, not just the oidc slot, so any other OAuth2
provider configured on `users` would be wiped (Slack is the only one today).
"""

import argparse
import sys
import requests

# Slack's OpenID Connect endpoints. Configured under PocketBase's generic
# `oidc` provider slot (displayed to users as "Slack").
SLACK_PROVIDER = {
    "name": "oidc",
    "displayName": "Slack",
    "authURL": "https://slack.com/openid/connect/authorize",
    "tokenURL": "https://slack.com/api/openid.connect.token",
    "userInfoURL": "https://slack.com/api/openid.connect.userInfo",
    "pkce": True,
}


def parse_args():
    p = argparse.ArgumentParser(
        description="Configure the Slack (OIDC) OAuth2 provider on a PocketBase instance"
    )
    p.add_argument(
        "--pb-url", default="http://localhost:8090", help="PocketBase base URL"
    )
    p.add_argument("--email", required=True, help="Superuser email")
    p.add_argument("--password", required=True, help="Superuser password")
    p.add_argument("--client-id", required=True, help="Slack app OIDC client id")
    p.add_argument(
        "--client-secret", required=True, help="Slack app OIDC client secret"
    )
    return p.parse_args()


def authenticate(base_url: str, email: str, password: str) -> str:
    url = f"{base_url}/api/collections/_superusers/auth-with-password"
    resp = requests.post(
        url, json={"identity": email, "password": password}, timeout=10
    )
    if resp.status_code != 200:
        sys.exit(f"Authentication failed ({resp.status_code}): {resp.text}")
    token = resp.json().get("token")
    if not token:
        sys.exit(f"No token in auth response: {resp.text}")
    print(f"Authenticated as superuser ({email})")
    return token


def configure_provider(
    base_url: str, headers: dict, client_id: str, client_secret: str
):
    provider = dict(SLACK_PROVIDER, clientId=client_id, clientSecret=client_secret)
    payload = {"oauth2": {"enabled": True, "providers": [provider]}}
    resp = requests.patch(
        f"{base_url}/api/collections/users",
        headers=headers,
        json=payload,
        timeout=10,
    )
    if resp.status_code != 200:
        sys.exit(f"Failed to configure provider ({resp.status_code}): {resp.text}")
    print("OK: Slack OIDC provider configured on the users collection.")


def main():
    args = parse_args()
    base_url = args.pb_url.rstrip("/")
    token = authenticate(base_url, args.email, args.password)
    headers = {"Authorization": f"Bearer {token}"}
    print(f"Configuring Slack (oidc) OAuth2 provider on {base_url}...")
    configure_provider(base_url, headers, args.client_id, args.client_secret)


if __name__ == "__main__":
    main()
