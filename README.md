# Copilot Speed

Copilot の長い会話で発生する操作の遅延を軽減する、Chromium 系ブラウザ向け拡張機能。
購読解除の処理を最適化し、利用者の実環境で改善を確認している。

## 導入

Release に添付した ZIP を展開し、ブラウザの拡張機能管理画面から読み込む。
ソースから使う場合は、このリポジトリの `extension` フォルダーを読み込む。

Copilot のタブで拡張機能を開き、「高速化を有効にする」をオンにしてページを再読み込みする。
詳しい手順と更新方法は [INSTALL.md](INSTALL.md) を参照。

## 動作

- サイト単位で高速化をオン・オフできる。
- 適用状態と、再読み込みが必要な場合の案内を表示する。
- 対応するコードと一致しなければ、最適化を適用しない。
- 遅延の計測、操作の記録、会話内容の保存、外部への送信は行わない。

実行対象は `copilot.com`、`copilot.microsoft.com`、`m365.cloud.microsoft`。
Microsoft 側の更新や実装の違いによって、適用できない場合がある。
会社の Vivaldi と Microsoft 365 Copilot Chat は環境別の確認が必要。

## 開発

Node.js 22 以降を使う。
ZIP の作成には Windows の PowerShell が必要。
拡張機能を使うだけなら Node.js は不要。

```powershell
npm ci
npm run check
npm test
npm run package
```

成果物は `dist/copilot-speed/` と `dist/copilot-speed-<version>.zip` に出力する。
比較試験用コードの取得、ブラウザテスト、ベンチマークの手順は [実装資料](docs/implementation.md) を参照。

## 構成

| パス | 内容 |
|---|---|
| `extension/` | ブラウザに読み込む拡張機能 |
| `scripts/` | 検証、パッケージ作成、開発用の補助処理 |
| `tests/` | 元の動作との比較を含む自動テスト |
| `docs/` | 調査結果と実装資料 |
| `docs/archive/` | 現行仕様と区別して保存する設計時の資料 |

元の性能トレース、取得した配布コード、ブラウザ、テスト結果、生成した ZIP は Git の管理対象に含めない。

## 資料

- [導入と更新](INSTALL.md)
- [実装と検証](docs/implementation.md)
- [送信遅延の調査](docs/investigation.md)
- [設計時の仕様案](docs/archive/spec.md)
