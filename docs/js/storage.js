/**
 * localStorage wrapper for profile management.
 * Stores both the profile (result of buildProfile) and raw samples (for rebuilding).
 */

const PROFILE_PREFIX = 'ghostwriter:profile:';
const SAMPLES_PREFIX = 'ghostwriter:samples:';

/**
 * Save a profile and its samples to localStorage.
 */
export function saveProfile(name, profile, samples = []) {
  const profileKey = PROFILE_PREFIX + name;
  const samplesKey = SAMPLES_PREFIX + name;
  localStorage.setItem(profileKey, JSON.stringify(profile));
  localStorage.setItem(samplesKey, JSON.stringify(samples));
}

/**
 * Load a profile from localStorage.
 */
export function loadProfile(name) {
  const profileKey = PROFILE_PREFIX + name;
  const data = localStorage.getItem(profileKey);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Load samples for a profile.
 */
export function loadSamples(name) {
  const samplesKey = SAMPLES_PREFIX + name;
  const data = localStorage.getItem(samplesKey);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * List all saved profile names.
 */
export function listProfiles() {
  const profiles = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(PROFILE_PREFIX)) {
      const name = key.slice(PROFILE_PREFIX.length);
      profiles.push(name);
    }
  }
  return profiles.sort();
}

/**
 * Delete a profile and its samples from localStorage.
 */
export function deleteProfile(name) {
  const profileKey = PROFILE_PREFIX + name;
  const samplesKey = SAMPLES_PREFIX + name;
  localStorage.removeItem(profileKey);
  localStorage.removeItem(samplesKey);
}

/**
 * Check if a profile exists.
 */
export function profileExists(name) {
  const profileKey = PROFILE_PREFIX + name;
  return localStorage.getItem(profileKey) !== null;
}
