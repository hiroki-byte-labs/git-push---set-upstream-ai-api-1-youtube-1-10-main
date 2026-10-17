# 台本の版に結び付く事実・権利確認（T171、2026-10-17）

`produce fact-check <案件ID>` は原本を読まずに合格を出すコマンドではない。現在の台本に結び付いた**未確認のひな型**を作る。主張はunverified、素材はunknown/商用利用未確認であり、そのままでは台本を承認できない。

1. `produce script` で現在の台本を作る。
2. `produce fact-check <案件ID>` で `outputs/<案件ID>/fact-check.json` を作る。
3. 原本の該当箇所と実際の主張・数値を照合し、claim/citation/noteに本文と該当箇所を記録する。論文の所在を知っているだけでverifiedにしない。推論はinferenceと根拠note、架空例/本人考察はそれぞれ区別する。
4. ひな型の素材レコードを、実際に使う図形・フォント・音声等の権利記録に置き換える。未確認は未確認のまま残す。
5. 確認用の別ファイルを `produce fact-check <案件ID> --report /absolute/path/checked-report.json --by 記録者` で取り込む。
6. 合格になった**現在の台本の版**を本人が `produce script-review ... approve --hash ... --by ...` または確認画面で承認する。

既存のschema:1、planId、claims、assetsに加え、次のbindingが必要。ひな型が現在の値を出力するため、秘密値を扱う必要はない。

```json
{
  "binding": {
    "projectId": "production-案件ID",
    "scriptHash": "現在の台本の版（64桁SHA-256）",
    "scriptFileSha256": "現在の台本ファイルのSHA-256"
  }
}
```

取込時と承認時に案件ID、Plan ID、台本の版、台本ファイルhash、claims/assetsの形式と内容を再検査する。保存済みのok:trueや空のescalationsは信用せず、主張/権利レコードから結果を計算し直す。確認済み主張の出典ID/URLが台本と一致しない場合や、使用出典の照合記録が欠ける場合も停止する。

承認は正規化した確認レポートのhashにも結び付く。承認後にレポートが変更/削除/破損した場合は確認待ちへ戻り、制作・キュー投入を拒否する。CLI・HTTP確認画面・共通APIで同じ承認条件を使う。差戻しはレポートがなくても可能。

台本が変わったら原本との対応も確認し直す。古いレポートのbindingだけを新版に書き換えて流用しない。bindingのない旧レポート・旧承認は、新しい版との対応を証明できないため再確認・本人の再承認が必要。旧成果物は自動で書き換えない。

検査は照合記録の整合性を扱う。原本を読んだことや学術的な正しさを暗号学的に証明するものではなく、照合担当者の実作業と本人の内容確認が必要。tests/helpers/checked-facts.tsのレポートは明示的な模擬試験専用で、本番へ転用しない。
