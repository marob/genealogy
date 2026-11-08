import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContributionDto, PersonDto } from '@genealogie/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { parseGedcom } from '../src/gedcom/gedcom-parser.js';
import { ImportsService } from '../src/imports/imports.service.js';
import { createTestApp, loginAs, seedGedcom, type TestContext } from './utils/test-app.js';
import { exportArchive } from './utils/zip.js';

const fixture = readFileSync(join(import.meta.dirname, 'fixtures/famille-martin.ged'), 'utf8');

describe('Proposed couples, unions and children of a couple', () => {
  let ctx: TestContext;
  let admin: string;
  let author: string;
  let father: ContributionDto;
  let mother: ContributionDto;
  let parentsUnion: ContributionDto;
  let child: ContributionDto;
  const server = (): App => ctx.app.getHttpServer() as App;
  const person = async (id: string) =>
    ((await request(server()).get(`/api/persons/${id}`).set('Cookie', author).expect(200)).body as PersonDto[])[0]!;
  const send = (body: object) => request(server()).post('/api/contributions').set('Cookie', author).send(body);
  const propose = async (body: object) => (await send(body).expect(201)).body as ContributionDto[];
  const review = (id: number, status: string) =>
    request(server()).patch(`/api/admin/contributions/${id}`).set('Cookie', admin).send({ status });
  const mine = async () =>
    (
      (await request(server()).get('/api/contributions/mine').set('Cookie', author).expect(200))
        .body as ContributionDto[]
    ).map((c) => c.id);

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedGedcom(ctx, fixture);
    admin = await loginAs(ctx, { email: 'admin@example.com', role: 'ADMIN' });
    author = await loginAs(ctx, { email: 'author@example.com' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('adds both parents of a person at once, with their union', async () => {
    // Pierre MARTIN has no parents in the genealogy.
    [father, mother, parentsUnion] = (await propose({
      kind: 'add-parents',
      personId: 'I0',
      father: { givenNames: 'Jean', surname: 'MARTIN', birthDate: 'vers 1780' },
      mother: { givenNames: 'Anne', surname: 'ROUX' },
      union: { marriageDate: '1805', marriagePlace: 'Lyon' },
    })) as [ContributionDto, ContributionDto, ContributionDto];
    expect(father).toMatchObject({ kind: 'add-person', relation: 'parent', fields: { sex: 'M' } });
    expect(mother).toMatchObject({ relation: 'parent', familyId: `WF${father.id}`, fields: { sex: 'F' } });
    expect(parentsUnion).toMatchObject({
      kind: 'edit-union',
      personId: `W${father.id}`,
      familyId: `WF${father.id}`,
      fields: { marriageDate: '1805', marriagePlace: 'Lyon' },
      partner: { givenNames: 'Anne', surname: 'ROUX' },
    });

    expect(await person('I0')).toMatchObject({ fatherId: `W${father.id}`, motherId: `W${mother.id}` });
    expect((await person(`W${father.id}`)).unions).toEqual([
      expect.objectContaining({
        familyId: `WF${father.id}`,
        partnerId: `W${mother.id}`,
        childIds: ['I0'],
        events: [
          {
            type: 'MARR',
            date: expect.objectContaining({ original: '1805' }) as unknown,
            place: { id: 0, name: 'Lyon' },
          },
        ],
        proposal: {
          status: 'pending',
          isNew: true,
          fields: ['marriageDate', 'marriagePlace'],
          pending: [parentsUnion.id],
        },
      }),
    ]);
    expect((await person(`W${mother.id}`)).unions[0]).toMatchObject({
      familyId: `WF${father.id}`,
      partnerId: `W${father.id}`,
      childIds: ['I0'],
    });
  });

  it('adds a child to a proposed couple', async () => {
    [child] = (await propose({
      kind: 'add-person',
      personId: `W${mother.id}`,
      relation: 'child',
      familyId: `WF${father.id}`,
      fields: { givenNames: 'Paul', surname: 'MARTIN' },
    })) as [ContributionDto];
    expect(child.partner).toEqual({ givenNames: 'Jean', surname: 'MARTIN' });
    expect(await person(`W${child.id}`)).toMatchObject({ fatherId: `W${father.id}`, motherId: `W${mother.id}` });
    expect((await person(`W${father.id}`)).unions[0]!.childIds).toEqual(['I0', `W${child.id}`]);
  });

  it('completes the known parents, and refuses a parent already known', async () => {
    // Émile MARTIN's father is known (F0), not his mother.
    const [emileMother, union] = (await propose({
      kind: 'add-parents',
      personId: 'I1',
      mother: { givenNames: 'Marie', surname: 'BLANC' },
      union: { marriageDate: 'vers 1840' },
    })) as [ContributionDto, ContributionDto];
    expect(emileMother.familyId).toBe('F0');
    expect(union).toMatchObject({ familyId: 'F0', previous: { marriageDate: '' } });
    expect((await person('I1')).motherId).toBe(`W${emileMother.id}`);
    expect((await person('I0')).unions.find((u) => u.familyId === 'F0')).toMatchObject({
      partnerId: `W${emileMother.id}`,
      events: [{ type: 'MARR', date: expect.objectContaining({ original: 'ABT 1840' }) as unknown }],
      proposal: { status: 'pending', fields: ['marriageDate'], pending: [union.id] },
    });
    await send({ kind: 'add-parents', personId: 'I1', father: { givenNames: 'X', surname: 'Y' } }).expect(409);
  });

  it('proposes the details of a union of the genealogy', async () => {
    const [edit] = (await propose({
      kind: 'edit-union',
      personId: 'I1',
      familyId: 'F1',
      fields: { marriageDate: '12/05/1880', marriagePlace: 'Lyon' },
    })) as [ContributionDto];
    expect(edit).toMatchObject({ partner: { givenNames: 'Hélène', surname: 'DUPRÉ' }, previous: {} });
    // Shown to the author on both partners.
    expect((await person('I2')).unions[0]).toMatchObject({
      events: [expect.objectContaining({ type: 'MARR', place: { id: 0, name: 'Lyon' } })],
      proposal: { status: 'pending', fields: ['marriageDate', 'marriagePlace'] },
    });
    await send({ kind: 'edit-union', personId: 'I1', familyId: 'F2', fields: { marriagePlace: 'Lyon' } }).expect(400);
    await send({ kind: 'edit-union', personId: 'I1', familyId: 'F1', fields: { marriagePlace: 'Lyon' } }).expect(400);
  });

  it('withdraws a proposed person with the proposals that depend on them', async () => {
    const [spouse, union] = (await propose({
      kind: 'add-person',
      personId: 'I3',
      relation: 'spouse',
      fields: { givenNames: 'Rose', surname: 'NOIR', sex: 'F' },
      union: { marriageDate: '1902' },
    })) as [ContributionDto, ContributionDto];
    expect(union).toMatchObject({ kind: 'edit-union', familyId: `WF${spouse.id}`, personId: 'I3' });
    const [daughter] = (await propose({
      kind: 'add-person',
      personId: 'I3',
      relation: 'child',
      familyId: `WF${spouse.id}`,
      fields: { givenNames: 'Lise', surname: 'MARTIN' },
    })) as [ContributionDto];
    await propose({ kind: 'edit', personId: `W${daughter.id}`, fields: { occupation: 'Couturière' } });
    expect((await person(`W${daughter.id}`)).proposal?.pending).toHaveLength(2);

    const before = await mine();
    await request(server()).delete(`/api/contributions/${spouse.id}`).set('Cookie', author).expect(204);
    expect(before.length - (await mine()).length).toBe(4);
    expect((await person('I3')).unions.map((u) => u.familyId)).toEqual(['F2']);
  });

  it('requires accepting the proposed person or union first', async () => {
    expect((await review(mother.id, 'approved')).status).toBe(409);
    expect((await review(parentsUnion.id, 'approved')).status).toBe(409);
    expect((await review(child.id, 'approved')).status).toBe(409);
    for (const contribution of [father, mother, parentsUnion, child]) {
      await review(contribution.id, 'approved').expect(200);
    }
  });

  it('exports the couple with their union and their children', async () => {
    const entries = await exportArchive(server(), admin);
    const bytes = [...entries.values()][0]!;
    const content = bytes.toString('utf8');
    const gedcom = parseGedcom(bytes);
    expect(gedcom.warnings).toEqual([]);
    expect(gedcom.families.find((f) => f.id === `WF${father.id}`)).toMatchObject({
      partner1Id: `W${father.id}`,
      partner2Id: `W${mother.id}`,
      childIds: ['I0', `W${child.id}`],
      events: [expect.objectContaining({ type: 'MARR', place: 'Lyon' })],
    });
    expect(content).toContain('2 DATE 1805');
    expect(content).toContain('1 NOTE Proposé via le site par author@example.com');
    expect(content).toContain('Date de mariage : (vide) → 1805');
  });

  it('marks the couple, their union and their child integrated once imported', async () => {
    const updated = fixture
      .replace('0 @I0@ INDI', '0 @I0@ INDI\n1 FAMC @F90@')
      .replace(
        '0 TRLR',
        [
          '0 @I90@ INDI',
          '1 NAME Jean /MARTIN/',
          '1 FAMS @F90@',
          '0 @I91@ INDI',
          '1 NAME Anne /ROUX/',
          '1 FAMS @F90@',
          '0 @I92@ INDI',
          '1 NAME Paul /MARTIN/',
          '1 FAMC @F90@',
          '0 @F90@ FAM',
          '1 HUSB @I90@',
          '1 WIFE @I91@',
          '1 MARR',
          '2 DATE 1805',
          '2 PLAC Lyon, 69123, Rhône',
          '1 CHIL @I0@',
          '1 CHIL @I92@',
          '0 TRLR',
        ].join('\n'),
      );
    const path = join(await mkdtemp(join(tmpdir(), 'couple-')), 'martin.ged');
    await writeFile(path, updated);
    const imports = ctx.app.get(ImportsService);
    const seed = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    const run = await imports.preview(
      { id: seed.id, email: seed.email, role: 'ADMIN', canSeeContemporary: true },
      { path, fileName: 'martin.ged' },
    );
    await imports.commit(run.id);
    const statuses = new Map(
      ((await request(server()).get('/api/admin/contributions').set('Cookie', admin)).body as ContributionDto[]).map(
        (c) => [c.id, c.status],
      ),
    );
    for (const contribution of [father, mother, parentsUnion, child]) {
      expect(statuses.get(contribution.id)).toBe('integrated');
    }
    expect((await person('I0')).fatherId).toBe('I90');
  });

  it('gives a spouse proposed afterwards the children proposed before, as their other parent', async () => {
    // A child of Hélène DUPRÉ whose father is unknown, then her new spouse; the given names may be unknown.
    const [daughter] = (await propose({
      kind: 'add-person',
      personId: 'I2',
      relation: 'child',
      fields: { surname: 'DUPRÉ', sex: 'F' },
    })) as [ContributionDto];
    await send({ kind: 'add-person', personId: 'I2', relation: 'child', fields: { sex: 'F' } }).expect(400);
    const [spouse] = (await propose({
      kind: 'add-person',
      personId: 'I2',
      relation: 'spouse',
      familyId: `WF${daughter.id}`,
      fields: { givenNames: 'Louis', surname: 'NOËL', sex: 'M' },
    })) as [ContributionDto];
    expect(await person(`W${daughter.id}`)).toMatchObject({ fatherId: `W${spouse.id}`, motherId: 'I2' });
    expect((await person(`W${spouse.id}`)).unions).toEqual([
      expect.objectContaining({ familyId: `WF${daughter.id}`, partnerId: 'I2', childIds: [`W${daughter.id}`] }),
    ]);
    // A union with two partners cannot be joined.
    await send({
      kind: 'add-person',
      personId: 'I2',
      relation: 'spouse',
      familyId: 'F1',
      fields: { givenNames: 'X' },
    }).expect(400);

    await review(daughter.id, 'approved').expect(200);
    await review(spouse.id, 'approved').expect(200);
    const bytes = [...(await exportArchive(server(), admin)).values()][0]!;
    expect(parseGedcom(bytes).families.find((f) => f.id === `WF${daughter.id}`)).toMatchObject({
      partner1Id: `W${spouse.id}`,
      partner2Id: 'I2',
      childIds: [`W${daughter.id}`],
    });
  });
});
