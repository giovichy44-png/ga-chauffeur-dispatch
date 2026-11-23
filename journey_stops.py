"""Ordered intermediate destinations shared by checkout and booking amendments."""
import json


def validate(value):
    if not isinstance(value, list) or len(value) > 5:
        raise ValueError("You can add up to five stops.")
    addresses = []
    for address in value:
        if not isinstance(address, str) or not address.strip() or len(address.strip()) > 500:
            raise ValueError("Enter a valid address for each stop.")
        addresses.append(address.strip())
    return addresses


def load(value):
    try:
        return validate(json.loads(value or "[]") if isinstance(value, (str, type(None))) else value)
    except ValueError:
        return []
