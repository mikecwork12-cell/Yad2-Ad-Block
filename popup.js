document.addEventListener('DOMContentLoaded', () => {
  const countEl = document.getElementById('blocked-count');
  const errorStatusEl = document.getElementById('error-status');
  const clearErrorBtn = document.getElementById('clear-error-btn');

  /**
   * Formats the timestamp into a human-readable string.
   * @param {string} isoString
   * @returns {string}
   */
  function formatTime(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return '00:00:00';
    }
  }

  /**
   * Simple HTML escaping helper to prevent script injection.
   * @param {string} unsafe
   * @returns {string}
   */
  function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Refresh display from chrome.storage.local
   */
  function refreshDisplay() {
    chrome.storage.local.get({ blockedCount: 0, errorLogs: [] }, (data) => {
      if (countEl) {
        countEl.textContent = data.blockedCount || 0;
      }

      const logs = data.errorLogs || [];
      if (!errorStatusEl) return;

      if (logs.length === 0) {
        errorStatusEl.innerHTML = '<div class="empty-state">No errors reported. Everything running smoothly!</div>';
      } else {
        errorStatusEl.innerHTML = logs.map((log, index) => `
          <div class="log-item">
            <div class="log-meta">
              <span class="log-time">${formatTime(log.timestamp)}</span>
              <span class="log-context">${escapeHtml(log.context)}</span>
            </div>
            <div class="log-msg">${escapeHtml(log.message)}</div>
            ${log.stack ? `
              <div>
                <span class="log-stack-toggle" data-index="${index}">Show Stack Trace</span>
                <pre class="log-stack" id="stack-${index}">${escapeHtml(log.stack)}</pre>
              </div>
            ` : ''}
          </div>
        `).join('');
      }
    });
  }

  // Handle collapsible stack trace toggling using event delegation
  if (errorStatusEl) {
    errorStatusEl.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('log-stack-toggle')) {
        const index = e.target.getAttribute('data-index');
        const stackEl = document.getElementById(`stack-${index}`);
        if (stackEl) {
          const isHidden = window.getComputedStyle(stackEl).display === 'none';
          if (isHidden) {
            stackEl.style.display = 'block';
            e.target.textContent = 'Hide Stack Trace';
          } else {
            stackEl.style.display = 'none';
            e.target.textContent = 'Show Stack Trace';
          }
        }
      }
    });
  }

  // Clear statistics and logs
  if (clearErrorBtn) {
    clearErrorBtn.addEventListener('click', () => {
      if (confirm('Clear statistics and error logs?')) {
        chrome.storage.local.set({ blockedCount: 0, errorLogs: [] }, () => {
          refreshDisplay();
          
          const originalText = clearErrorBtn.textContent;
          clearErrorBtn.textContent = 'Cleared!';
          clearErrorBtn.style.backgroundColor = '#10b981';
          
          setTimeout(() => {
            clearErrorBtn.textContent = originalText;
            clearErrorBtn.style.backgroundColor = '';
          }, 1200);
        });
      }
    });
  }

  // Initial render
  refreshDisplay();
});
