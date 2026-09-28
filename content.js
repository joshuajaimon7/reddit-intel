// Reddit Intel - Content Script
// Extracts comments from modern Reddit (shreddit), redesign, old Reddit, and test grounds

(function () {
  function cleanText(txt) {
    if (!txt) return '';
    return txt.replace(/\s+/g, ' ').trim();
  }

  function parseRedditComments() {
    const results = [];

    // Strategy 1: Modern Reddit Web Components (<shreddit-comment>)
    const shredditComments = document.querySelectorAll('shreddit-comment');
    if (shredditComments.length > 0) {
      shredditComments.forEach((c) => {
        const author = c.getAttribute('author') || c.querySelector('[slot="authorName"]')?.innerText || 'anonymous';
        const score = c.getAttribute('score') || c.querySelector('[slot="credit-bar"]')?.innerText || '0';
        const permalink = c.getAttribute('permalink') ? `https://reddit.com${c.getAttribute('permalink')}` : window.location.href;
        
        // Body text in slot="comment"
        const bodyEl = c.querySelector('div[slot="comment"]') || c.querySelector('div[id*="-post-rtjson-content"]');
        let body = '';
        if (bodyEl) {
          const clone = bodyEl.cloneNode(true);
          clone.querySelectorAll('script, style, svg').forEach(s => s.remove());
          body = cleanText(clone.innerText || clone.textContent);
        }

        if (body.length > 0) {
          results.push({
            author: author.replace(/^u\//, ''),
            score: score.toString(),
            body: body,
            isQuestion: body.includes('?'),
            permalink: permalink
          });
        }
      });
      if (results.length > 0) return results;
    }

    // Strategy 2: React Redesign / Desktop Reddit (div[data-testid="comment"])
    const testidComments = document.querySelectorAll('div[data-testid="comment"]');
    if (testidComments.length > 0) {
      testidComments.forEach((c) => {
        const authorEl = c.closest('[data-testid="post-container"], div')?.querySelector('a[href*="/user/"]') || c.querySelector('a[href*="/user/"]');
        const author = authorEl ? cleanText(authorEl.innerText) : 'anonymous';
        
        const scoreEl = c.closest('div')?.querySelector('[id*="vote-arrows"], button[aria-label*="upvote"]') || c.querySelector('[data-testid="comment-score"]');
        const score = scoreEl ? cleanText(scoreEl.innerText) : '0';

        const bodyEl = c.querySelector('[data-testid="comment"]') || c;
        const clone = bodyEl.cloneNode(true);
        clone.querySelectorAll('script, style, button, svg').forEach(s => s.remove());
        const body = cleanText(clone.innerText || clone.textContent);

        if (body.length > 0) {
          results.push({
            author: author.replace(/^u\//, ''),
            score: score || '0',
            body: body,
            isQuestion: body.includes('?'),
            permalink: window.location.href
          });
        }
      });
      if (results.length > 0) return results;
    }

    // Strategy 3: Old Reddit or Test Grounds (.comment or .reddit-comment)
    const fallbackComments = document.querySelectorAll('.comment, .reddit-comment, [data-comment]');
    fallbackComments.forEach((c) => {
      const author = c.querySelector('.author, .reddit-author')?.innerText || 'anonymous';
      const score = c.querySelector('.score, .reddit-score')?.innerText || '0';
      const body = c.querySelector('.md, .reddit-body, p')?.innerText || cleanText(c.innerText);

      if (body && body.length > 0) {
        results.push({
          author: cleanText(author).replace(/^u\//, ''),
          score: cleanText(score),
          body: cleanText(body),
          isQuestion: body.includes('?'),
          permalink: window.location.href
        });
      }
    });

    return results;
  }

  // Floating helper badge on Reddit threads
  function showRedditBadge(count) {
    if (document.getElementById('reddit-intel-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'reddit-intel-badge';
    badge.innerHTML = `
      <span class="reddit-intel-count">${count} Comments</span>
      <button class="reddit-intel-btn" id="reddit-intel-extract-btn">Extract CSV</button>
    `;

    badge.querySelector('#reddit-intel-extract-btn').addEventListener('click', () => {
      const comments = parseRedditComments();
      const csv = toCSV(comments);
      const postSlug = window.location.pathname.split('/')[4] || 'reddit_post';
      downloadFile(csv, `reddit_intel_${postSlug}_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
      showToast(`Exported ${comments.length} comments to CSV`);
    });

    document.body.appendChild(badge);
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

  function downloadFile(content, fileName, mimeType) {
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

  function showToast(message) {
    const existing = document.getElementById('reddit-intel-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'reddit-intel-toast';
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 250);
      }
    }, 2400);
  }

  // Automatic detection
  setTimeout(() => {
    const comments = parseRedditComments();
    if (comments.length > 0 && window.location.hostname.includes('reddit.com')) {
      showRedditBadge(comments.length);
    }
  }, 1200);

  // Message listener for Popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SCAN_REDDIT_COMMENTS') {
      const comments = parseRedditComments();
      const title = document.querySelector('h1, [data-testid="post-title"]')?.innerText || document.title;
      sendResponse({
        success: true,
        title: cleanText(title),
        url: window.location.href,
        comments: comments
      });
      return true;
    }
  });
})();
