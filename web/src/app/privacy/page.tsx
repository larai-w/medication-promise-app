import LegalDocument from '@/components/LegalDocument'

export default function PrivacyPage() {
  return (
    <LegalDocument title="プライバシーポリシー" updated="2026年8月12日">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">1. この文書について</h2>
        <p>VEAI LAB.は、服薬記録・生活支援ツール「おくすりの約束」の限定テストを運営します。この文書では、テスト中に扱う情報と、その利用方法を説明します。</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">2. 扱う情報</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>服薬を記録した日付、時刻、区分、入力元</li>
          <li>利用者が任意で入力したメモ</li>
          <li>Alexaリマインダーの設定に必要な権限情報</li>
          <li>障害調査に必要なアクセス時刻やエラー情報</li>
          <li>本人が任意で許可した場合、記録の保存にかかった時間</li>
        </ul>
        <p className="mt-2">当システムはAlexaへ話しかけた音声録音そのものを保存しません。Amazon側での音声データの扱いは、Amazonのプライバシーに関する案内をご確認ください。</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">3. 利用目的</h2>
        <p>服薬記録の保存・表示・PDF作成、Alexaでの記録とリマインダー、障害対応、限定テストでの改善にのみ利用します。任意の利用統計には薬名、記録内容、メモ、端末を追跡するIDを含めません。広告配信やデータ販売には利用しません。</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">4. 保存と外部サービス</h2>
        <p>記録と設定は限定テストへの参加中、または削除を依頼するまで保存します。本人が任意で許可した保存時間の統計は35日以内に自動削除します。記録の保存とアプリの運用にはAmazon Web Servicesを、音声操作にはAmazon Alexaを利用します。削除後も、障害復旧用バックアップには最大35日間データが残る場合があります。バックアップは通常の画面から参照できず、個別の削除を取り消すためには利用しません。法令上必要な場合を除き、目的なく第三者へ情報を提供しません。</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">5. 削除と問い合わせ</h2>
        <p>限定テスト参加者は、画面から個別の記録を削除できます。世帯データの一括削除が設定画面で利用できる場合は、削除範囲と注意事項を確認してから実行できます。利用できない場合の一括削除や、限定テストへの参加終了、ログイン用認証アカウントの削除は、<a className="text-indigo-700 underline" href="mailto:info@veai.jp">info@veai.jp</a>へご連絡ください。Alexa側のリマインダーはこの操作の対象外のため、Alexaアプリで削除してください。</p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">6. 変更</h2>
        <p>扱う情報や機能が変わる場合は、この文書を更新し、重要な変更はテスト参加者へ案内します。</p>
      </section>
    </LegalDocument>
  )
}
