// app/privacy/page.js — Privacy Policy (required for Chrome Web Store + GDPR)

export const metadata = {
  title: 'Privacy Policy — WatchTogether',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0f0f0f] py-16 px-4">
      <div className="max-w-2xl mx-auto">

        <div className="mb-10">
          <a href="/" className="text-red-600 text-sm hover:underline">← Back</a>
          <h1 className="text-3xl font-bold text-white mt-4 mb-2">Privacy Policy</h1>
          <p className="text-gray-500 text-sm">Last updated: 2025</p>
        </div>

        {[
          {
            title: 'What we collect',
            body: `WatchTogether collects only what is necessary to run a watch party session:\n• Display name you choose (not stored after session ends)\n• Room code (temporary, expires in 10 minutes)\n• Chat messages (end-to-end encrypted, not stored on our servers)\nWe do not collect email addresses, passwords, or payment information.`,
          },
          {
            title: 'What we do NOT collect',
            body: `• We do not record or store your video or screen share\n• We do not track which content you watch\n• We do not sell your data to third parties\n• We do not use advertising or analytics trackers`,
          },
          {
            title: 'How data flows',
            body: `Video and audio travel peer-to-peer (WebRTC) directly between participants — they do not pass through our servers. Chat messages are encrypted client-side using libsodium before transmission. Our signaling server only facilitates the initial connection handshake.`,
          },
          {
            title: 'TURN servers',
            body: `In some network conditions we use TURN relay servers (Metered.ca) to establish peer connections. These servers relay encrypted media only; they cannot decrypt or record content. TURN credentials are short-lived and rotate per session.`,
          },
          {
            title: 'Cookies and local storage',
            body: `The Chrome extension stores your display name and room preferences locally in your browser using chrome.storage.local. This data never leaves your device. The web app does not use cookies.`,
          },
          {
            title: 'Children',
            body: `WatchTogether is not directed at children under 13. We do not knowingly collect information from children.`,
          },
          {
            title: 'Changes to this policy',
            body: `If we make material changes we will update the date above. Continued use of WatchTogether after changes constitutes acceptance.`,
          },
          {
            title: 'Contact',
            body: `Questions about privacy? Open an issue at github.com/Dhthakkar/watchtogether`,
          },
        ].map(({ title, body }) => (
          <div key={title} className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-2">{title}</h2>
            <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">{body}</p>
          </div>
        ))}

      </div>
    </main>
  );
}
