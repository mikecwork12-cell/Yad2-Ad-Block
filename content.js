(function() {
  'use strict';

  // --- Configuration ---
  const DEBUG = false; 
  const CHECKED_ATTR = 'data-yad2-no-ads-checked';

  if (DEBUG) {
    console.log('[Yad2 Pure] Advanced Filtering Engine Active.');
  }

  // --- Error Reporting & Storage Logging ---
  /**
   * Safe wrapper to log errors to chrome.storage.local
   * @param {Error} error
   * @param {string} context
   */
  function reportError(error, context) {
    try {
      console.error(`[Yad2 Pure Error] Context: ${context}`, error);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ errorLogs: [] }, (result) => {
          try {
            const errorLogs = result.errorLogs || [];
            const newLog = {
              message: error ? error.message : 'Unknown Error',
              stack: error ? error.stack : 'No stack trace available',
              timestamp: new Date().toISOString(),
              context: context
            };
            errorLogs.unshift(newLog); // Add to beginning
            if (errorLogs.length > 50) {
              errorLogs.pop(); // Keep only last 50
            }
            chrome.storage.local.set({ errorLogs: errorLogs });
          } catch (innerErr) {
            console.error('[Yad2 Pure] Inner failure writing error log:', innerErr);
          }
        });
      }
    } catch (storageErr) {
      console.error('[Yad2 Pure] Global failure writing error log to storage:', storageErr);
    }
  }

  /**
   * Increments the total count of hidden listings in chrome.storage.local
   */
  function incrementBlockedCount() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get({ blockedCount: 0 }, (result) => {
          try {
            const newCount = (result.blockedCount || 0) + 1;
            chrome.storage.local.set({ blockedCount: newCount });
          } catch (innerErr) {
            reportError(innerErr, 'incrementBlockedCount_set');
          }
        });
      }
    } catch (err) {
      reportError(err, 'incrementBlockedCount_get');
    }
  }

  // Listen to unhandled exceptions in the content script context
  window.addEventListener('error', (event) => {
    try {
      if (event.error) {
        reportError(event.error, 'uncaught_exception');
      } else {
        reportError(new Error(event.message || 'Unhandled error event'), 'uncaught_exception_message');
      }
    } catch (err) {
      console.error('[Yad2 Pure] Error listener failed:', err);
    }
  });

  try {
    /**
     * Scans the page for Yad2 feed links and third-party advertisements.
     * @param {Element} root
     */
    function scanElement(root) {
      try {
        if (!root || !root.querySelectorAll) return;

        // FIX 1: Target and instantly vaporize Google Ads and SafeFrames
        const networkAds = root.querySelectorAll(
          'iframe[id*="google_ads"], iframe[src*="googlesyndication.com"], [data-is-safeframe="true"], [data-google-container-id]'
        );
        networkAds.forEach(ad => {
          try {
            if (ad.hasAttribute(CHECKED_ATTR)) return;
            ad.setAttribute(CHECKED_ATTR, 'hidden');
            ad.style.setProperty('display', 'none', 'important');
            
            // Increment count for display ads blocked as requested
            incrementBlockedCount();
            
            if (DEBUG) {
              console.log('[Yad2 Pure] Hiding Google Ad/SafeFrame:', ad);
            }
          } catch (adErr) {
            reportError(adErr, 'scanElement_networkAds');
          }
        });

        // Scan for feed items
        const allListings = root.querySelectorAll(
          'a[data-listing-type], a[data-nagish*="-link"], a[class*="-item_box"], a[class*="plus_box"]'
        );

        allListings.forEach(card => {
          try {
            // Skip if this card was already scanned in this DOM cycle
            if (card.hasAttribute(CHECKED_ATTR)) return;

            const listingType = card.getAttribute('data-listing-type') || '';
            const nagishAttr = card.getAttribute('data-nagish') || '';
            const className = card.className || '';
            const testId = card.getAttribute('data-testid') || '';
            
            // --- Bulletproof Pagination Guard ---
            const href = card.getAttribute('href') || '';
            const textContent = card.textContent ? card.textContent.trim() : '';

            // 1. Ancestor check
            const hasPaginationAncestor = card.closest('[data-nagish="pagination-navbar"]') || card.closest('[class*="pagination"]');

            // 2. Text checks: is a number, or contains common pagination words (Hebrew or English next/prev)
            const isNumber = !isNaN(textContent) && textContent !== '';
            const isNextPrevText = 
              textContent === 'הבא' || 
              textContent === 'הקודם' || 
              textContent.includes('next') || 
              textContent.includes('prev') ||
              textContent.includes('»') || 
              textContent.includes('«') ||
              textContent.includes('>') || 
              textContent.includes('<');

            // 3. URL check
            const isPaginationUrl = href.includes('page=') || href.includes('Page=');

            // 4. Class and attributes check (including "pagination" and "page" to fix the missing e in pagination)
            const hasPaginationString = 
              (typeof className === 'string' && (className.includes('pagination') || className.includes('page'))) || 
              (typeof testId === 'string' && (testId.includes('pagination') || testId.includes('page'))) || 
              (typeof nagishAttr === 'string' && (nagishAttr.includes('pagination') || nagishAttr.includes('page')));

            const isPaginationElement = 
              hasPaginationString ||
              hasPaginationAncestor ||
              isNumber ||
              isNextPrevText ||
              isPaginationUrl;

            if (isPaginationElement) {
              card.setAttribute(CHECKED_ATTR, 'pagination-safe');
              card.style.removeProperty('display'); // Force keep it visible
              return; 
            }

            // STRICT FEED RULE: Must explicitly declare itself as private
            const isPrivate = 
              listingType.startsWith('private') || 
              nagishAttr === 'private-item-link' || 
              className.includes('private-item_box');

            if (!isPrivate) {
              // If it's ultra, agent, sponsored, or anything else -> Hide it
              card.setAttribute(CHECKED_ATTR, 'hidden');
              card.style.setProperty('display', 'none', 'important');
              
              if (DEBUG) {
                console.log(`[Yad2 Pure] Hiding Non-Private Card (Type: ${listingType || 'Unknown'}):`, card);
              }

              // Increment stats count in background storage
              incrementBlockedCount();
            } else {
              // Keep pristine private listings visible
              card.setAttribute(CHECKED_ATTR, 'clean');
              card.style.removeProperty('display');
            }
          } catch (itemErr) {
            reportError(itemErr, 'scanElement_forEach_card');
          }
        });
      } catch (scanErr) {
        reportError(scanErr, 'scanElement_root');
      }
    }

    // --- MutationObserver Setup ---
    let mutationTimeout = null;

    const observer = new MutationObserver((mutations) => {
      try {
        for (const mutation of mutations) {
          const target = mutation.target;
          if (target && target.nodeType === Node.ELEMENT_NODE) {
            const card = target.closest(`[${CHECKED_ATTR}]`);
            if (card && card.getAttribute(CHECKED_ATTR) !== 'pagination-safe') {
              // Force React updates or recycled nodes to be re-evaluated (skip pagination tags)
              card.removeAttribute(CHECKED_ATTR);
            }
          }
        }

        // Keep scrolling fluid at 60fps
        if (mutationTimeout) {
          cancelAnimationFrame(mutationTimeout);
        }
        mutationTimeout = requestAnimationFrame(() => {
          try {
            scanElement(document.body);
          } catch (scanRafErr) {
            reportError(scanRafErr, 'scanElement_raf');
          }
        });
      } catch (obsErr) {
        reportError(obsErr, 'mutation_observer_callback');
      }
    });

    // Run initial execution pass
    try {
      scanElement(document.body);
    } catch (initErr) {
      reportError(initErr, 'initial_scan');
    }

    // Watch child structure and deep text mutations for incoming infinite scroll cards
    try {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (observeErr) {
      reportError(observeErr, 'observer_observe');
    }

  } catch (error) {
    reportError(error, 'global_execution_context');
  }
})();
