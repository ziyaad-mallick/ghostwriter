/**
 * Ghostwriter — Stylometric writing analyzer.
 * Single-page stepped flow using the stylometry engine.
 */

import { buildProfile, analyze } from './stylometry.js';
import { saveProfile, loadProfile, loadSamples, listProfiles, deleteProfile, profileExists } from './storage.js';

/**
 * Initialize the app.
 */
function initApp() {
  const page = detectPage();
  if (page === 'index' || page === 'main') {
    setupMainPage();
  } else if (page === 'profiles') {
    setupProfilesPage();
  }
}

/**
 * Detect which page we're on.
 */
function detectPage() {
  if (window.location.pathname.includes('profile')) return 'profiles';
  return 'index';
}

/**
 * Setup the main analyzer page with stepped flow.
 */
function setupMainPage() {
  const teachForm = document.getElementById('teach-form');
  const testForm = document.getElementById('test-form');

  if (teachForm) {
    teachForm.addEventListener('submit', handleTeach);
  }

  if (testForm) {
    testForm.addEventListener('submit', handleTest);
  }

  // Update profile dropdowns and profiles list
  updateProfileUI();
}

/**
 * Handle Step 1: Build fingerprint.
 */
function handleTeach(e) {
  e.preventDefault();

  const profileName = document.getElementById('profile_name').value.trim();
  const sampleText = document.getElementById('sample_text').value.trim();

  if (!profileName || !sampleText) {
    showAlert('Please enter profile name and sample text.', 'error');
    return;
  }

  try {
    // Accumulate with any existing samples, then build from the full set so
    // appending genuinely strengthens the profile (not overwrites it).
    const existingSamples = loadSamples(profileName) || [];
    const allSamples = [...existingSamples, sampleText];
    const profile = buildProfile(allSamples);
    saveProfile(profileName, profile, allSamples);

    // Show success
    showAlert(`Profile "${profileName}" created successfully!`, 'success');
    document.getElementById('teach-success').style.display = 'block';

    // Update profile UI
    updateProfileUI();

    // Enable step 2 and hide teach form success after a moment
    setTimeout(() => {
      document.getElementById('step-teach').style.display = 'none';
      document.getElementById('step-test').style.display = 'block';
      document.getElementById('test-form').reset();
    }, 1500);
  } catch (err) {
    console.error('Build error:', err);
    showAlert('Error building profile: ' + err.message, 'error');
  }
}

/**
 * Handle Step 2: Analyze text.
 */
function handleTest(e) {
  e.preventDefault();

  const profileName = document.getElementById('test-profile_name').value;
  const testText = document.getElementById('test_text').value.trim();

  if (!profileName || !testText) {
    showAlert('Please select profile and enter text.', 'error');
    return;
  }

  try {
    const profile = loadProfile(profileName);
    if (!profile) {
      showAlert('Profile not found.', 'error');
      return;
    }

    const result = analyze(testText, profile);

    // Display Step 3: Results
    displayResult(result);

    // Hide test form, show results
    document.getElementById('step-test').style.display = 'none';
    document.getElementById('step-result').style.display = 'block';
  } catch (err) {
    console.error('Analyze error:', err);
    showAlert('Error analyzing text: ' + err.message, 'error');
  }
}

/**
 * Display the result in Step 3.
 */
function displayResult(result) {
  const scoreCard = document.getElementById('result-score-card');
  const scoreEl = document.getElementById('result-score');
  const verdictEl = document.getElementById('result-verdict');
  const tellsList = document.getElementById('result-tells-list');
  const tellsContainer = document.getElementById('result-tells');

  // Score and verdict
  scoreEl.textContent = result.score;
  verdictEl.textContent = result.verdict;
  scoreCard.style.display = 'block';

  // Tells (giveaway differences)
  if (result.tells && result.tells.length) {
    tellsList.innerHTML = result.tells.map(tell => `<li>${escapeHtml(tell)}</li>`).join('');
    tellsContainer.style.display = 'block';
  } else {
    tellsContainer.style.display = 'none';
  }
}

/**
 * Update profile dropdowns and the profiles list.
 */
