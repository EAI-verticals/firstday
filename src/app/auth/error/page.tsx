import Link from 'next/link';

export default function AuthenticationError(): React.ReactNode {
  return (
    <main className='rw-signin ob-app fd-signin'>
      <section className='rw-signin-card'>
        <h1>We could not sign you in</h1>
        <p>
          Try again. If Microsoft still denies access, contact your
          administrator.
        </p>
        <Link className='ob-button primary' href='/'>
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
