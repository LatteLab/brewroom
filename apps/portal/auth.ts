import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
// import Okta from 'next-auth/providers/okta'; // TODO: Uncomment when Okta is configured
import Resend from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';
import { users, accounts, verificationTokens } from '@/lib/db/schema';
import { isAdmin, isProfileComplete, applyProfileSeed } from '@/lib/db/queries';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),

  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
    // TODO: Uncomment when Okta is configured
    // Okta({
    //   clientId: process.env.AUTH_OKTA_ID,
    //   clientSecret: process.env.AUTH_OKTA_SECRET,
    //   issuer: process.env.AUTH_OKTA_ISSUER,
    //   allowDangerousEmailAccountLinking: true,
    // }),
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM,
    }),
  ],

  session: {
    strategy: 'jwt',
  },

  pages: {
    signIn: '/login',
    error: '/login',
    verifyRequest: '/login?verify=true',
  },

  callbacks: {
    async jwt({ token, user }) {
      // Re-validate admin status on every token refresh, not just at login.
      // This ensures revoked admins lose access immediately rather than at JWT expiry.
      const email = (user?.email ?? token.email) as string | undefined;
      if (!email) return token;

      // Run isAdmin and (on first login) applyProfileSeed in parallel — they're independent.
      const userId = (user?.id ?? token.sub) as string | undefined;
      const seedPromise = user?.id
        ? applyProfileSeed(user.id, email).catch(err =>
            console.error('[auth] applyProfileSeed failed:', err)
          )
        : Promise.resolve();

      const profilePromise = userId
        ? isProfileComplete(userId)
        : Promise.resolve(true);

      const [isAdminResult, profileComplete] = await Promise.all([
        isAdmin(email),
        profilePromise,
        seedPromise,
      ]);
      token.isAdmin = isAdminResult;
      token.profileComplete = profileComplete;
      return token;
    },

    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.sub as string;
        session.user.isAdmin = token.isAdmin as boolean;
        session.user.profileComplete = (token.profileComplete as boolean) ?? true;
      }
      return session;
    },
  },
});
