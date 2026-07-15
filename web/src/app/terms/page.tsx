import LegalDocument from '@/components/LegalDocument'

export default function TermsPage() {
  return (
    <LegalDocument title="限定テスト利用条件" updated="2026年7月15日">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">1. 限定テスト</h2>
        <p>おくすりの約束は、招待されたご家族を対象とする開発中の限定テスト版です。機能の変更、停止、記録の不具合が起こる可能性があります。</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">2. 医療上の注意</h2>
        <p>本サービスは服薬記録・生活支援ツールであり、医療機器ではありません。服薬した事実を保証せず、診断、治療、服薬判断、緊急時の連絡を代替しません。薬の服用・変更・中止は、必ず医師や薬剤師の指示に従ってください。</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">3. 緊急時</h2>
        <p>体調の急変、誤薬、重複服用などが疑われる場合は、本サービスの応答を待たず、医療機関、救急相談窓口、担当の医療・介護職など適切な連絡先へ相談してください。</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">4. アクセスコード</h2>
        <p>アクセスコードは同じ世帯のテスト参加者だけで利用し、公開しないでください。不正利用が疑われる場合は、運営者がコードを変更または利用を停止することがあります。</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">5. 記録の確認</h2>
        <p>重要な判断の前には、表示された記録が実際の服薬状況と合っているか確認してください。PDFや集計結果も、医師・薬剤師へ相談するための補助資料として利用してください。</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">6. 問い合わせ</h2>
        <p>不具合、参加終了、データ削除については、<a className="text-indigo-700 underline" href="mailto:info@veai.jp">info@veai.jp</a>へご連絡ください。</p>
      </section>
    </LegalDocument>
  )
}
