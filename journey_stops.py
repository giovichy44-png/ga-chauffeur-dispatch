"""Ordered intermediate destinations shared by checkout and booking amendments."""
import json
import re


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

def split_return_stop(pickup, stops):
    """A final stop at the original pickup is the return leg."""
    def address_key(address):
        return re.sub(r"[^\w]", "", address.casefold())
    if not stops:
        return stops, None
    first_name = pickup.split(",", 1)[0].strip().casefold()
    last_name = stops[-1].split(",", 1)[0].strip().casefold()
    same_hotel = first_name == last_name and bool(re.search(r"\bhotel\b", first_name))
    if same_hotel or address_key(stops[-1]) == address_key(pickup):
        return stops[:-1], stops[-1]
    return stops, None
