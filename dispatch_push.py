"""Opt-in Web Push for the installed Dispatch app."""
import base64
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from functools import lru_cache
import hashlib
import hmac
import json
import logging
import os
import re
from urllib.parse import urlsplit

import db

P256_ORDER = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
worker = ThreadPoolExecutor(max_workers=2, thread_name_prefix="dispatch-push")


@lru_cache(maxsize=1)
def vapid():
    secret = os.environ.get("DISPATCH_PUSH_SECRET") or os.environ.get("QUOTE_SIGNING_SECRET", "")
    if len(secret) < 32:
        return None
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from py_vapid import Vapid
    except ImportError:
        return None
    digest = hmac.digest(secret.encode(), b"GA Dispatch Web Push v1", hashlib.sha256)
    scalar = int.from_bytes(digest, "big") % (P256_ORDER - 1) + 1
    return Vapid(ec.derive_private_key(scalar, ec.SECP256R1()))


def public_key():
    key = vapid()
    if not key:
        return None
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
    raw = key.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def store(subscription, *, scope="dispatch"):
    if not vapid():
        return {"error": "Dispatch push needs to be enabled on the server."}, 503
    endpoint = subscription.get("endpoint")
    keys = subscription.get("keys")
    if not isinstance(endpoint, str) or len(endpoint) > 2048 or not isinstance(keys, dict):
        return {"error": "Invalid push subscription."}, 400
    try:
        url = urlsplit(endpoint)
        host = url.hostname or ""
        allowed_host = host in {"fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"} or host.endswith(".push.apple.com")
        valid_endpoint = url.scheme == "https" and allowed_host and url.port in (None, 443) and not url.username and not url.password and not url.fragment and url.path.startswith("/")
    except ValueError:
        valid_endpoint = False
    def valid_key(name, length):
        value = keys.get(name)
        return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{%d}" % length, value)
    if not valid_endpoint or not valid_key("p256dh", 87) or not valid_key("auth", 22):
        return {"error": "Invalid push subscription."}, 400
    subscription = {"endpoint": endpoint, "keys": {name: keys[name] for name in ("p256dh", "auth")}}
    with closing(db.get_connection()) as conn, conn:
        conn.execute("REPLACE INTO dispatch_push_subscriptions (endpoint, subscription, scope) VALUES (?, ?, ?)",
                     (endpoint, json.dumps(subscription), scope))
    return {"success": True}, 200


def notify(message, *, scope="dispatch"):
    if vapid():
        worker.submit(deliver, message, scope=scope)


def deliver(message, *, scope="dispatch"):
    import requests
    from pywebpush import WebPushException, webpush

    with closing(db.get_connection()) as conn, requests.Session() as session:
        subscriptions = conn.execute("SELECT endpoint, subscription FROM dispatch_push_subscriptions WHERE scope = ?", (scope,)).fetchall()
        session.max_redirects = 0
        for endpoint, subscription in subscriptions:
            try:
                webpush(
                    json.loads(subscription), data=json.dumps({"body": message, "chauffeur": scope != "dispatch"}),
                    vapid_private_key=vapid(), vapid_claims={"sub": "mailto:enquiries@gachauffeurs.co.uk"},
                    requests_session=session, headers={"Urgency": "high"}, ttl=900, timeout=5,
                )
            except WebPushException as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status in (404, 410):
                    with conn:
                        conn.execute("DELETE FROM dispatch_push_subscriptions WHERE endpoint = ? AND subscription = ?", (endpoint, subscription))
                else:
                    logging.warning("Dispatch push provider returned status %s", status)
            except (requests.RequestException, ValueError):
                logging.warning("Could not deliver a Dispatch push notification.")
