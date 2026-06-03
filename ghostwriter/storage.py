"""
Load/save JSON profiles from profiles/ directory.
"""

import json
import os
from pathlib import Path


PROFILES_DIR = Path(__file__).parent.parent / 'profiles'


def ensure_profiles_dir():
    """Ensure profiles directory exists."""
    PROFILES_DIR.mkdir(exist_ok=True)


def list_profiles():
    """List all profile names (without .json extension)."""
    ensure_profiles_dir()
    files = [f.name[:-5] for f in PROFILES_DIR.glob('*.json')]
    return sorted(files)


def load_profile(name):
    """Load a profile by name. Returns dict or None if not found."""
    ensure_profiles_dir()
    path = PROFILES_DIR / f'{name}.json'
    if not path.exists():
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_profile(name, fingerprint):
    """Save a fingerprint to a profile JSON file."""
    ensure_profiles_dir()
    path = PROFILES_DIR / f'{name}.json'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(fingerprint, f, indent=2)


def delete_profile(name):
    """Delete a profile."""
    ensure_profiles_dir()
    path = PROFILES_DIR / f'{name}.json'
    if path.exists():
        path.unlink()
        return True
    return False


def profile_exists(name):
    """Check if a profile exists."""
    ensure_profiles_dir()
    return (PROFILES_DIR / f'{name}.json').exists()
