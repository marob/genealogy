import { child, childValue, children, parseLines, pointer } from './lines.js';

describe('parseLines', () => {
  it('construit l’arbre des enregistrements', () => {
    const { records, warnings } = parseLines(
      ['0 HEAD', '1 CHAR UTF-8', '0 @I1@ INDI', '1 NAME Jean /DUPONT/', '2 GIVN Jean', '1 SEX M', '0 TRLR'].join(
        '\r\n',
      ),
    );
    expect(warnings).toEqual([]);
    expect(records.map((r) => r.tag)).toEqual(['HEAD', 'INDI', 'TRLR']);
    const indi = records[1]!;
    expect(indi.xref).toBe('I1');
    expect(childValue(indi, 'NAME')).toBe('Jean /DUPONT/');
    expect(childValue(child(indi, 'NAME'), 'GIVN')).toBe('Jean');
    expect(childValue(indi, 'SEX')).toBe('M');
  });

  it('fusionne CONC et CONT', () => {
    const { records } = parseLines(['0 @N1@ NOTE Première', '1 CONC  partie', '1 CONT Seconde ligne'].join('\n'));
    expect(records[0]!.value).toBe('Première partie\nSeconde ligne');
    expect(records[0]!.children).toEqual([]);
  });

  it('accepte les fins de ligne CR seules, les espaces initiaux et les tags en minuscules', () => {
    const { records } = parseLines('0 HEAD\r  1 char ANSEL\r0 TRLR');
    expect(childValue(records[0], 'CHAR')).toBe('ANSEL');
  });

  it('signale les lignes invalides et les sauts de niveau', () => {
    const { records, warnings } = parseLines(['0 @I1@ INDI', 'n’importe quoi', '3 DATE 1900'].join('\n'));
    expect(records).toHaveLength(1);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('Ligne 2');
    expect(warnings[1]).toContain('Ligne 3');
  });

  it('liste les enfants d’un tag et lit les pointeurs', () => {
    const { records } = parseLines(['0 @F1@ FAM', '1 CHIL @I1@', '1 CHIL @I2@'].join('\n'));
    expect(children(records[0], 'CHIL').map((c) => pointer(c.value))).toEqual(['I1', 'I2']);
    expect(pointer('pas un pointeur')).toBeUndefined();
  });
});
