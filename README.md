# Mastra テスト自動修正プロジェクト

## 概要

このプロジェクトは、Mastraフレームワークを使用して構築された、テストの自動修正を行うためのツールです。失敗したテストを検出し、関連ファイルを分析し、AIエージェントを利用してテストコードを自動的に修正することを試みます。

## 主な機能

- 指定されたテストスクリプトを実行し、失敗したテストを特定します。
- 失敗したテストファイルと関連する可能性のあるファイルをAIエージェントが分析します。
- AIエージェントがテストコードの修正案を生成します。
- 修正されたコードで再度テストを実行し、成功するまで（または最大試行回数に達するまで）処理を繰り返します。

## 必要なもの

- Node.js
- pnpm (または npm/yarn)
- Google AI Studioなどで取得したAPIキー (Geminiモデルを利用するため)

## セットアップ

1.  リポジトリをクローンします。
    ```bash
    git clone <リポジトリURL>
    cd test-agent
    ```
2.  依存関係をインストールします。
    ```bash
    pnpm install
    ```
3.  `.env` ファイルを作成し、環境変数を設定します。ルートディレクトリに `.env` ファイルを作成してください。

    ```env
    TARGET_FOLDER=path/to/your/target/project
    TEST_SCRIPT="your_test_command"
    # 例:
    # TARGET_FOLDER=../my-sample-app
    # TEST_SCRIPT="pnpm test"

    # Google Gemini APIキー (testFixAgent, relatedFileSearchAgent で使用)
    # GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY
    ```

    `GOOGLE_API_KEY` は、`@ai-sdk/google` を利用する際に必要となります。プロジェクト内のエージェント (`src/mastra/agents/testFix.ts`, `src/mastra/agents/relatedFileSearch.ts`) でGoogleのモデルを使用しているため、適切なAPIキーを設定してください。

## 実行方法

以下のコマンドで、テスト修正ワークフローを実行します。

```bash
pnpm start
```

これにより、`src/mastra/index.ts` が実行され、`testFixWorkflow` が開始されます。
ワークフローは `.env` ファイルで指定された `TARGET_FOLDER` 内の `TEST_SCRIPT` を実行し、テストの自動修正を試みます。

## 主要なコンポーネント

### Workflows (`src/mastra/workflows/`)

- **`testFixWorkflow`**: メインのワークフローです。
  1.  `runInitialTestsStep`: 初回テストを実行し、失敗したテストファイルを特定します。
  2.  `fixTestStep`: 失敗した各テストファイルに対して `singleTestFixWorkflow` を呼び出します。
- **`singleTestFixWorkflow`**: 個別のテストファイルを修正するためのサブワークフローです。
  1.  `relatedFileSearchStep`: AIエージェント (`relatedFileSearchAgent`) を使用して、テストファイルに関連する可能性のあるソースコードファイルを特定します。
  2.  `fixSingleTestStep`: AIエージェント (`testFixAgent`) を使用して、テストコードを修正します。テストが成功するか、最大試行回数（デフォルトでは2回）に達するまで繰り返します。
- **`coverageFixWorkflow` (`coverageFix.ts`)**: (詳細は現時点では不明ですが、将来的にはテストカバレッジの改善に関連する機能を提供する可能性があります。)

### Agents (`src/mastra/agents/`)

- **`relatedFileSearchAgent` (`relatedFileSearch.ts`)**:
  - モデル: `gemini-2.0-flash`
  - 役割: 与えられたテストファイルの内容に基づき、修正に役立つ可能性のある関連ソースコードファイルを特定します。
- **`testFixAgent` (`testFix.ts`)**:
  - モデル: `gemini-2.5-flash-preview-04-17`
  - 役割: テストファイル、関連ファイルの内容、およびエラーメッセージに基づき、テストコードを修正します。

## 設定

- **テスト対象フォルダ**: `.env` ファイルの `TARGET_FOLDER` で指定します。
- **テスト実行スクリプト**: `.env` ファイルの `TEST_SCRIPT` で指定します。
- **修正試行回数**: `src/mastra/workflows/testFix.ts` 内の `singleTestFixWorkflow` の `.dountil` 条件 (`inputData.count >= 2`) で変更可能です。

## 注意点

- このツールは実験的なものであり、すべてのテストエラーを修正できるわけではありません。
- AIエージェントによるコード修正は、必ずしも最適または意図した通りであるとは限りません。生成されたコードは確認することを推奨します。
- 大規模なプロジェクトや複雑なエラーの場合、修正に時間がかかったり、期待通りに動作しない可能性があります。

## 今後の展望

- 対応可能なテストフレームワークの拡充
- カバレッジ向上機能の強化 (`coverageFixWorkflow` の実装)
- ユーザーによる対話的な修正プロセスの導入
- より高度なAIモデルの活用とプロンプトエンジニアリングの改善
