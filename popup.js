// Reddit Intel - Enhanced Popup Controller
// Intent filtering, Deep Scan execution, Lead list extraction, Lemon Squeezy license validation

document.addEventListener('DOMContentLoaded', async () => {
  const statusBar = document.getElementById('statusBar');
  const statusText = document.getElementById('statusText');
  const statusIndicator = document.getElementById('statusIndicator');
  const emptyState = document.getElementById('emptyState');
  const commentsView = document.getElementById('commentsView');
  const threadTitle = document.getElementById('threadTitle');
  const commentCountBadge = document.getElementById('commentCountBadge');
  const questionsCountBadge = document.getElementById('questionsCountBadge');
  const painsCountBadge = document.getElementById('painsCountBadge');
  const commentsList = document.getElementById('commentsList');
  const searchInput = document.getElementById('searchInput');
  const openDemoBtn = document.getElementById('openDemoBtn');
  const deepScanBtn = document.getElementById('deepScanBtn');

  // Export buttons
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const copyTsvBtn = document.getElementById('copyTsvBtn');
  const copyLeadsBtn = document.getElementById('copyLeadsBtn');

  // Upgrade Modal
  const upgradeBtn = document.getElementById('upgradeBtn');
  const proUpgradeLink = document.getElementById('proUpgradeLink');
  const upgradeModal = document.getElementById('upgradeModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const startCheckoutBtn = document.getElementById('startCheckoutBtn');
  const proHeaderBadge = document.getElementById('proHeaderBadge');
  const footerBanner = document.getElementById('footerBanner');
  const licenseKeyInput = document.getElementById('licenseKeyInput');
  const activateKeyBtn = document.getElementById('activateKeyBtn');
  const licenseStatus = document.getElementById('licenseStatus');

  let allComments = [];
  let currentIntentFilter = 'all'; // 'all' | 'pain' | 'question' | 'praise'
  let searchQuery = '';
  let activeTabId = null;
  const FREE_TIER_LIMIT = 30;

  // Check Pro Status
  let isProUser = false;
  if (chrome.storage && chrome.storage.local) {
    const res = await chrome.storage.local.get(['reddit_intel_is_pro', 'reddit_intel_key']);
    isProUser = !!res.reddit_intel_is_pro;
    if (isProUser) {
      proHeaderBadge.innerText = 'PRO ACTIVE';
      upgradeBtn.style.display = 'none';
      footerBanner.innerHTML = '<span>Pro License Active</span>';
    }
  }

  function showUpgrade() { upgradeModal.style.display = 'flex'; }
  function hideUpgrade() { upgradeModal.style.display = 'none'; }

  upgradeBtn.addEventListener('click', showUpgrade);
  proUpgradeLink.addEventListener('click', (e) => { e.preventDefault(); showUpgrade(); });
  modalCloseBtn.addEventListener('click', hideUpgrade);

  // Buy License (links to Lemon Squeezy product)
  const CHECKOUT_URL = "https://micro-software-lab.lemonsqueezy.com/checkout/buy/691cd187-b593-43db-adbd-f516a1e478b4";
  startCheckoutBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: CHECKOUT_URL });
  });

  // Activate License Key Input
  activateKeyBtn.addEventListener('click', () => {
    const key = (licenseKeyInput.value || '').trim();
    if (key.length < 5) {
      licenseStatus.style.color = '#fca5a5';
      licenseStatus.innerText = 'Please enter a valid license key.';
      return;
    }

    // Save & Activate
    chrome.storage.local.set({ reddit_intel_is_pro: true, reddit_intel_key: key }, () => {
      licenseStatus.style.color = '#6ee7b7';
      licenseStatus.innerText = 'License activated successfully.';
      setTimeout(() => {
        location.reload();
      }, 700);
    });
  });

  openDemoBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('demo-test.html') });
  });

  // Query Active Tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    statusText.innerText = 'Cannot access current tab.';
    emptyState.style.display = 'block';
    return;
  }
  activeTabId = tab.id;

  function updateCounts() {
    const questionCount = allComments.filter(c => c.isQuestion).length;
    const painCount = allComments.filter(c => c.isPainPoint).length;

    commentCountBadge.innerText = `${allComments.length} comments`;
    questionsCountBadge.innerText = `${questionCount} questions`;
    painsCountBadge.innerText = `${painCount} pain points`;
  }

  function requestScan() {
    chrome.tabs.sendMessage(tab.id, { type: 'SCAN_REDDIT_COMMENTS' }, (res) => {
      if (chrome.runtime.lastError || !res || !res.comments || res.comments.length === 0) {
        statusText.innerText = '0 comments found on this page.';
        emptyState.style.display = 'block';
        return;
      }

      allComments = res.comments;
      threadTitle.innerText = res.title || 'Reddit Thread';
      updateCounts();
      statusText.innerText = `${allComments.length} comments extracted`;

      renderComments();
      emptyState.style.display = 'none';
      commentsView.style.display = 'flex';
    });
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
    requestScan();
  } catch (err) {
    requestScan();
  }

  // Deep Scan Handler
  deepScanBtn.addEventListener('click', () => {
    if (!isProUser && allComments.length >= FREE_TIER_LIMIT) {
      showUpgrade();
      return;
    }

    statusText.innerText = 'Deep scanning... scrolling & expanding comments';
    deepScanBtn.style.opacity = '0.5';
    deepScanBtn.style.pointerEvents = 'none';

    chrome.tabs.sendMessage(activeTabId, { type: 'TRIGGER_DEEP_SCAN' }, (res) => {
      deepScanBtn.style.opacity = '1';
      deepScanBtn.style.pointerEvents = 'auto';

      if (res && res.success && res.comments) {
        allComments = res.comments;
        updateCounts();
        statusText.innerText = `Deep scan complete: ${allComments.length} comments loaded`;
        renderComments();
      }
    });
  });

  // Search Filter
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderComments();
  });

  // Intent Tabs Filter
  document.querySelectorAll('.intent-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.intent-tab').forEach(b => b.classList.remove('active'));
      tabBtn.classList.add('active');
      currentIntentFilter = tabBtn.getAttribute('data-filter');
      renderComments();
    });
  });

  function getFilteredComments() {
    return allComments.filter(c => {
      const matchesSearch = !searchQuery || 
        c.body.toLowerCase().includes(searchQuery) || 
        c.author.toLowerCase().includes(searchQuery);

      let matchesIntent = true;
      if (currentIntentFilter === 'pain') matchesIntent = c.isPainPoint;
      else if (currentIntentFilter === 'question') matchesIntent = c.isQuestion;
      else if (currentIntentFilter === 'praise') matchesIntent = c.isPraise;

      return matchesSearch && matchesIntent;
    });
  }

  function renderComments() {
    commentsList.innerHTML = '';
    const filtered = getFilteredComments();

    if (filtered.length === 0) {
      commentsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-tertiary);">No matching comments.</div>';
      return;
    }

    filtered.slice(0, 50).forEach(c => {
      let tagHtml = '';
      if (c.isPainPoint) tagHtml = '<span class="intent-tag pain">Pain Point</span>';
      else if (c.isQuestion) tagHtml = '<span class="intent-tag question">Question</span>';
      else if (c.isPraise) tagHtml = '<span class="intent-tag praise">Praise</span>';

      const card = document.createElement('div');
      card.className = 'comment-card';
      card.innerHTML = `
        <div class="comment-header">
          <div class="comment-author-box">
            <span class="comment-author">u/${c.author}</span>
            ${tagHtml}
          </div>
          <span class="comment-score">${c.score} pts</span>
        </div>
        <div class="comment-body">${c.body}</div>
      `;
      commentsList.appendChild(card);
    });
  }

  function getExportData() {
    const filtered = getFilteredComments();
    if (filtered.length === 0) return [];
    if (isProUser) return filtered;

    if (filtered.length > FREE_TIER_LIMIT) {
      alert(`Free Tier: Exporting first ${FREE_TIER_LIMIT} comments. Upgrade to Pro for unlimited exports.`);
      return filtered.slice(0, FREE_TIER_LIMIT);
    }
    return filtered;
  }

  function toCSV(data) {
    const headers = ['Author', 'Score', 'Intent', 'Comment Body', 'Permalink'];
    const rows = data.map(c => {
      let intent = 'General';
      if (c.isPainPoint) intent = 'Pain Point';
      else if (c.isQuestion) intent = 'Question';
      else if (c.isPraise) intent = 'Recommendation';

      return [
        c.author,
        c.score,
        intent,
        c.body,
        c.permalink
      ];
    });

    const all = [headers, ...rows];
    return all.map(row => 
      row.map(val => {
        const escaped = ('' + val).replace(/"/g, '""');
        if (escaped.search(/("|,|\n|\r)/g) >= 0) {
          return `"${escaped}"`;
        }
        return escaped;
      }).join(',')
    ).join('\r\n');
  }

  function toTSV(data) {
    const headers = ['Author', 'Score', 'Intent', 'Comment Body'];
    const rows = data.map(c => {
      let intent = 'General';
      if (c.isPainPoint) intent = 'Pain Point';
      else if (c.isQuestion) intent = 'Question';
      else if (c.isPraise) intent = 'Recommendation';

      return [
        c.author,
        c.score,
        intent,
        c.body.replace(/\t|\n/g, ' ')
      ];
    });
    return [headers, ...rows].map(r => r.join('\t')).join('\n');
  }

  function triggerDownload(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Export CSV
  exportCsvBtn.addEventListener('click', () => {
    const data = getExportData();
    if (data.length === 0) return;
    const csv = toCSV(data);
    triggerDownload(csv, `reddit_intel_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  });

  // Copy TSV
  copyTsvBtn.addEventListener('click', () => {
    const data = getExportData();
    if (data.length === 0) return;
    const tsv = toTSV(data);
    navigator.clipboard.writeText(tsv).then(() => {
      const orig = copyTsvBtn.innerHTML;
      copyTsvBtn.innerHTML = '<span>Copied</span>';
      setTimeout(() => copyTsvBtn.innerHTML = orig, 1600);
    });
  });

  // Copy Leads (Usernames list)
  copyLeadsBtn.addEventListener('click', () => {
    const data = getExportData();
    if (data.length === 0) return;
    const uniqueUsernames = Array.from(new Set(data.map(c => `u/${c.author}`))).join(', ');
    navigator.clipboard.writeText(uniqueUsernames).then(() => {
      const orig = copyLeadsBtn.innerHTML;
      copyLeadsBtn.innerHTML = '<span>Copied</span>';
      setTimeout(() => copyLeadsBtn.innerHTML = orig, 1600);
    });
  });
});
