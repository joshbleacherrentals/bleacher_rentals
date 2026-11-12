import re


def normalize_street(street: str | None) -> str:
    """Lowercase, punctuation dropped, whitespace collapsed. Empty for a missing street.

    "Same place" is decided on this text, because one building can sit in the Addresses table under
    several ids.
    """
    text = re.sub(r"[^a-z0-9\s]", " ", (street or "").lower())
    return re.sub(r"\s+", " ", text).strip()
