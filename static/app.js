/**
 * Ghostwriter Frontend
 */

document.addEventListener('DOMContentLoaded', function() {
    // Auto-update aggressiveness display
    const aggressivenessSlider = document.getElementById('aggressiveness');
    if (aggressivenessSlider) {
        aggressivenessSlider.addEventListener('input', function(e) {
            const display = document.getElementById('aggressiveness_display');
            if (display) {
                display.textContent = e.target.value;
            }
        });
    }

    // Form validation
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            const textareas = form.querySelectorAll('textarea[required]');
            textareas.forEach(textarea => {
                if (!textarea.value.trim()) {
                    e.preventDefault();
                    alert('Please fill in all required fields.');
                }
            });
        });
    });
});
