# 素材とライセンスの記録

このリポジトリにはプログラム、生成画像、動画、音楽、フォント、第三者ライブラリが含まれます。プロジェクト全体を一律のライセンスとして扱わず、各素材の条件を確認してください。プロジェクト独自のコードと素材について、管理者によるオープンソースライセンスの選定はまだ行っていません。

| 対象 | 出典・制作方法 | 配布時の注意 |
| --- | --- | --- |
| `vendor/three.bundle.js` | three.jsと同梱アドオン | `vendor/three-LICENSE.txt` のMITライセンスを保持 |
| `assets/fonts/` | Michroma、Zen Kaku Gothic New | 同梱する各OFL文書を保持 |
| `assets/units/`、`assets/skills/`、`assets/cover.png`、`assets/arena.webp`、`assets/reactor.webp` | 画像生成ツールで制作 | 追加・差し替え時は生成元と条件を記録 |
| `vendor/models.js` | Blenderスクリプトで組み立てたロボットのGLBを埋め込み | 生成コードは `tools/robots/`、再生成したファイルも同じPRで更新 |
| `assets/movie/opening.mp4`、`title-loop.mp4` | Claude側で制作されたオープニングとタイトル背景。Blenderでの描画、生成画像、合成音声を使用 | 完成したゲーム用動画を収録。Blenderの制作環境・全中間素材はこのリポジトリに含まれない |
| 動画中の地球画像 | 既存制作メモではNASA Visible EarthのBlue Marble・夜景をWikimedia Commons経由で使用 | 元の取得URLや素材単位の記録は管理者が補完。新規取得する素材もURLと条件を記録 |
| `assets/audio/Metal_and_Nerve.mp3` | ユーザー提供曲「Metal and Nerve」 | 提供ファイルを収録。第三者が別の作品で利用できるライセンスは、このリポジトリでは付与しない。作者・再配布条件の記録は管理者が補完 |
| `assets/audio/core-lockdown.mp3` | Pythonによるオリジナル合成曲 | 再生成用スクリプトは `tools/audio/compose_combat_music.py` |
| その他の効果音、`title-theme.wav` | Pythonで波形・ノイズを合成 | 現行の武器音の制作スクリプトは `tools/audio/reforge_weapon_audio.py`。タイトル音源はオープニング側の制作物 |

## 新しい素材を追加するとき

Pull Requestには次を記載してください。

1. ファイル名と用途。
2. 作者、取得先URL、または生成に使ったサービスと制作方法。
3. 利用条件、帰属表記の要否、加工と再配布が認められるか。
4. ライセンス文書を同梱した場所。
5. 素材を更新した担当者と日付。

秘密情報を誤ってpushした場合は、ファイルを消すだけで対応を終えず、対象の認証情報を失効・再発行し、管理者と履歴からの除去を相談してください。
