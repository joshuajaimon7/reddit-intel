// Reddit Intel - Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  const statusBar = document.getElementById('statusBar');
  const statusText = document.getElementById('statusText');
  const emptyState = document.getElementById('emptyState');
  const commentsView = document.getElementById('commentsView');
  const threadTitle = document.getElementById('threadTitle');
  const commentCountBadge = document.getElementById('commentCountBadge');
  const questionsCountBadge = document.getElementById('questionsCountBadge');
  const commentsList = document.getElementById('commentsList');
  const searchInput = document.getElementById('searchInput');
  const questionsOnlyToggle = document.getElementById('questionsOnlyToggle');
  const openDemoBtn = document.getElementById('openDemoBtn');

  // Export buttons
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const copyTsvBtn = document.getElementById('copyTsvBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');

  // Upgrade Modal
  const upgradeBtn = document.getElementById('upgradeBtn');
  const proUpgradeLink = document.getElementById('proUpgradeLink');
  const upgradeModal = document.getElementById('upgradeModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const startCheckoutBtn = document.getElementById('startCheckoutBtn');
  const proHeaderBadge = document.getElementById('proHeaderBadge');
  const footerBanner = document.getElementById('footerBanner');

  let allComments = [];
  let filterQuestionsOnly = false;
  let searchQuery = '';
  const FREE_TIER_LIMIT = 30;

  // Check Pro Status
  let isProUser = false;
  if (chrome.storage && chrome.storage.local) {
    const res = await chrome.storage.local.get(['reddit_intel_is_pro']);
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

  startCheckoutBtn.addEventListener('click', () => {
    if (confirm('Activate Reddit Intel Pro lifetime license?')) {
      chrome.storage.local.set({ reddit_intel_is_pro: true }, () => {
        alert('Reddit Intel Pro license activated.');
        location.reload();
      });
    }
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

  function requestScan() {
    chrome.tabs.sendMessage(tab.id, { type: 'SCAN_REDDIT_COMMENTS' }, (res) => {
      if (chrome.runtime.lastError || !res || !res.comments || res.comments.length === 0) {
        statusText.innerText = '0 comments found on this page.';
        emptyState.style.display = 'block';
        return;
      }

      allComments = res.comments;
      threadTitle.innerText = res.title || 'Reddit Thread';
      const questionCount = allComments.filter(c => c.isQuestion).length;

      commentCountBadge.innerText = `${allComments.length} comments`;
      questionsCountBadge.innerText = `${questionCount} questions`;
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

  // Filter Handlers
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderComments();
  });

  questionsOnlyToggle.addEventListener('click', () => {
    filterQuestionsOnly = !filterQuestionsOnly;
    questionsOnlyToggle.classList.toggle('active', filterQuestionsOnly);
    renderComments();
  });

  function getFilteredComments() {
    return allComments.filter(c => {
      const matchesSearch = !searchQuery || 
        c.body.toLowerCase().includes(searchQuery) || 
        c.author.toLowerCase().includes(searchQuery);
      const matchesQuestion = !filterQuestionsOnly || c.isQuestion;
      return matchesSearch && matchesQuestion;
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
      const card = document.createElement('div');
      card.className = 'comment-card';
      card.innerHTML = `
        <div class="comment-header">
          <span class="comment-author">u/${c.author}${c.isQuestion ? '<span class="question-tag">Question</span>' : ''}</span>
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
    const headers = ['Author', 'Score', 'Question', 'Comment Body', 'Permalink'];
    const rows = data.map(c => [
      c.author,
      c.score,
      c.isQuestion ? 'YES' : 'NO',
      c.body,
      c.permalink
    ]);

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
    const headers = ['Author', 'Score', 'Question', 'Comment Body'];
    const rows = data.map(c => [
      c.author,
      c.score,
      c.isQuestion ? 'YES' : 'NO',
      c.body.replace(/\t|\n/g, ' ')
    ]);
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

  exportCsvBtn.addEventListener('click', () => {
    const data = getExportData();
    if (data.length === 0) return;
    const csv = toCSV(data);
    triggerDownload(csv, `reddit_comments_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
  });

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

  exportJsonBtn.addEventListener('click', () => {
    const data = getExportData();
    if (data.length === 0) return;
    triggerDownload(JSON.stringify(data, null, 2), `reddit_comments_${Date.now()}.json`, 'application/json');
  });
});
