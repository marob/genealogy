import { htmlToText, noteText } from './notes.js';

describe('notes', () => {
  it('converts the HTML notes of Généatique to text', () => {
    const note =
      '#Générale#HTML<html>\n<head></head><body>\n<div><span style="font-size:10pt;">Brouill&#233; avec &quot;X&quot; &amp; Y&nbsp;!</span></div>' +
      '<div>Deuxi&#xE8;me ligne<br>suite</div>\n</body></html>';
    expect(noteText(note)).toBe('Brouillé avec "X" & Y !\nDeuxième ligne\nsuite');
  });

  it('removes the category prefix of plain notes', () => {
    expect(noteText('#Générale#Né à la maison.')).toBe('Né à la maison.');
    expect(noteText('Une note ordinaire  ')).toBe('Une note ordinaire');
  });

  it('keeps unknown entities and collapses blank lines', () => {
    expect(htmlToText('<p>a &unknown; b</p><p></p><p></p><p>c</p>')).toBe('a &unknown; b\n\nc');
  });
});
