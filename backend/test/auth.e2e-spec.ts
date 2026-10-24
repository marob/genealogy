import type { MeDto, UserDto } from '@genealogie/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { UsersService } from '../src/users/users.service.js';
import { createTestApp, loginAs, type TestContext } from './utils/test-app.js';

describe('Authentification et utilisateurs', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({
      ADMIN_EMAILS: 'boss@example.com',
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret',
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const server = (): App => ctx.app.getHttpServer() as App;

  describe('GET /api/me', () => {
    it('décrit un visiteur anonyme et les fournisseurs disponibles', async () => {
      const me = (await request(server()).get('/api/me').expect(200)).body as MeDto;
      expect(me).toEqual({ providers: [{ name: 'google', label: 'Google' }], devBypass: false });
    });

    it('décrit l’utilisateur connecté', async () => {
      const cookie = await loginAs(ctx, { email: 'me@example.com', canSeeContemporary: true });
      const me = (await request(server()).get('/api/me').set('Cookie', cookie).expect(200)).body as MeDto;
      expect(me.user).toMatchObject({ email: 'me@example.com', role: 'MEMBER', canSeeContemporary: true });
    });

    it('ignore un cookie de session falsifié', async () => {
      const me = (await request(server()).get('/api/me').set('Cookie', 'genealogie_session=abc.def.ghi').expect(200))
        .body as MeDto;
      expect(me.user).toBeUndefined();
    });

    it('ignore la session d’un utilisateur supprimé', async () => {
      const cookie = await loginAs(ctx, { email: 'deleted@example.com' });
      await ctx.prisma.user.delete({ where: { email: 'deleted@example.com' } });
      const me = (await request(server()).get('/api/me').set('Cookie', cookie).expect(200)).body as MeDto;
      expect(me.user).toBeUndefined();
    });
  });

  describe('OIDC', () => {
    it('répond 404 pour un fournisseur non configuré', async () => {
      await request(server()).get('/api/auth/facebook/login').expect(404);
    });

    it('redirige vers la connexion en cas de callback sans transaction', async () => {
      const response = await request(server()).get('/api/auth/google/callback?code=x&state=y').expect(302);
      expect(response.headers.location).toBe('http://localhost:4200/login?error=expired');
    });

    it('déconnecte en supprimant le cookie', async () => {
      const response = await request(server()).post('/api/auth/logout').expect(204);
      expect(String(response.headers['set-cookie'])).toContain('genealogie_session=;');
    });
  });

  describe('création des comptes à la connexion', () => {
    const users = () => ctx.app.get(UsersService);

    it('crée un membre sans droit à la première connexion', async () => {
      const user = await users().loginWithIdentity({
        provider: 'google',
        subject: 'g-1',
        email: 'New@Example.com',
        emailVerified: true,
        name: 'Nouveau',
      });
      expect(user).toMatchObject({
        email: 'new@example.com',
        role: 'MEMBER',
        canSeeContemporary: false,
        displayName: 'Nouveau',
      });
    });

    it('retrouve le compte par identité puis par e-mail vérifié', async () => {
      const again = await users().loginWithIdentity({ provider: 'google', subject: 'g-1', emailVerified: false });
      const linked = await users().loginWithIdentity({
        provider: 'facebook',
        subject: 'fb-1',
        email: 'new@example.com',
        emailVerified: true,
      });
      expect(again.id).toBe(linked.id);
      expect(await ctx.prisma.identity.count({ where: { userId: linked.id } })).toBe(2);
    });

    it('refuse une identité sans e-mail vérifié', async () => {
      await expect(
        users().loginWithIdentity({ provider: 'google', subject: 'g-2', email: 'x@example.com', emailVerified: false }),
      ).rejects.toThrow(/vérifiée/);
    });

    it('promeut admin les e-mails configurés', async () => {
      const boss = await users().loginWithIdentity({
        provider: 'google',
        subject: 'g-boss',
        email: 'boss@example.com',
        emailVerified: true,
      });
      expect(boss.role).toBe('ADMIN');
    });
  });

  describe('administration des utilisateurs', () => {
    let admin: string;
    let adminId: number;

    beforeAll(async () => {
      admin = await loginAs(ctx, { email: 'admin@example.com', role: 'ADMIN' });
      adminId = (await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } })).id;
    });

    it('liste les utilisateurs (admin uniquement)', async () => {
      const member = await loginAs(ctx, { email: 'plain@example.com' });
      await request(server()).get('/api/admin/users').set('Cookie', member).expect(403);
      const list = (await request(server()).get('/api/admin/users').set('Cookie', admin).expect(200)).body as UserDto[];
      expect(list.map((u) => u.email)).toContain('plain@example.com');
    });

    it('accorde le droit de voir les contemporains', async () => {
      const target = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'plain@example.com' } });
      const updated = (
        await request(server())
          .patch(`/api/admin/users/${target.id}`)
          .set('Cookie', admin)
          .send({ canSeeContemporary: true })
          .expect(200)
      ).body as UserDto;
      expect(updated.canSeeContemporary).toBe(true);
    });

    it('valide les modifications', async () => {
      await request(server())
        .patch(`/api/admin/users/${adminId}`)
        .set('Cookie', admin)
        .send({ role: 'ROOT' })
        .expect(400);
      await request(server())
        .patch(`/api/admin/users/${adminId}`)
        .set('Cookie', admin)
        .send({ email: 'x' })
        .expect(400);
      await request(server()).patch('/api/admin/users/99999').set('Cookie', admin).send({ role: 'ADMIN' }).expect(404);
    });

    it('empêche un admin de se rétrograder ou de se supprimer', async () => {
      await request(server())
        .patch(`/api/admin/users/${adminId}`)
        .set('Cookie', admin)
        .send({ role: 'MEMBER' })
        .expect(403);
      await request(server()).delete(`/api/admin/users/${adminId}`).set('Cookie', admin).expect(403);
    });

    it('supprime un utilisateur', async () => {
      const target = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'plain@example.com' } });
      await request(server()).delete(`/api/admin/users/${target.id}`).set('Cookie', admin).expect(204);
      expect(await ctx.prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    });

    it('accepte une origine identique à l’hôte de la requête (serveur de dev sur un autre port)', async () => {
      await request(server())
        .patch(`/api/admin/users/${adminId}`)
        .set('Cookie', admin)
        .set('Host', 'localhost:4201')
        .set('Origin', 'http://localhost:4201')
        .send({ canSeeContemporary: true })
        .expect(200);
    });

    it('refuse les requêtes modifiantes venant d’une autre origine', async () => {
      await request(server())
        .patch(`/api/admin/users/${adminId}`)
        .set('Cookie', admin)
        .set('Origin', 'https://evil.example.com')
        .send({ canSeeContemporary: true })
        .expect(403);
    });
  });
});
