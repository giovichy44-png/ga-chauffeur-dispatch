"""Ordered intermediate destinations shared by checkout and booking amendments."""
import json
import re


def validate(value):
    if not isinstance(value, list):
        raise ValueError("Enter stops as an ordered list of addresses.")
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


def confirmation_legs(pickup, dropoff, stops):
    """Return customer-facing leg labels in the order the chauffeur visits them."""
    intermediate, return_stop = (list(stops), None) if dropoff.casefold().strip() == "as directed" else split_return_stop(pickup, list(stops))
    legs = [(f"Stop {index}", address) for index, address in enumerate(intermediate, 1)]
    if return_stop:
        legs.append((f"Stop {len(legs) + 1}", dropoff))
        legs.append(("Final destination", return_stop))
    else:
        legs.append(("Destination", dropoff))
    return legs, bool(return_stop)
