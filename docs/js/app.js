/**
 * Main app coordinator.
 * Handles page setup, form submission, and UI wiring.
 */

import { loadWordfreq, computeFingerprint, mergeFingerprints } from './fingerprint.js';
import { scoreText } from './scorer.js';
import { rewriteText } from './rewriter.js';
import { saveProfile, loadProfile, listProfiles, deleteProfile, profileExists } from './storage.js';

// Global state
let wordfreqLoaded = false;

/**
 * Initialize the app.
 */
export async function initApp() {
  // Show loading indicator
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.style.display = 'block';
  }

  try {
    await loadWordfreq();
    wordfreqLoaded = true;
    console.log('Wordfreq loaded successfully');
  } catch (err) {
    console.error('Failed to load wordfreq:', err);
    wordfreqLoaded = false;
  } finally {
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  }

  // Detect page type and wire handlers
  const page = detectPage();
  if (page === 'train') {
    setupTrainPage();
  } else if (page === 'score') {
    setupScorePage();
  } else if (page === 'rewrite') {
    setupRewritePage();
  } else if (page === 'profiles') {
    setupProfilesPage();
  }
}

/**
 * Detect which page we're on.
 */
function detectPage() {
  if (window.location.pathname.includes('score')) return 'score';
  if (window.location.pathname.includes('rewrite')) return 'rewrite';
  if (window.location.pathname.includes('profile')) return 'profiles';
  return 'train'; // default to train/index
}

/**
 * Train page: form submission to create/update profile.
 */
function setupTrainPage() {
  const form = document.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const profileName = document.getElementById('profile_name').value.trim();
    const sampleText = document.getElementById('sample_text').value.trim();

    if (!profileName || !sampleText) {
      showAlert('Please enter profile name and sample text.', 'error');
      return;
    }

    try {
      // Compute fingerprint
      const fp = computeFingerprint(sampleText);

      // If profile exists, merge fingerprints
      let finalFp = fp;
      if (profileExists(profileName)) {
        const existing = loadProfile(profileName);
        finalFp = mergeFingerprints([existing, fp]);
      }

      // Save to localStorage
      saveProfile(profileName, finalFp);

      // Display result
      displayFingerprint(finalFp);
      showAlert(`Profile "${profileName}" trained successfully!`, 'success');

      // Reset form
      form.reset();
    } catch (err) {
      console.error('Train error:', err);
      showAlert('Error training profile: ' + err.message, 'error');
    }
  });
}

/**
 * Score page: form submission to score text.
 */
function setupScorePage() {
  populateProfileDropdowns();

  const form = document.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const profileName = document.getElementById('profile_name').value;
    const inputText = document.getElementById('input_text').value.trim();

    if (!profileName || !inputText) {
      showAlert('Please select profile and enter text.', 'error');
      return;
    }

    try {
      const fingerprint = loadProfile(profileName);
      if (!fingerprint) {
        showAlert('Profile not found.', 'error');
        return;
      }

      const result = scoreText(inputText, fingerprint);

      // Display score
      displayScore(result);

      // Display radar chart
      displayRadarChart(result);

      // Display divergences
      displayDivergences(result);
    } catch (err) {
      console.error('Score error:', err);
      showAlert('Error scoring text: ' + err.message, 'error');
    }
  });
}

/**
 * Rewrite page: form submission to rewrite text.
 */
function setupRewritePage() {
  populateProfileDropdowns();

  const aggressivenessSlider = document.getElementById('aggressiveness');
  if (aggressivenessSlider) {
    aggressivenessSlider.addEventListener('input', (e) => {
      const display = document.getElementById('aggressiveness_display');
      if (display) {
        display.textContent = e.target.value;
      }
    });
  }

  const form = document.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const profileName = document.getElementById('profile_name').value;
    const inputText = document.getElementById('input_text').value.trim();
    const aggressiveness = parseInt(document.getElementById('aggressiveness').value) / 100;

    if (!profileName || !inputText) {
      showAlert('Please select profile and enter text.', 'error');
      return;
    }

    try {
      const fingerprint = loadProfile(profileName);
      if (!fingerprint) {
        showAlert('Profile not found.', 'error');
        return;
      }

      const rewritten = rewriteText(inputText, fingerprint, aggressiveness);

      // Display comparison
      displayRewriteComparison(inputText, rewritten, aggressiveness);
    } catch (err) {
      console.error('Rewrite error:', err);
      showAlert('Error rewriting text: ' + err.message, 'error');
    }
  });
}

/**
 * Profiles page: list and delete profiles.
 */
