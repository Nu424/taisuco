import './App.css';

function App() {
  return (
    <div className="popup-container">
      <h1 className="extension-name">🕒たいすこ</h1>
      <p className="tagline">YouTubeのタイムスタンプ付きコメントをまとめてチェック</p>
      <ol className="steps">
        <li>動画ページでコメント欄を表示</li>
        <li>サイドバー上部の「コメント読み込み」をクリック</li>
        <li>タイムスタンプをクリックして動画をジャンプ</li>
      </ol>
    </div>
  );
}

export default App;
