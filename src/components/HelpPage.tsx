import Help from './Help'

// The public "How to use" page at /help — readable without an account, so the
// link can be shared.

export default function HelpPage() {
  return (
    <div className="help-page">
      <h1 className="help-title">How to use Where Is It</h1>
      <Help />
      <section className="help-join">
        <h3>Getting started</h3>
        <p>
          Open the app on your phone and create an account. You’ll need the access password from the person who invited
          you; after that you sign in with a passkey (Face ID, Touch ID or your phone’s screen lock). Your house is private
          to your account.
        </p>
        <a className="primary wide button-link" href="/">
          Open Where Is It
        </a>
      </section>
    </div>
  )
}