function setupProfilesPage() {
  const deleteButtons = document.querySelectorAll('form[method="POST"]');
  deleteButtons.forEach(form => {
    form.addEventListener('submit', (e) => {
      const action = form.querySelector('input[name="action"]').value;
      if (action === 'delete') {
        const profileName = form.querySelector('input[name="profile_name"]').value;
        if (!confirm(`Delete profile "${profileName}"?`)) {
          e.preventDefault();
        } else {
          e.preventDefault();
          deleteProfile(profileName);
          showAlert(`Profile "${profileName}" deleted.`, 'success');
          // Reload page to refresh list
          setTimeout(() => location.reload(), 500);
        }
      }
    });
  });

  // Wire profile view links (on click, show details)
  const profileLinks = document.querySelectorAll('.profile-link');
  profileLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const profileName = link.textContent;
      const fp = loadProfile(profileName);
      if (fp) {
        displayProfileDetails(profileName, fp);
      }
    });
  });
}

/**
 * Populate profile dropdowns on Score/Rewrite pages.
 */
function populateProfileDropdowns() {
  const selects = document.querySelectorAll('select[id="profile_name"]');
  const profiles = listProfiles();

  selects.forEach(select => {
    // Keep existing options, add profiles
    const existingOptions = select.querySelectorAll('option');
    const optionValues = Array.from(existingOptions).map(o => o.value);

    profiles.forEach(name => {
      if (!optionValues.includes(name)) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      }
    });

    // Enable/disable submit button based on profile availability
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = profiles.length === 0;
    }
  });
}

/**
 * Display fingerprint in the UI (8 dimensions).
 */
function displayFingerprint(fp) {
  const container = document.querySelector('.fingerprint-grid');
  if (!container) {
    // Create one if it doesn't exist
    const card = document.querySelector('.card:last-of-type');
    if (card) {
      const gridDiv = document.createElement('div');
      gridDiv.className = 'fingerprint-grid';
      card.appendChild(gridDiv);
    } else {
      return;
    }
  }

  const labels = {
    'avg_sentence_length': 'Avg Sentence Length',
    'sentence_length_variance': 'Sentence Variance',
    'vocab_rarity': 'Vocab Rarity',
    'filler_rate': 'Filler Rate',
    'contraction_rate': 'Contraction Rate',
    'paragraph_rhythm': 'Paragraph Rhythm',
    'capitalization_score': 'Capitalization',
    'punctuation_tics': 'Punctuation',
  };

  const formats = {
    'avg_sentence_length': v => v.toFixed(1) + ' words',
    'sentence_length_variance': v => v.toFixed(2),
    'vocab_rarity': v => v.toFixed(2),
    'filler_rate': v => v.toFixed(1) + '%',
    'contraction_rate': v => v.toFixed(1) + '%',
    'paragraph_rhythm': v => v.toFixed(2) + ' sent/para',
    'capitalization_score': v => (v * 100).toFixed(0) + '%',
  };

  let html = '';
  for (const key of Object.keys(labels)) {
    if (key === 'punctuation_tics') continue; // Don't show individual tics in fingerprint grid
    const label = labels[key];
    const value = fp[key];
    const formatted = formats[key](value);
    html += `
      <div class="fingerprint-item">
        <span class="label">${label}</span>
        <span class="value">${formatted}</span>
      </div>
    `;
  }

  container.innerHTML = html;
}

/**
 * Display score results.
 */
function displayScore(result) {
  // Create or update score section
  let scoreSection = document.querySelector('.score-section');
  if (!scoreSection) {
    const contentGrid = document.querySelector('.content-grid');
    scoreSection = document.createElement('div');
    scoreSection.className = 'score-section';
    contentGrid.appendChild(scoreSection);
  }

  const score = Math.round(result.overall_score);

  let message = '';
  if (score >= 80) {
    message = 'This text sounds very much like you!';
  } else if (score >= 60) {
    message = 'This text mostly sounds like you.';
  } else if (score >= 40) {
    message = 'This text has some differences from your style.';
  } else {
    message = 'This text differs significantly from your style.';
  }

  const html = `
    <div class="card score-card">
      <h2>You Score</h2>
      <div class="score-display">
        <div class="score-number">${score}</div>
        <div class="score-label">Match %</div>
      </div>
      <p class="score-message">${message}</p>
    </div>
    <div class="card chart-card">
      <h3>Dimension Breakdown</h3>
      <canvas id="radarChart" style="max-width: 100%; height: 300px;"></canvas>
    </div>
  `;

  scoreSection.innerHTML = html;
  scoreSection.style.gridColumn = '1 / -1';
}

/**
 * Display radar chart.
 */