function updateProfileUI() {
  const profiles = listProfiles();

  // Update test-profile_name dropdown
  const testSelect = document.getElementById('test-profile_name');
  if (testSelect) {
    const currentValue = testSelect.value;
    testSelect.innerHTML = '<option value="">-- Choose a profile --</option>';
    for (const name of profiles) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      testSelect.appendChild(opt);
    }
    if (profiles.length > 0 && !currentValue) {
      testSelect.value = profiles[0];
    }
  }

  // Update profiles list
  const profilesList = document.getElementById('profiles-list');
  if (profilesList) {
    if (profiles.length === 0) {
      profilesList.innerHTML = '<p class="empty-state">No profiles yet. Create one above!</p>';
    } else {
      let html = '<ul class="profile-list">';
      for (const name of profiles) {
        html += `
          <li class="profile-item">
            <span class="profile-name">${escapeHtml(name)}</span>
            <button type="button" class="btn btn-small btn-danger delete-btn" data-profile="${escapeHtml(name)}">Delete</button>
          </li>
        `;
      }
      html += '</ul>';
      profilesList.innerHTML = html;

      // Wire delete buttons
      document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const name = btn.getAttribute('data-profile');
          if (confirm(`Delete profile "${name}"?`)) {
            deleteProfile(name);
            updateProfileUI();
            showAlert(`Profile "${name}" deleted.`, 'success');
          }
        });
      });
    }
  }
}

/**
 * Setup profiles page (lightweight view/delete).
 */
function setupProfilesPage() {
  renderProfileList();
}

/**
 * Render the profiles list on the profiles page.
 */
function renderProfileList() {
  const profiles = listProfiles();
  const container = document.getElementById('profile-list-container');

  if (!container) return;

  if (!profiles.length) {
    container.innerHTML = '<p class="empty-state">No profiles yet. <a href="./index.html">Create one →</a></p>';
    return;
  }

  let html = '<ul class="profile-list">';
  for (const name of profiles) {
    html += `
      <li class="profile-item">
        <a href="#" class="profile-link" data-profile="${escapeHtml(name)}">${escapeHtml(name)}</a>
        <button type="button" class="btn btn-small btn-danger delete-btn" data-profile="${escapeHtml(name)}">Delete</button>
      </li>
    `;
  }
  html += '</ul>';
  container.innerHTML = html;

  // Wire delete buttons
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const name = btn.getAttribute('data-profile');
      if (confirm(`Delete profile "${name}"?`)) {
        deleteProfile(name);
        renderProfileList();
        showAlert(`Profile "${name}" deleted.`, 'success');
      }
    });
  });

  // Wire profile links (show details)
  document.querySelectorAll('.profile-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const name = link.getAttribute('data-profile');
      const fp = loadProfile(name);
      if (fp) {
        displayProfileDetails(name, fp);
      }
    });
  });
}

/**
 * Display profile details on profiles page.
 */
function displayProfileDetails(name, profile) {
  let detailCard = document.querySelector('.profile-detail-card');
  if (!detailCard) {
    const contentGrid = document.querySelector('.content-grid');
    detailCard = document.createElement('div');
    detailCard.className = 'card profile-detail-card';
    contentGrid.appendChild(detailCard);
  }

  // Simple display of profile metadata
  const wordCount = profile.wordCount || 0;
  const chunkCount = profile.chunkCount || 0;

  let html = `<h2>${escapeHtml(name)} — Profile Details</h2>`;
  html += `<p><strong>Words analyzed:</strong> ${wordCount.toLocaleString()}</p>`;
  html += `<p><strong>Text chunks:</strong> ${chunkCount}</p>`;
  html += `<p><strong>Anchor mean:</strong> ${(profile.anchorMean || 0).toFixed(3)}</p>`;
  html += `<p><strong>Anchor std:</strong> ${(profile.anchorStd || 0).toFixed(3)}</p>`;

  detailCard.innerHTML = html;
}

/**
 * Show alert message.
 */
function showAlert(message, type = 'info') {
  const container = document.querySelector('.container');
  if (!container) return;

  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;

  const pageHeader = document.querySelector('.page-header');
  if (pageHeader) {
    pageHeader.parentNode.insertBefore(alert, pageHeader.nextSibling);
  } else {
    container.insertBefore(alert, container.firstChild);
  }

  setTimeout(() => alert.remove(), 5000);
}

/**
 * Escape HTML.
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
