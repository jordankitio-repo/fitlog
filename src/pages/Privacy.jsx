// src/pages/Privacy.jsx
export default function Privacy() {
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
        Privacy Policy
      </h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 48 }}>Last updated July 12, 2026</p>

      <section style={{ marginBottom: 40 }}>
        <p style={p}>
          This Privacy Policy for Digigarden LLC ("we," "us," or "our") describes how and why we collect, store,
          use, and share your personal information when you use our services ("Services") at{' '}
          <a href="https://www.gardnr.fit" style={link}>https://www.gardnr.fit</a>.
        </p>
        <p style={p}>
          If you do not agree with our policies and practices, please do not use our Services. Questions or
          concerns? Contact us at <a href="mailto:digigardenllc@gmail.com" style={link}>digigardenllc@gmail.com</a>.
        </p>
        <p style={p}>
          Gardnr handles health-related information. If you are a resident of Washington, Nevada, or Connecticut,
          please also review our separate{' '}
          <a href="/health-data-privacy" style={link}>Consumer Health Data Privacy Policy</a>.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>1. What Information Do We Collect?</h2>
        <p style={p}><strong style={{ color: 'var(--color-text)' }}>Personal information you provide to us:</strong></p>
        <ul style={ul}>
          <li style={li}>Name and email address (collected at registration)</li>
          <li style={li}>Account credentials (password stored as a secure hash — we never see your plain-text password)</li>
          <li style={li}>Health and fitness data you voluntarily enter: body weight, body measurements (e.g. neck, chest, waist, hips, arm, thigh), nutrition intake (calories and macronutrients), cardio activity, and step counts</li>
          <li style={li}>Profile and biometric details used to estimate your daily targets: sex, date of birth, height, activity level, and your weight or body-composition goals</li>
          <li style={li}>A profile photo, if you choose to upload one (stored in our Supabase storage)</li>
          <li style={li}>Coaching content: targets set by coaches, messages, reports, check-ins, and private notes</li>
          <li style={li}>Payment information (processed by Stripe — we do not store your card details)</li>
        </ul>
        <p style={p}><strong style={{ color: 'var(--color-text)' }}>Information collected automatically:</strong></p>
        <p style={p}>
          When you visit the Services, we may automatically collect certain technical information such as your IP
          address, browser type, device characteristics, and usage data. This information is primarily used to
          maintain the security and operation of our Services.
        </p>
        <p style={p}>
          To keep you signed in and remember preferences such as your theme, we store information in your browser's
          local storage. We do not use advertising or tracking cookies. See Section 4 for more detail.
        </p>
        <p style={p}>
          On public marketing pages only, we use first-party, cookieless Vercel Web Analytics to measure page visits
          and trial-start interactions. It receives no account identifiers, and its requests are sent through our own
          domain. This analytics does not run on signed-in or health-data routes.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>2. How Do We Process Your Information?</h2>
        <p style={p}>We process your personal information to:</p>
        <ul style={ul}>
          <li style={li}>Create and manage your account</li>
          <li style={li}>Provide the coaching and tracking features of the Services</li>
          <li style={li}>Process payments and manage subscriptions via Stripe</li>
          <li style={li}>Send transactional emails (report notifications, check-in notifications, nudges) via Resend</li>
          <li style={li}>Generate AI-powered coaching reports and call prep briefs via Anthropic Claude API</li>
          <li style={li}>Maintain the security and operation of the Services</li>
          <li style={li}>Comply with applicable legal obligations</li>
        </ul>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>3. When and With Whom Do We Share Your Information?</h2>
        <p style={p}>We do not sell your personal information. We share your information only in the following situations:</p>
        <ul style={ul}>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Stripe</strong> — to process subscription payments. Stripe's privacy policy applies to payment data.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Supabase</strong> — our database and authentication provider. Your data is stored on Supabase-managed infrastructure hosted on AWS.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Resend</strong> — to send transactional emails on our behalf.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Google</strong> — if you choose to sign in with Google OAuth, we receive your name and email address from Google.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Anthropic</strong> — health and fitness data included in AI report generation is processed by Anthropic's API. See Section 8 for details.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Sentry</strong> — our error-monitoring provider. It receives technical error reports (error messages, stack traces, browser/device info) to help us diagnose problems. We configure it not to send your health data.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Business transfers</strong> — we may share your information in connection with a merger, sale, or acquisition of all or a portion of our business.</li>
        </ul>
        <p style={p}>
          Coach and client data is shared between coach and client within the platform as a core feature of the
          Services. Coaches can view their connected clients' logged data. Clients can view reports and messages
          sent by their coach.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>4. Cookies and Local Storage</h2>
        <p style={p}>
          We do not use advertising or third-party tracking cookies, and we do not use cookies to track you across
          other websites. To keep you signed in, Supabase Auth stores your session token in your browser's local
          storage, and we use local storage to remember preferences such as your theme and which notifications you
          have seen. These are necessary for the Services to function and are not shared with third parties.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>5. How Do We Handle Social Logins?</h2>
        <p style={p}>
          Our Services offer you the ability to register and log in using your Google account. When you choose
          to do this, we receive your name and email address from Google. We use this information only to create
          and manage your Gardnr account. We do not control Google's use of your personal information — please
          review Google's privacy policy for more information.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>6. Is Your Information Transferred Internationally?</h2>
        <p style={p}>
          Our Services are hosted in the United States via Supabase on AWS (East US region). If you access the
          Services from outside the United States, please be aware that your information will be transferred to,
          stored, and processed in the United States.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>7. How Long Do We Keep Your Information?</h2>
        <p style={p}>
          We keep your personal information for as long as you have an active account with us. When you delete
          your account via the Profile page, we permanently delete all of your data from our active databases.
          This includes your nutrition logs, weight logs, body measurements, cardio logs, step logs, profile and
          biometric details, any uploaded profile photo, messages, reports, and all other data associated with
          your account.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>8. AI-Generated Content</h2>
        <p style={p}>
          Gardnr uses Anthropic Claude for the following features:
        </p>
        <ul style={ul}>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Weekly coaching reports</strong> — coaches generate a report for each client using 7 days of logged nutrition, weight, cardio, steps, and check-in responses. The coach reviews and edits before sending.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Call prep briefs</strong> — a private AI-generated summary for the coach before a client call, using recent compliance and check-in data. Not visible to clients.</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>AI nutrition advice</strong> — available to coaches and Solo Premium subscribers. Uses the current day's logged nutrition entries to generate feedback.</li>
        </ul>
        <p style={p}>
          When these features are used, the relevant data described above is sent to Anthropic's API for
          processing. This data is subject to{' '}
          <a href="https://www.anthropic.com/privacy" style={link} target="_blank" rel="noopener noreferrer">
            Anthropic's privacy policy
          </a>. Gardnr does not use your health data to train AI models. AI features are only triggered by
          explicit coach or user action — no data is sent to Anthropic automatically or on a schedule.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>9. Do We Collect Information from Minors?</h2>
        <p style={p}>
          We do not knowingly collect, solicit data from, or market to children under 18 years of age. By using
          the Services, you represent that you are at least 18 years old. If we learn that personal information
          from users less than 18 years of age has been collected, we will deactivate the account and delete
          such data. If you become aware of any such data, please contact us at{' '}
          <a href="mailto:digigardenllc@gmail.com" style={link}>digigardenllc@gmail.com</a>.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>10. What Are Your Privacy Rights?</h2>
        <p style={p}>You have the right to:</p>
        <ul style={ul}>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Access</strong> — request a copy of the personal information we hold about you</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Correct</strong> — update inaccurate information via your account settings</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Delete</strong> — permanently delete your account and all associated data via the Profile page</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Export</strong> — download your data via the Profile page</li>
          <li style={li}><strong style={{ color: 'var(--color-text)' }}>Withdraw consent</strong> — contact us at any time to withdraw consent to processing</li>
        </ul>
        <p style={p}>
          To exercise any of these rights, visit your{' '}
          <a href="/profile" style={link}>Profile page</a> or contact us at{' '}
          <a href="mailto:digigardenllc@gmail.com" style={link}>digigardenllc@gmail.com</a>.
        </p>
        <p style={p}>
          <strong style={{ color: 'var(--color-text)' }}>California residents</strong> have additional rights
          under the CCPA/CPRA, including the right to know what personal information is collected, the right to
          delete personal information, and the right to opt out of the sale of personal information. We do not
          sell personal information. To submit a request, contact us at{' '}
          <a href="mailto:digigardenllc@gmail.com" style={link}>digigardenllc@gmail.com</a>.
        </p>
        <p style={p}>
          <strong style={{ color: 'var(--color-text)' }}>Residents of other U.S. states</strong> with comprehensive
          privacy laws (including Virginia, Colorado, Connecticut, Utah, Texas, and Oregon) have similar rights to
          access, correct, delete, and obtain a portable copy of their personal information, and to appeal a denied
          request. We do not sell personal information or use it for targeted advertising. To exercise these rights,
          contact us at <a href="mailto:digigardenllc@gmail.com" style={link}>digigardenllc@gmail.com</a>.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>11. Security</h2>
        <p style={p}>
          We have implemented appropriate technical and organizational security measures to protect your personal
          information. These include row-level security on all database tables, encrypted connections (HTTPS),
          server-side API key management, hashed password storage, and a private, access-controlled store for
          profile photos. However, no electronic transmission or storage system is 100% secure, and we cannot
          guarantee absolute security. If a breach affecting your personal information occurs, we will notify you
          and any relevant authorities as required by applicable law, including the FTC Health Breach Notification
          Rule.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>12. Do-Not-Track Features</h2>
        <p style={p}>
          Most web browsers include a Do-Not-Track ("DNT") feature. We do not currently respond to DNT browser
          signals as no uniform technology standard for recognizing and implementing DNT signals has been finalized.
          If a standard is adopted that we must follow, we will update this Privacy Policy accordingly.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>13. Updates to This Policy</h2>
        <p style={p}>
          We may update this Privacy Policy from time to time. The updated version will be indicated by an updated
          date at the top of this page. If we make material changes, we will notify you by email. We encourage
          you to review this Privacy Policy periodically.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>14. Contact Us</h2>
        <p style={p}>
          If you have questions or comments about this Privacy Policy, or to submit a data access, correction,
          or deletion request, please contact us at:
        </p>
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
