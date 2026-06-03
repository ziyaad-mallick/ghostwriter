/**
 * localStorage wrapper for profile management.
 */

const PREFIX = 'ghostwriter:profile:';

/**
 * Save a profile to localStorage.
 */
export function saveProfile(name, fingerprint) {
  const key = PREFIX + name;
  localStorage.setItem(key, JSON.stringify(fingerprint));
}

/**
 * Load a profile from localStorage.
 */
export function loadProfile(name) {
  const key = PREFIX + name;
  const data = localStorage.getItem(key);
  if (!data) return null;
  return JSON.parse(data);
}

/**
 * List all saved profile names.
 */
export function listProfiles() {
  const profiles = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(PREFIX)) {
      const name = key.slice(PREFIX.length);
      profiles.push(name);
    }
  }
  return profiles.sort();
}

/**
 * Delete a profile from localStorage.
 */
export function deleteProfile(name) {
  const key = PREFIX + name;
  localStorage.removeItem(key);
}

/**
 * Check if a profile exists.
 */
export function profileExists(name) {
  const key = PREFIX + name;
  return localStorage.getItem(key) !== null;
}
