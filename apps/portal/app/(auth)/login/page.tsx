// import { MagicLinkForm } from '@/components/auth/magic-link-form'; // TODO: Uncomment when email domain is set up
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import Link from 'next/link';
import Image from 'next/image';
// import { Card, CardContent } from '@/components/ui/card'; // TODO: Uncomment when Magic Link is enabled
// import { CheckCircle2 } from 'lucide-react'; // TODO: Uncomment when Magic Link is enabled

// TODO: Uncomment when Magic Link is enabled
// function Divider({ text }: { text: string }) {
//   return (
//     <div className="relative my-6">
//       <div className="absolute inset-0 flex items-center">
//         <span className="w-full border-t border-border/60" />
//       </div>
//       <div className="relative flex justify-center text-xs uppercase">
//         <span className="bg-card px-3 text-muted-foreground font-medium">{text}</span>
//       </div>
//     </div>
//   );
// }

interface LoginPageProps {
  searchParams: Promise<{ verify?: string; error?: string; callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  // const showVerifyMessage = params.verify === 'true'; // TODO: Uncomment when Magic Link is enabled
  const error = params.error;

  return (
    <div className="flex min-h-screen">
      {/* Left Side - Login Form */}
      <div className="w-full lg:w-2/5 flex flex-col justify-between p-8 lg:p-12 bg-white dark:bg-zinc-950">
        {/* Logo */}
        <div>
          <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            latte lab
          </span>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
          {/* Welcome Text */}
          <div className="space-y-2 mb-8">
            <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
              Welcome to Latte Lab!
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400">
              Bringing engineers, scientists, and coffee lovers together to drive innovation, community, and coffee science at MIT.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">
                {error === 'OAuthAccountNotLinked'
                  ? 'This email is already associated with another account. Please sign in with the original provider.'
                  : 'An error occurred during sign in. Please try again.'}
              </p>
            </div>
          )}

          {/* TODO: Uncomment when Magic Link is enabled */}
          {/* Verify Message */}
          {/* {showVerifyMessage && (
            <div className="mb-6 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <p className="text-sm text-green-600 dark:text-green-400">
                  Check your email for a sign-in link
                </p>
              </div>
            </div>
          )} */}

          {/* OAuth Buttons */}
          <div className="space-y-3">
            <OAuthButtons />
          </div>

          {/* TODO: Uncomment when Magic Link is enabled */}
          {/* <Divider text="or" /> */}
          {/* <MagicLinkForm /> */}

          {/* Terms */}
          <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
            By signing up, you agree to our{' '}
            <Link href="/privacy" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link href="/terms" className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
              Terms of Service
            </Link>
          </p>
        </div>

        {/* Bottom spacer for balance */}
        <div />
      </div>

      {/* Right Side - Gradient Image */}
      <div className="hidden lg:block lg:w-3/5 relative">
        <Image
          src="/images/gradient-bg.png"
          alt="Gradient background"
          fill
          className="object-cover"
          priority
        />
      </div>
    </div>
  );
}
