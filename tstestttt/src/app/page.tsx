import { Button } from '@/components/ui/button';
import { auth, getServerSession } from '@/lib/auth';
import { headers as getHeaders } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function Home() {
  const headers = await getHeaders();
  const user = await getServerSession(headers);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center text-3xl text-center">
      hello world
  <p className="text-sm">{user && 'Logged in as ' + user.user.email}</p>
      <div className="fixed top-5 right-5">
        {user ? (
          <Button
            variant="outline"
            onClick={async () => {
              'use server';
              auth.api.signOut({ headers });
              redirect('/sign-in');
            }}
          >
            Sign out
          </Button>
        ) : (
          <Link href="/sign-in">
            <Button>Sign in</Button>
          </Link>
        )}
      </div>
    </div>
  );
}