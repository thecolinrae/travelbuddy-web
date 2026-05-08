import NextAuth from 'next-auth';
import { prisma } from '@/lib/prisma';
import { activatePendingShares } from '@/services/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    {
      id: 'auth-hub',
      name: 'Auth Hub',
      type: 'oidc',
      issuer: process.env.AUTH_HUB_URL,
      clientId: process.env.AUTH_HUB_CLIENT_ID,
      clientSecret: process.env.AUTH_HUB_CLIENT_SECRET,
    },
  ],

  session: { strategy: 'jwt' },

  pages: {
    signIn: '/login',
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.userId = account.providerAccountId;
        token.userEmail = (profile?.email as string) ?? '';
        token.userName = (profile?.name as string) ?? null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.userAvatar = (profile?.image as string) ?? ((profile as any)?.picture as string) ?? null;

        // Link any pending trip shares for this email (first sign-in only)
        if (token.userEmail) {
          await activatePendingShares(
            token.userId as string,
            token.userEmail as string,
          ).catch(() => { /* best-effort */ });
        }
      }

      // Backfill userEmail from DB for sessions created before it was stored in the token.
      if (token.userId && !token.userEmail) {
        const row = await prisma.profile.findUnique({
          where: { id: token.userId as string },
          select: { email: true },
        }).catch(() => null);
        if (row?.email) token.userEmail = row.email;
      }

      // Always ensure the Profile row exists — recovers after a DB reset with valid cookie.
      if (token.userId) {
        await prisma.profile.upsert({
          where: { id: token.userId as string },
          create: {
            id: token.userId as string,
            email: (token.userEmail as string) ?? '',
            name: (token.userName as string) ?? null,
            avatarUrl: (token.userAvatar as string) ?? null,
          },
          update: {
            name: (token.userName as string) ?? null,
            avatarUrl: (token.userAvatar as string) ?? null,
          },
        }).catch(() => { /* best-effort */ });
      }

      return token;
    },

    async session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).userId = token.userId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).userEmail = token.userEmail;
      return session;
    },
  },
});