function displayRadarChart(result) {
  const canvas = document.getElementById('radarChart');
  if (!canvas) return;

  // Use Chart.js from CDN (already loaded in HTML)
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }

  // Dimension labels for chart
  const dimLabels = {
    'avg_sentence_length': 'Sentence Length',
    'sentence_length_variance': 'Variance',
    'vocab_rarity': 'Vocab Rarity',
    'filler_rate': 'Fillers',
    'contraction_rate': 'Contractions',
    'paragraph_rhythm': 'Paragraph',
    'capitalization_score': 'Capitalization',
    'punctuation_tics': 'Punctuation',
  };

  const labels = [];
  const data = [];
  for (const key of Object.keys(dimLabels)) {
    if (key in result.per_dimension) {
      labels.push(dimLabels[key]);
      data.push(result.per_dimension[key][0]);
    }
  }

  // Destroy old chart if exists
  if (canvas.chart) {
    canvas.chart.destroy();
  }

  canvas.chart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Match Score',
        data: data,
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        borderWidth: 2,
        pointBackgroundColor: '#a855f7',
        pointBorderColor: '#fff',
        pointRadius: 4,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          max: 100,
          min: 0,
          ticks: {
            stepSize: 20,
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
          }
        }
      },
      plugins: {
        legend: {
          display: false,
        }
      }
    }
  });
}

/**
 * Display divergences (key differences).
 */
function displayDivergences(result) {
  if (!result.divergences || !result.divergences.length) return;

  let divergenceCard = document.querySelector('.divergence-card');
  if (!divergenceCard) {
    const scoreSection = document.querySelector('.score-section');
    divergenceCard = document.createElement('div');
    divergenceCard.className = 'card divergence-card';
    divergenceCard.style.gridColumn = '1 / -1';
    scoreSection.parentNode.insertBefore(divergenceCard, scoreSection.nextSibling);
  }

  let html = '<h3>Key Differences</h3><ul class="divergence-list">';
  for (const [_, msg] of result.divergences) {
    html += `<li>${msg}</li>`;
  }
  html += '</ul>';

  divergenceCard.innerHTML = html;
}

/**
 * Display rewrite comparison.
 */
function displayRewriteComparison(original, rewritten, aggressiveness) {
  let rewriteSection = document.querySelector('.rewrite-section');
  if (!rewriteSection) {
    const contentGrid = document.querySelector('.content-grid');
    rewriteSection = document.createElement('div');
    rewriteSection.className = 'rewrite-section';
    contentGrid.appendChild(rewriteSection);
  }

  const aggPercent = Math.round(aggressiveness * 100);
  const html = `
    <div class="rewrite-comparison">
      <div class="comparison-col">
        <h3>Original</h3>
        <div class="text-box original-text">${escapeHtml(original)}</div>
      </div>
      <div class="comparison-col">
        <h3>Rewritten (${aggPercent}% aggressiveness)</h3>
        <div class="text-box rewritten-text">${escapeHtml(rewritten)}</div>
      </div>
    </div>
  `;

  rewriteSection.innerHTML = html;
}

/**
 * Display profile details on profiles page.
 */
function displayProfileDetails(name, fp) {
  let detailCard = document.querySelector('.fingerprint-detail-card');
  if (!detailCard) {
    const contentGrid = document.querySelector('.content-grid');
    detailCard = document.createElement('div');
    detailCard.className = 'card fingerprint-detail-card';
    contentGrid.appendChild(detailCard);
  }

  const labels = {
    'avg_sentence_length': 'Avg Sentence Length',
    'sentence_length_variance': 'Sentence Variance',
    'vocab_rarity': 'Vocab Rarity',
    'filler_rate': 'Filler Rate',
    'contraction_rate': 'Contraction Rate',
    'paragraph_rhythm': 'Paragraph Rhythm',
    'capitalization_score': 'Capitalization',
  };

  const formats = {
    'avg_sentence_length': v => v.toFixed(2) + ' words',
    'sentence_length_variance': v => v.toFixed(3),
    'vocab_rarity': v => v.toFixed(3),
    'filler_rate': v => v.toFixed(2) + '%',
    'contraction_rate': v => v.toFixed(2) + '%',
    'paragraph_rhythm': v => v.toFixed(3) + ' sent/para',
    'capitalization_score': v => (v * 100).toFixed(1) + '%',
  };

  let html = `<h2>${escapeHtml(name)} — Detailed</h2><div class="fingerprint-grid">`;
  for (const key of Object.keys(labels)) {
    const label = labels[key];
    const value = fp[key];
    const formatted = formats[key](value);
    html += `
      <div class="fingerprint-item">
        <span class="label">${label}</span>
        <span class="value">${formatted}</span>
      </div>
    `;
  }
  html += '</div>';

  if (fp.punctuation_tics && Object.keys(fp.punctuation_tics).length) {
    html += '<h3 style="margin-top: 2rem;">Punctuation Tics (per 1000 chars)</h3><div class="fingerprint-grid">';
    for (const [key, val] of Object.entries(fp.punctuation_tics)) {
      const label = key.replace(/_/g, ' ').charAt(0).toUpperCase() + key.replace(/_/g, ' ').slice(1);
      html += `
        <div class="fingerprint-item">
          <span class="label">${label}</span>
          <span class="value">${val.toFixed(2)}</span>
        </div>
      `;
    }
    html += '</div>';
  }

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
  container.insertBefore(alert, container.firstChild);

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
