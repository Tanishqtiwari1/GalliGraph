"""Issue categories and the department each one is routed to."""

CATEGORIES = {
    "road_damage": {
        "label": "Road damage",
        "sub_types": ["pothole", "broken_road", "road_cave_in", "damaged_footpath", "other"],
        "department": "PWD / Municipal Roads",
    },
    "water_supply": {
        "label": "Water supply",
        "sub_types": ["no_supply", "low_pressure", "pipeline_leak", "contaminated_water", "other"],
        "department": "PHED (Jal Vibhag)",
    },
    "drainage": {
        "label": "Drainage & sewage",
        "sub_types": ["blocked_drain", "sewage_overflow", "waterlogging", "open_manhole", "other"],
        "department": "Municipal Sewerage & Drainage",
    },
    "garbage": {
        "label": "Garbage & sanitation",
        "sub_types": ["garbage_dump", "missed_collection", "overflowing_bin", "dead_animal", "other"],
        "department": "Sanitation (Swachh Bharat Cell)",
    },
    "streetlight": {
        "label": "Streetlight",
        "sub_types": ["not_working", "flickering", "damaged_pole", "exposed_wires", "other"],
        "department": "Municipal Electrical Wing",
    },
    "other": {
        "label": "Other",
        "sub_types": ["other"],
        "department": "Commissioner's Office (manual triage)",
    },
}

CATEGORY_KEYS = list(CATEGORIES)


def department_for(category: str) -> str:
    return CATEGORIES.get(category, CATEGORIES["other"])["department"]
