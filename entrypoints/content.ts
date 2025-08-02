export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  main() {
    initTimestampCommentExtractor();
  },
});

interface TimestampComment {
  commentElementInnerHTML: string;
  timestamps: string[];
}

class TimestampCommentExtractor {
  private container: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private lastUrl = '';
  private timestampComments: TimestampComment[] = [];
  private sortOrder: 'comment' | 'time' = 'comment';

  init() {
    this.lastUrl = window.location.href;
    this.waitForSecondaryInner(() => {
      this.createContainer();
      this.setupObserver();
      this.setupNavigationWatcher();
    });
  }

  private waitForSecondaryInner(callback: () => void) {
    const checkInterval = setInterval(() => {
      const secondaryInner = document.querySelector('#secondary-inner');

      if (secondaryInner) {
        clearInterval(checkInterval);
        callback();
      }
    }, 500);

    // 10秒でタイムアウト
    setTimeout(() => clearInterval(checkInterval), 10000);
  }

  private createContainer() {
    const secondaryInner = document.querySelector('#secondary-inner');
    if (!secondaryInner) return;

    // 既存のコンテナを削除
    const existingContainer = document.querySelector('#ts-comment-list');
    if (existingContainer) {
      existingContainer.remove();
    }

    // 新しいコンテナを作成
    this.container = document.createElement('div');
    this.container.id = 'ts-comment-list';
    this.container.innerHTML = `
      <div class="ts-comment-header">
        <h3>🕒たいすこ</h3>
        <div class="ts-header-controls">
          <select class="ts-sort-select" id="ts-sort-select">
            <option value="comment">コメント順</option>
            <option value="time">時間順</option>
          </select>
          <button class="ts-refresh-button" id="ts-refresh-btn">
            <span class="ts-refresh-icon">🔄</span>
            <span class="ts-refresh-text">コメント読み込み</span>
          </button>
        </div>
      </div>
      <div class="ts-comment-content">
        <div class="ts-comment-empty">「コメント読み込み」ボタンを押してください</div>
      </div>
    `;
    this.container.addEventListener('click', (e) => {
      if (e.target instanceof HTMLElement && e.target.tagName.toLowerCase() === 'a') {
        // ---タイムスタンプをクリックしたら、プレイヤーの再生位置を設定する
        e.preventDefault();
        const href = e.target.getAttribute('href');
        const timeStr = href?.match(/(?<=&t=)\d+(?=s)/)?.[0]; // 「&t=」から「s」までの数字を取得
        if (timeStr) {
          const video = document.querySelector('#movie_player > div.html5-video-container > video');
          if (video && video instanceof HTMLVideoElement) {
            video.currentTime = parseInt(timeStr);
            video.play();
          }
        }
      }
    });

    // スタイルを追加
    this.addStyles();

    // secondary-innerの最初に挿入
    secondaryInner.insertBefore(this.container, secondaryInner.firstChild);

    // イベントリスナーを追加
    const refreshButton = this.container.querySelector('#ts-refresh-btn');
    const sortSelect = this.container.querySelector('#ts-sort-select') as HTMLSelectElement;
    
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        this.refreshComments();
      });
    }
    
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        this.sortOrder = sortSelect.value as 'comment' | 'time';
        this.renderComments();
      });
    }
  }

  private addStyles() {
    if (document.querySelector('#ts-comment-styles')) return;

    const style = document.createElement('style');
    style.id = 'ts-comment-styles';
    style.textContent = `
      #ts-comment-list {
        background: var(--yt-spec-base-background);
        border: 1px solid var(--yt-spec-10-percent-layer);
        border-radius: 8px;
        margin-bottom: 16px;
        max-height: 400px;
        overflow: hidden;
      }

      .ts-comment-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--yt-spec-10-percent-layer);
        background: var(--yt-spec-raised-background);
        min-height: 56px;
      }

      .ts-comment-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--yt-spec-text-primary);
        letter-spacing: -0.1px;
        flex: 1;
      }

      .ts-header-controls {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }

      .ts-sort-select {
        padding: 8px 12px;
        border: 1px solid var(--yt-spec-10-percent-layer);
        border-radius: 18px;
        background: var(--yt-spec-base-background);
        color: var(--yt-spec-text-primary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        min-width: 100px;
        appearance: none;
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23606060' d='M6 8.825 2.075 4.9l.85-.85L6 7.125 9.075 4.05l.85.85L6 8.825Z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
        padding-right: 28px;
      }

      .ts-sort-select:hover {
        border-color: var(--yt-spec-text-secondary);
      }

      .ts-sort-select:focus {
        outline: 2px solid var(--yt-spec-call-to-action);
        outline-offset: 2px;
        border-color: var(--yt-spec-call-to-action);
      }

      .ts-refresh-button {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: var(--yt-spec-call-to-action);
        color: var(--yt-spec-text-primary-inverse);
        border: none;
        border-radius: 18px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s ease;
        min-height: 36px;
        white-space: nowrap;
      }

      .ts-refresh-button:hover {
        background: var(--yt-spec-call-to-action-hover);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      }

      .ts-refresh-button:active {
        transform: scale(0.98);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
      }

      .ts-refresh-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }

      .ts-refresh-button.loading .ts-refresh-icon {
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .ts-comment-content {
        padding: 12px 20px;
        max-height: 320px;
        overflow-y: auto;
        box-sizing: border-box;
      }

      .ts-comment-content::-webkit-scrollbar {
        width: 8px;
      }

      .ts-comment-content::-webkit-scrollbar-track {
        background: transparent;
      }

      .ts-comment-content::-webkit-scrollbar-thumb {
        background: var(--yt-spec-icon-inactive);
        border-radius: 4px;
      }

      .ts-comment-content::-webkit-scrollbar-thumb:hover {
        background: var(--yt-spec-text-secondary);
      }

      .ts-comment-item {
        display: flex;
        flex-direction: column;
        padding: 12px 16px;
        margin-bottom: 12px;
        background: var(--yt-spec-base-background);
        border: 1px solid var(--yt-spec-10-percent-layer);
        border-radius: 8px;
        font-size: 13px;
        transition: border-color 0.2s ease;
      }

      .ts-comment-item:hover {
        border-color: var(--yt-spec-text-secondary);
      }

      .ts-comment-item:last-child {
        margin-bottom: 0;
      }

      .ts-comment-timestamp-info {
        color: var(--yt-spec-text-secondary);
        font-size: 11px;
        margin-bottom: 6px;
        font-style: italic;
      }

      .ts-comment-html {
        color: var(--yt-spec-text-primary);
        line-height: 1.4;
        word-wrap: break-word;
      }

      .ts-comment-html a {
        color: var(--yt-spec-call-to-action);
        text-decoration: none;
      }

      .ts-comment-html a:hover {
        text-decoration: underline;
      }

      .ts-comment-empty {
        padding: 24px 16px;
        text-align: center;
        color: var(--yt-spec-text-secondary);
        font-style: italic;
        font-size: 14px;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
  }

  private extractTimestampComments(): TimestampComment[] {
    const commentSpans = document.querySelectorAll('#content-text > span');
    const timestampComments: TimestampComment[] = [];

    commentSpans.forEach((span) => {
      // タイムスタンプが存在するかチェック（子要素がspanで、そのさらに子要素がa）
      const hasTimestamp = Array.from(span.children).some(child => {
        if (child.tagName.toLowerCase() === 'span') {
          return Array.from(child.children).some(grandChild =>
            grandChild.tagName.toLowerCase() === 'a' &&
            grandChild.getAttribute('href')?.includes('&t=')
          );
        }
        return false;
      });

      if (hasTimestamp) {
        // すべてのタイムスタンプリンクを抽出
        const timestampLinks = span.querySelectorAll('span > a[href*="&t="]');
        const timestamps = Array.from(timestampLinks).map(link => link.textContent || '').filter(Boolean);

        if (timestamps.length > 0) {
          timestampComments.push({
            commentElementInnerHTML: span.innerHTML,
            timestamps: timestamps
          });
        }
      }
    });

    return timestampComments;
  }

  private refreshComments() {
    const refreshButton = this.container?.querySelector('#ts-refresh-btn');
    const refreshIcon = this.container?.querySelector('.ts-refresh-icon');
    const refreshText = this.container?.querySelector('.ts-refresh-text');

    if (refreshButton && refreshIcon && refreshText) {
      // ローディング状態に変更
      refreshButton.classList.add('loading');
      refreshButton.setAttribute('disabled', 'true');
      refreshText.textContent = '読み込み中...';

      // 少し遅延させてアニメーションを見せる
      setTimeout(() => {
        this.extractComments();
        this.renderComments();

        // ローディング状態を解除
        refreshButton.classList.remove('loading');
        refreshButton.removeAttribute('disabled');
        refreshText.textContent = 'コメントを更新';
      }, 500);
    }
  }

  private extractComments() {
    this.timestampComments = this.extractTimestampComments();
  }

  private renderComments() {
    if (!this.container) return;

    const contentDiv = this.container.querySelector('.ts-comment-content');
    if (!contentDiv) return;

    if (this.timestampComments.length === 0) {
      const commentsExist = document.querySelectorAll('#content-text > span').length > 0;
      const message = commentsExist
        ? 'タイムスタンプ付きコメントはありません'
        : 'コメント欄が読み込まれていません。ページを下にスクロールしてコメント欄を表示してから再度お試しください。';
      contentDiv.innerHTML = `<div class="ts-comment-empty">${message}</div>`;
      return;
    }

    // ソート順に応じてコメントを並び替え
    const sortedComments = this.getSortedComments();

    const html = sortedComments.map(comment => {
      // タイムスタンプ情報を表示用に整理
      const timestampInfo = comment.timestamps.length > 1
        ? `<div class="ts-comment-timestamp-info">タイムスタンプ: ${comment.timestamps.join(', ')}</div>`
        : '';

      return `
        <div class="ts-comment-item">
          ${timestampInfo}
          <div class="ts-comment-html">${comment.commentElementInnerHTML}</div>
        </div>
      `;
    }).join('');

    contentDiv.innerHTML = html;
  }

  private getSortedComments(): TimestampComment[] {
    if (this.sortOrder === 'comment') {
      return [...this.timestampComments]; // コメント順（元の順序）
    } else {
      // 時間順でソート
      return [...this.timestampComments].sort((a, b) => {
        const timeA = this.parseFirstTimestamp(a.timestamps[0]);
        const timeB = this.parseFirstTimestamp(b.timestamps[0]);
        return timeA - timeB;
      });
    }
  }

  private parseFirstTimestamp(timestamp: string): number {
    // タイムスタンプ文字列（例: "1:23", "12:34", "1:23:45"）を秒数に変換
    const parts = timestamp.split(':').map(part => parseInt(part, 10));
    if (parts.length === 2) {
      // mm:ss
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // hh:mm:ss
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  private setupObserver() {
    if (this.observer) {
      this.observer.disconnect();
    }

    // secondary-inner要素全体を監視してコメント欄の読み込みを検知
    const secondaryInner = document.querySelector('#secondary-inner');
    if (!secondaryInner) return;

    this.observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // コメント関連の要素が追加された場合のみ更新
          const addedNodes = Array.from(mutation.addedNodes);
          const hasCommentRelatedContent = addedNodes.some((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              return element.querySelector && (
                element.querySelector('#contents') ||
                element.querySelector('#content-text') ||
                element.id === 'contents' ||
                element.id === 'content-text'
              );
            }
            return false;
          });

          if (hasCommentRelatedContent) {
            shouldUpdate = true;
          }
        }
      });

      if (shouldUpdate) {
        // 自動更新は行わず、ボタンテキストで更新を促す
        const refreshText = this.container?.querySelector('.ts-refresh-text');
        if (refreshText && refreshText.textContent === 'コメントを更新') {
          refreshText.textContent = 'コメントを読み込み';
        }
      }
    });

    this.observer.observe(secondaryInner, {
      childList: true,
      subtree: true
    });
  }

  private setupNavigationWatcher() {
    // YouTube SPA ナビゲーション対応
    const checkUrlChange = () => {
      if (window.location.href !== this.lastUrl) {
        this.lastUrl = window.location.href;
        this.cleanup();
        // 新しいページが読み込まれるまで少し待つ
        setTimeout(() => this.init(), 1000);
      }
    };

    setInterval(checkUrlChange, 1000);
  }

  private cleanup() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.timestampComments = [];
    this.sortOrder = 'comment';
  }
}

function initTimestampCommentExtractor() {
  const extractor = new TimestampCommentExtractor();
  extractor.init();
}
