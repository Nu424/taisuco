import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: "🕒たいすこ",
    description: "YouTube のタイムスタンプ付きコメントをサイドバー上部にまとめて表示する拡張機能",
    default_locale: "ja",
    icons: {
      "128": "assets/icon.png"
    },
    action: {
      default_title: "たいすこ"
    }
  },
  modules: ["@wxt-dev/module-react"],
});
