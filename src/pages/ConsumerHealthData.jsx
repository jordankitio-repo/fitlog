// src/pages/ConsumerHealthData.jsx
// Stand-alone Consumer Health Data Privacy Policy. US state "consumer health
// data" laws (Washington's My Health My Data Act, Nevada SB370, Connecticut)
// require a SEPARATE, distinctly-linked policy covering health data — this is it.
// Draft for counsel review.
export default function ConsumerHealthData() {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '48px 24px 80px',
        color: 'var(--color-text)',
        lineHeight: 1.8,
        fontSize: 'var(--text-sm)',
      }}
    >
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>
        Consumer Health Data Privacy Policy
      </h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 48 }}>Effective June 24, 2026 · Last updated June 25, 2026</p>

      <section style={{ marginBottom: 40 }}>
        <p style={p}>
          This Consumer Health Data Privacy Policy supplements our{' '}
          <a href="/privacy" style={link}>Privacy Policy</a> and applies specifically to "consumer health data"
          as defined by U.S. state laws including the Washington My Health My Data Act, Nevada SB 370, and the
          Connecticut Data Privacy Act. It describes how Digigarden LLC ("we," "us") collects, uses, shares, and
          protects health-related information through Gardnr (the "Services").
        </p>
        <p style={p}>
          Gardnr is a consumer nutrition- and body-composition-coaching tool. It is <strong style={{ color: 'var(--color-text)' }}>not</strong> a
          medical service, and we are not a HIPAA covered entity or business associate. The data below is information
          you choose to log to track your own progress and share with a coach you connect with.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>1. Consumer health data we collect</h2>
        <ul style={ul}>
          <li style={li}>Body weight (and the time of day you weighed in)</li>
          <li style={li}>Body measurements you enter (neck, chest, waist, hips, arm, thigh)</li>
          <li style={li}>Nutrition and diet information (foods, calories, protein, carbs, fat, meals)</li>
          <li style={li}>Cardio activity and daily step counts</li>
          <li style={li}>Biometric and profile details used to estimate targets: sex, date of birth, height, activity level, and body-composition goals</li>
          <li style={li}>A profile photo, if you choose to upload one</li>
          <li style={li}>Coaching content that reflects the above: check-ins, coach targets and notes, reports, and messages</li>
        </ul>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>2. Where this data comes from</h2>
        <p style={p}>
          We collect consumer health data <strong style={{ color: 'var(--color-text)' }}>directly from you</strong> when
          you enter it into the Services. If you are connected to a coach, that coach may also create related data
          about you (such as targets, reports, and private notes). We do not buy consumer health data, and we do not
          collect it from data brokers or advertising networks.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>3. Why we collect and use it</h2>
        <ul style={ul}>
          <li style={li}>To provide the tracking and coaching features you requested</li>
          <li style={li}>To let you and a coach you connect with review your progress</li>
          <li style={li}>To generate AI coaching reports, call-prep briefs, and nutrition feedback (only when you or your coach explicitly trigger them)</li>
          <li style={li}>To maintain the security and operation of the Services and to comply with legal obligations</li>
        </ul>
        <p style={p}>
          We do <strong style={{ color: 'var(--color-text)' }}>not</strong> use your consumer health data for targeted
          advertising, and we do <strong style={{ color: 'var(--color-text)' }}>not</strong> use it to train AI models.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>4. Who we share it with</h2>
        <p style={p}>We share consumer health data only as needed to run the Services:</p>
        <ul style={ul}>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Your coach or connected clients</strong> — sharing data between a coach and the client they are connected with is the core function of the Services.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Supabase</strong> — our database, authentication, and storage provider (hosted on AWS, U.S. East), which stores your data on our behalf.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Anthropic</strong> — when an AI feature is triggered, the relevant logged data is sent to Anthropic's Claude API to generate the text. Anthropic does not use it to train models.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Resend</strong> — our transactional email provider, used to send coaching-related notifications.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Vercel</strong> — our hosting and content-delivery provider.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>At your direction</strong> — when you explicitly ask us to share your information (for example, by connecting to a coach).</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Legal obligations</strong> — to comply with applicable law, a subpoena, a court order, or a valid government or law-enforcement request.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Corporate transactions</strong> — in connection with a merger, acquisition, or sale of our business, the data may transfer to the successor entity, which will remain bound by this Policy.</li>
        </ul>
        <p style={p}>
          Our service providers process consumer health data only on our behalf and are bound by contractual
          obligations restricting how they may use it.
        </p>
        <p style={p}>
          <strong style={{ color: 'var(--color-text)' }}>We do not sell your consumer health data</strong> — to anyone,
          for any purpose. We do not share it for cross-context behavioral advertising. We do not use geofencing to
          track your presence near any health-care facility.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>5. Consent</h2>
        <p style={p}>
          We collect and use your consumer health data primarily because it is necessary to provide the tracking and
          coaching service you specifically requested, and which you initiate by creating an account and choosing to
          log the data. Where the law requires consent beyond that — for any collection, use, or sharing not necessary
          to provide the Services you asked for — we will obtain your clear, voluntary, and unambiguous affirmative
          opt-in consent first. We will never use deceptive designs, pre-checked boxes, or bundled requests to obtain
          consent.
        </p>
        <p style={p}>
          You can withdraw consent at any time by deleting the relevant entries or your account. Because we never sell
          consumer health data or share it for targeted advertising, we do not seek the separate written authorization
          that those activities would require under the law.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>6. Your rights</h2>
        <p style={p}>You have the right to:</p>
        <ul style={ul}>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Access</strong> — confirm whether we process your consumer health data and get a copy. Use "Export my data" on your <a href="/profile" style={link}>Profile</a> page, which downloads all of it.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Delete</strong> — request deletion of your consumer health data. Deleting your account on the Profile page permanently removes your data from our systems, including your profile photo. Our service providers are contractually required to delete data they process for us, and data sent to our AI provider is automatically deleted within about 30 days.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Withdraw consent</strong> — stop logging, delete entries, or delete your account at any time.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Appeal</strong> — if we deny a request, you may appeal by replying to our decision; we will respond with our reasoning. Washington residents may also contact the Washington State Attorney General.</li>
        </ul>
        <p style={p}>
          We will not discriminate against you for exercising any of these rights. To make a request or appeal,
          contact us at <a href="mailto:digigardenllc@gmail.com" style={link}>digigardenllc@gmail.com</a>. To protect
          your data, we will take reasonable steps to verify your identity before acting on a request. We will respond
          within <strong style={{ color: 'var(--color-text)' }}>45 days</strong> of receiving a verifiable request (we
          may extend once by another 45 days where reasonably necessary, and will tell you if we do).
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>7. How we protect it</h2>
        <p style={p}>
          Consumer health data is protected by row-level security on every database table, encrypted (HTTPS)
          connections, hashed passwords, server-side key management, and a private, access-controlled store for
          profile photos. Access is limited to you, a coach you are actively connected with, and the service
          providers listed above. If a breach affecting your health data occurs, we will notify you consistent with
          the FTC Health Breach Notification Rule and applicable state law.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>8. Changes to this Policy</h2>
        <p style={p}>
          We may update this Policy to reflect changes in our practices or the law. When we do, we will revise the
          "Last updated" date above and post the new version on this page. If we make material changes, we will
          notify you by email.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>9. Contact</h2>
        <p style={{ ...p, color: 'var(--color-text)' }}>
          Digigarden LLC<br />
          <a href="mailto:digigardenllc@gmail.com" style={link}>digigardenllc@gmail.com</a>
        </p>
      </section>
    </div>
  )
}

const h2 = {
  fontSize: 'var(--text-md)',
  fontWeight: 600,
  color: 'var(--color-text)',
  marginBottom: 12,
  marginTop: 0,
  letterSpacing: '-0.01em',
}

const p = {
  color: 'var(--color-muted)',
  marginBottom: 16,
  marginTop: 0,
}

const ul = {
  color: 'var(--color-muted)',
  paddingLeft: 24,
  marginBottom: 16,
  marginTop: 0,
}

const li = {
  marginBottom: 8,
}

const link = {
  color: 'var(--color-primary)',
  textDecoration: 'underline',
}
