// src/pages/Terms.jsx
export default function Terms() {
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
        Terms of Service
      </h1>
      <p style={{ color: 'var(--color-muted)', marginBottom: 48 }}>Last updated June 22, 2026</p>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>Agreement to Our Legal Terms</h2>
        <p style={p}>
          We are Digigarden LLC ("Company," "we," "us," "our"), a company registered in Texas, United States.
          We operate the website <a href="https://www.gardnr.fit" style={link}>https://www.gardnr.fit</a> (the "Site"),
          as well as any other related products and services that refer or link to these legal terms (collectively, the "Services").
        </p>
        <p style={p}>
          Gardnr is a web-based fitness coaching platform that helps coaches track client nutrition, body composition,
          and activity data. Clients log daily nutrition, weight, cardio, and steps. Coaches set targets, monitor
          compliance, and send weekly coaching reports.
        </p>
        <p style={p}>
          You can contact us by email at <a href="mailto:digigardenllc@gmail.com" style={link}>digigardenllc@gmail.com</a>.
        </p>
        <p style={p}>
          These Legal Terms constitute a legally binding agreement made between you and Digigarden LLC concerning your
          access to and use of the Services. By accessing the Services, you have read, understood, and agreed to be
          bound by all of these Legal Terms. IF YOU DO NOT AGREE WITH ALL OF THESE LEGAL TERMS, THEN YOU ARE
          EXPRESSLY PROHIBITED FROM USING THE SERVICES AND YOU MUST DISCONTINUE USE IMMEDIATELY.
        </p>
        <p style={p}>
          We will notify you of any changes to these Legal Terms by email. By continuing to use the Services after
          the effective date of any changes, you agree to be bound by the modified terms.
        </p>
        <p style={p}>
          The Services are intended for users who are at least 18 years old. Persons under the age of 18 are not
          permitted to use or register for the Services.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>1. Our Services</h2>
        <p style={p}>
          The Services are not tailored to comply with industry-specific regulations such as the Health Insurance
          Portability and Accountability Act (HIPAA) or the Federal Information Security Management Act (FISMA).
          If your interactions would be subject to such laws, you may not use the Services.
        </p>
        <p style={p}>
          The information provided through the Services is not intended for distribution to or use by any person or
          entity in any jurisdiction where such distribution or use would be contrary to law or regulation.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>2. Intellectual Property Rights</h2>
        <p style={p}>
          We are the owner or licensee of all intellectual property rights in our Services, including all source code,
          databases, functionality, software, website designs, audio, video, text, photographs, and graphics
          (collectively, the "Content"), as well as the trademarks, service marks, and logos contained therein (the "Marks").
        </p>
        <p style={p}>
          Subject to your compliance with these Legal Terms, we grant you a non-exclusive, non-transferable, revocable
          license to access the Services solely for your personal, non-commercial use or internal business purpose.
          No part of the Services may be copied, reproduced, distributed, sold, or otherwise exploited for any
          commercial purpose without our express prior written permission.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>3. User Representations</h2>
        <p style={p}>By using the Services, you represent and warrant that:</p>
        <ul style={ul}>
          <li style={li}>All registration information you submit will be true, accurate, current, and complete.</li>
          <li style={li}>You have the legal capacity and agree to comply with these Legal Terms.</li>
          <li style={li}>You are not a minor in the jurisdiction in which you reside.</li>
          <li style={li}>You will not access the Services through automated or non-human means.</li>
          <li style={li}>You will not use the Services for any illegal or unauthorized purpose.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>4. User Registration</h2>
        <p style={p}>
          You may be required to register to use the Services. You agree to keep your password confidential and
          will be responsible for all use of your account and password. We reserve the right to remove, reclaim,
          or change a username you select if we determine, in our sole discretion, that such username is
          inappropriate, obscene, or otherwise objectionable.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>5. Purchases and Payment</h2>
        <p style={p}>We accept the following forms of payment: Visa, Mastercard, American Express, and Discover.</p>
        <p style={p}>
          You agree to provide current, complete, and accurate purchase and account information for all purchases
          made via the Services. All payments shall be in US dollars. We may change prices at any time and reserve
          the right to correct any errors in pricing.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>6. Subscriptions</h2>
        <p style={p}>
          Your subscription will continue and automatically renew unless canceled. The length of your billing cycle
          is monthly.
        </p>
        <p style={p}>
          <strong>Free Trials.</strong> New coach accounts receive a 30-day free trial. New Solo Premium accounts
          receive a 14-day free trial. At the end of the applicable trial period the account will be charged
          according to the chosen subscription plan. Free trials are available once per email address and are
          not transferable. If you have previously used a free trial on Gardnr, the trial period will not apply
          to subsequent subscriptions started with the same email address.
        </p>
        <p style={p}>
          <strong>Cancellation.</strong> All purchases are non-refundable. You may cancel your subscription at any
          time via the Profile page within the Services, or by contacting us at{' '}
          <a href="mailto:digigardenllc@gmail.com" style={link}>digigardenllc@gmail.com</a>. Your cancellation
          will take effect at the end of the current paid term — access continues until that date.
        </p>
        <p style={p}>
          <strong>Coach Cancellation and Client Impact.</strong> If a coach's subscription is canceled or lapses,
          the coach's clients will be transitioned to individual accounts at the end of the coach's current billing
          period. Clients will retain all of their logged data and may continue using the Services as solo users.
          Clients will be notified via the in-app Dashboard when this transition occurs.
        </p>
        <p style={p}>
          <strong>Solo Premium — Pause and Resume.</strong> If a Solo Premium subscriber joins a coaching plan,
          their Solo Premium subscription will be paused for the duration of the coaching relationship. The
          remaining days on the subscription at the time of pausing will be preserved and restored automatically
          when the coaching relationship ends. No charges occur during a pause.
        </p>
        <p style={p}>
          <strong>Fee Changes.</strong> We may make changes to the subscription fee and will communicate any price
          changes to you in accordance with applicable law.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>7. Prohibited Activities</h2>
        <p style={p}>You may not access or use the Services for any purpose other than that for which we make the Services available. As a user of the Services, you agree not to:</p>
        <ul style={ul}>
          <li style={li}>Systematically retrieve data or other content from the Services to create or compile a collection, database, or directory without written permission from us.</li>
          <li style={li}>Trick, defraud, or mislead us and other users, especially in any attempt to learn sensitive account information such as user passwords.</li>
          <li style={li}>Circumvent, disable, or otherwise interfere with security-related features of the Services.</li>
          <li style={li}>Use any information obtained from the Services to harass, abuse, or harm another person.</li>
          <li style={li}>Use the Services in a manner inconsistent with any applicable laws or regulations.</li>
          <li style={li}>Attempt to impersonate another user or person or use the username of another user.</li>
          <li style={li}>Interfere with, disrupt, or create an undue burden on the Services or the networks connected to the Services.</li>
          <li style={li}>Use the Services to advertise or offer to sell goods and services.</li>
          <li style={li}>Sell or otherwise transfer your profile.</li>
          <li style={li}>Upload false or misleading health data with intent to deceive a coach or client.</li>
          <li style={li}>Upload or share any image or content that is unlawful, infringing, obscene, or that you do not have the rights to use.</li>
          <li style={li}>Use the Services as part of any effort to compete with us or for any revenue-generating endeavor without our authorization.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>8. User Generated Contributions</h2>
        <p style={p}>
          The Services allow you to create, submit, post, transmit, and upload content including coaching notes,
          reports, messages, logged data, and profile photos or other images (collectively, "Contributions"). You
          are solely responsible for your Contributions and represent that they are accurate and lawful, that you
          own or have the necessary rights to them, and that they do not infringe any third-party rights.
        </p>
        <p style={p}>
          By uploading a profile photo or other image, you grant us a non-exclusive, royalty-free license to store,
          display, and process it solely to operate and provide the Services — for example, displaying your photo to
          you and to a coach or client you are connected with. This license ends when you remove the image or delete
          your account.
        </p>
        <p style={p}>
          We reserve the right to remove or edit any Contributions at any time without notice if we consider them
          harmful or in breach of these Legal Terms.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>9. Services Management</h2>
        <p style={p}>
          We reserve the right to monitor the Services for violations of these Legal Terms, take appropriate legal
          action against anyone who violates the law or these Legal Terms, and manage the Services in a manner
          designed to protect our rights and property and to facilitate the proper functioning of the Services.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>10. Privacy Policy</h2>
        <p style={p}>
          We care about data privacy and security. By using the Services, you agree to be bound by our{' '}
          <a href="/privacy" style={link}>Privacy Policy</a>, which is incorporated into these Legal Terms.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>11. Term and Termination</h2>
        <p style={p}>
          These Legal Terms shall remain in full force and effect while you use the Services. We reserve the right
          to deny access to and use of the Services to any person for any reason, including for breach of any
          provision of these Legal Terms. If we terminate or suspend your account, you are prohibited from
          registering and creating a new account under your name or any other name.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>12. Modifications and Interruptions</h2>
        <p style={p}>
          We reserve the right to change, modify, or remove the contents of the Services at any time at our sole
          discretion without notice. We cannot guarantee the Services will be available at all times and will not
          be liable for any loss or inconvenience caused by downtime or discontinuance of the Services.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>13. Governing Law</h2>
        <p style={p}>
          These Legal Terms and your use of the Services are governed by and construed in accordance with the laws
          of the State of Texas, without regard to its conflict of law principles.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>14. Dispute Resolution</h2>
        <p style={p}>
          <strong>Informal Negotiations.</strong> To expedite resolution of any dispute, the parties agree to first
          attempt to negotiate any dispute informally for at least thirty (30) days before initiating arbitration.
          Such informal negotiations commence upon written notice from one party to the other.
        </p>
        <p style={p}>
          <strong>Binding Arbitration.</strong> If the parties are unable to resolve a dispute through informal
          negotiations, the dispute will be finally and exclusively resolved by binding arbitration under the
          Commercial Arbitration Rules of the American Arbitration Association (AAA). The arbitration will take
          place in Harris County, Texas. If arbitration fees are determined by the arbitrator to be excessive,
          we will pay all arbitration fees and expenses.
        </p>
        <p style={p}>
          <strong>Restrictions.</strong> Any arbitration shall be limited to the dispute between the parties
          individually. No arbitration shall be joined with any other proceeding, and there is no right or
          authority for any dispute to be arbitrated on a class-action basis.
        </p>
        <p style={p}>
          If a dispute proceeds in court rather than arbitration, the dispute shall be commenced or prosecuted
          in the state and federal courts located in Harris County, Texas.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>15. Disclaimer</h2>
        <p style={p}>
          THE SERVICES ARE PROVIDED ON AN AS-IS AND AS-AVAILABLE BASIS. TO THE FULLEST EXTENT PERMITTED BY LAW,
          WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE MAKE NO WARRANTIES ABOUT THE ACCURACY OR
          COMPLETENESS OF THE SERVICES' CONTENT.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>16. Limitations of Liability</h2>
        <p style={p}>
          IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY
          DIRECT, INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR
          USE OF THE SERVICES. OUR LIABILITY TO YOU FOR ANY CAUSE WHATSOEVER WILL AT ALL TIMES BE LIMITED TO THE
          AMOUNT PAID, IF ANY, BY YOU TO US DURING THE SIX (6) MONTH PERIOD PRIOR TO ANY CAUSE OF ACTION ARISING.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>17. Indemnification</h2>
        <p style={p}>
          You agree to defend, indemnify, and hold us harmless, including our officers, agents, partners, and
          employees, from and against any loss, damage, liability, claim, or demand arising out of your use of
          the Services, your Contributions, breach of these Legal Terms, or violation of any third-party rights.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>18. User Data</h2>
        <p style={p}>
          We will maintain certain data that you transmit to the Services for the purpose of managing the
          performance of the Services. Although we perform regular backups, you are solely responsible for all
          data that you transmit or that relates to any activity you have undertaken using the Services.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>19. Health Data Disclaimer</h2>
        <p style={p}>
          Gardnr is a productivity and tracking tool, not a medical service. Nothing on Gardnr constitutes medical
          advice, diagnosis, or treatment. Nutrition targets and AI-generated coaching reports are informational
          only. Any starting targets we estimate from the details you provide (such as the target calculator) are
          general estimates, not a personalized medical or nutritional prescription. Always consult a qualified
          healthcare provider before making changes to your diet or exercise routine.
        </p>
        <p style={p}>
          Coaches using Gardnr are independent professionals. Digigarden LLC is not responsible for advice,
          targets, or recommendations set by coaches for their clients.
        </p>
        <p style={p}>
          If a coach cancels their subscription, client data is retained and not deleted. Clients retain access
          to their own logged data and may continue logging independently as solo users. Coach access to client
          data is suspended but not destroyed.
        </p>
        <p style={p}>
          <strong>Client Reconnection.</strong> After a coaching relationship ends — whether due to coach
          cancellation, client departure, or coach account deletion — a client may only rejoin a coach (including
          the same coach, if their account remains active) by accepting a new invitation. No automatic
          reconnection occurs.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>20. Miscellaneous</h2>
        <p style={p}>
          These Legal Terms and any policies posted by us on the Services constitute the entire agreement between
          you and us. If any provision of these Legal Terms is determined to be unlawful, void, or unenforceable,
          that provision is deemed severable and does not affect the validity of any remaining provisions.
          There is no joint venture, partnership, employment, or agency relationship created between you and us
          as a result of these Legal Terms.
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={h2}>21. Contact Us</h2>
        <p style={p}>
          To resolve a complaint regarding the Services or to receive further information, please contact us at:
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
  textDecoration: 'none',
}
