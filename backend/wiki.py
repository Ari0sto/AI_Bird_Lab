
"""Wikipedia article + exact Wikidata claims; missing values stay missing."""

import logging
import re

import httpx

from .settings import NOT_FOUND


# ============================================================
# Configuration
# ============================================================

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"

HEADERS = {
    "User-Agent": "AIBirdLab/1.0 (xiyamoc883@ensproxy.com)"
}

QID_RE = re.compile(r"^Q\d+$")

logger = logging.getLogger(__name__)


# ============================================================
# Default information
# ============================================================

def empty_info() -> dict:
    return {
        "scientific_name": NOT_FOUND,
        "family": NOT_FOUND,
        "range": NOT_FOUND,
        "diet": NOT_FOUND,
        "description": NOT_FOUND,
        "wikipedia_url": None,
        "wikidata_url": None
    }


# ============================================================
# Wikidata claims
# ============================================================

def claims(entity: dict, prop: str) -> list[str]:
    values = []

    for statement in entity.get("claims", {}).get(prop, []):
        if statement.get("rank") == "deprecated":
            continue

        value = (
            statement.get("mainsnak", {})
            .get("datavalue", {})
            .get("value")
        )

        if (
            isinstance(value, dict)
            and isinstance(value.get("id"), str)
            and QID_RE.fullmatch(value["id"])
        ):
            values.append(value["id"])

    return values


def claim_string(entity: dict, prop: str) -> str | None:
    for statement in entity.get("claims", {}).get(prop, []):
        if statement.get("rank") == "deprecated":
            continue

        value = (
            statement.get("mainsnak", {})
            .get("datavalue", {})
            .get("value")
        )

        if isinstance(value, str) and value.strip():
            return value.strip()

    return None


# ============================================================
# Wikidata requests
# ============================================================

async def entity_data(
    client: httpx.AsyncClient,
    qid: str
) -> dict:

    response = await client.get(
        WIKIDATA_API,
        params={
            "action": "wbgetentities",
            "ids": qid,
            "props": "claims|labels",
            "format": "json"
        }
    )

    response.raise_for_status()

    return (
        response.json()
        .get("entities", {})
        .get(qid, {})
    )


async def labels_for(
    client: httpx.AsyncClient,
    ids: list[str]
) -> str:

    unique = list(
        dict.fromkeys(
            qid for qid in ids
            if QID_RE.fullmatch(qid)
        )
    )[:12]

    if not unique:
        return NOT_FOUND

    response = await client.get(
        WIKIDATA_API,
        params={
            "action": "wbgetentities",
            "ids": "|".join(unique),
            "props": "labels",
            "languages": "ru|en",
            "format": "json"
        }
    )

    response.raise_for_status()

    entities = response.json().get("entities", {})
    names = []

    for qid in unique:
        labels = entities.get(qid, {}).get("labels", {})

        value = (
            labels.get("ru")
            or labels.get("en")
            or {}
        ).get("value")

        if value:
            names.append(value)

    return ", ".join(names) if names else NOT_FOUND


# ============================================================
# Bird family detection
# ============================================================

async def family_for(
    client: httpx.AsyncClient,
    first: dict
) -> str:

    visited: set[str] = set()
    current = first

    # P171 = parent taxon
    # P105 = taxon rank
    # Q35409 = family

    for _ in range(12):
        if "Q35409" in claims(current, "P105"):
            labels = current.get("labels", {})

            return (
                labels.get("ru")
                or labels.get("en")
                or {}
            ).get("value", NOT_FOUND)

        parents = claims(current, "P171")

        if not parents or parents[0] in visited:
            break

        visited.add(parents[0])

        current = await entity_data(
            client,
            parents[0]
        )

    return NOT_FOUND


# ============================================================
# Main bird information function
# ============================================================

async def bird_info(species: str) -> dict:
    info = empty_info()

    # Normalize model labels for Wikipedia lookup.
    species = " ".join(species.replace("_", " ").split())

    if species.isupper():
        species = species.lower().capitalize()

    logger.info("Wikipedia search: %s", species)

    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            headers=HEADERS,
            follow_redirects=True
        ) as client:

            # ------------------------------------------------
            # Step 1: Wikipedia
            # ------------------------------------------------

            response = await client.get(
                WIKIPEDIA_API,
                params={
                    "action": "query",
                    "titles": species,
                    "redirects": "1",
                    "prop": "extracts|pageprops",
                    "exintro": "1",
                    "explaintext": "1",
                    "format": "json",
                    "formatversion": "2"
                }
            )

            response.raise_for_status()

            pages = (
                response.json()
                .get("query", {})
                .get("pages", [])
            )

            if not pages or "missing" in pages[0]:
                logger.info(
                    "Wikipedia page not found: %s",
                    species
                )
                return info

            page = pages[0]

            # Save verified Wikipedia data independently.
            extract = " ".join(
                page.get("extract", "").split()
            )

            if extract:
                info["description"] = extract[:1400]

            info["wikipedia_url"] = (
                "https://en.wikipedia.org/wiki/"
                + page["title"].replace(" ", "_")
            )

            # ------------------------------------------------
            # Step 2: Wikidata identifier
            # ------------------------------------------------

            qid = page.get(
                "pageprops", {}
            ).get("wikibase_item")

            if (
                not isinstance(qid, str)
                or not QID_RE.fullmatch(qid)
            ):
                logger.info(
                    "No Wikidata ID for: %s",
                    species
                )
                return info

            # ------------------------------------------------
            # Step 3: Wikidata entity
            # ------------------------------------------------

            entity = await entity_data(client, qid)

            scientific = claim_string(entity, "P225")

            # Require a scientific name before associating
            # Wikidata taxonomy with the predicted species.
            if not scientific:
                logger.info(
                    "Scientific name not found for: %s",
                    species
                )
                return info

            info["scientific_name"] = scientific

            info["wikidata_url"] = (
                f"https://www.wikidata.org/wiki/{qid}"
            )

            # ------------------------------------------------
            # Step 4: Family, range and diet
            # ------------------------------------------------

            try:
                info["family"] = await family_for(
                    client,
                    entity
                )

                locations = (
                    claims(entity, "P2341")
                    or claims(entity, "P183")
                )

                info["range"] = await labels_for(
                    client,
                    locations
                )

                info["diet"] = await labels_for(
                    client,
                    claims(entity, "P1034")
                )

            except (
                httpx.HTTPError,
                ValueError,
                KeyError,
                TypeError
            ) as exc:

                logger.warning(
                    "Secondary Wikidata error for %s: %s",
                    species,
                    exc
                )

    except (
        httpx.HTTPError,
        ValueError,
        KeyError,
        TypeError
    ) as exc:

        logger.warning(
            "Bird information API error for %s: %s",
            species,
            exc
        )

    return info
