import { Inject, Injectable } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaService } from '../database/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { parseAuthEnvironment } from '../config/auth-environment.js';
export function createAuth(prisma: PrismaService, email: EmailService) {
  const config = parseAuthEnvironment(process.env);
  return betterAuth({
    logger: { level: 'error' },
    appName: 'Graqivo',
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    basePath: '/api/auth',
    trustedOrigins: config.origins,
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 1800,
      sendResetPassword: async ({ user, token }) => {
        const url = new URL('/reset-password', config.FRONTEND_URL);
        url.hash = 'token=' + token;
        await email.send({
          to: user.email,
          subject: 'Reset your Graqivo password',
          text: 'Reset your password: ' + url.toString(),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: 3600,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) =>
        email.send({
          to: user.email,
          subject: 'Verify your Graqivo email',
          text: 'Verify your email address: ' + url,
        }),
    },
    session: {
      expiresIn: 604800,
      updateAge: 86400,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 120,
      customRules: {
        '/sign-in/email': { window: 60, max: 20 },
        '/sign-up/email': { window: 60, max: 10 },
        '/request-password-reset': { window: 60, max: 5 },
        '/send-verification-email': { window: 60, max: 5 },
      },
    },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: config.NODE_ENV === 'production',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
      },
      ipAddress: { ipAddressHeaders: ['x-graqivo-client-ip'] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const name = user.name.trim();
            if (name.length < 2 || name.length > 100 || user.email.length > 254)
              throw new APIError('BAD_REQUEST', {
                message:
                  'Enter a name between 2 and 100 characters and a valid email address',
              });
            return { data: { ...user, name, email: user.email.toLowerCase() } };
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            await prisma.auditEvent.create({
              data: { actorId: session.userId, action: 'SESSION_CREATED' },
            });
          },
        },
        delete: {
          after: async (session) => {
            await prisma.auditEvent.create({
              data: { actorId: session.userId, action: 'SESSION_REVOKED' },
            });
          },
        },
      },
    },
  });
}
@Injectable()
export class AuthService {
  readonly auth;
  constructor(
    @Inject(PrismaService) prisma: PrismaService,
    @Inject(EmailService) email: EmailService,
  ) {
    this.auth = createAuth(prisma, email);
  }
}
