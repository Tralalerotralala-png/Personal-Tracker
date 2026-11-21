import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {encryptJournal,decryptJournal,validPin,validNewJournalKey,emptyJournal,bytesToBase64} from '../js/ui/private-journal-crypto.js';
import {LESSONS,lessonForDate} from '../js/ui/daily-phrases.js';
if(!globalThis.crypto) globalThis.crypto=webcrypto;
test('PIN requires exactly four decimal digits',()=>{
 for(const pin of ['1234','0000','9999']) assert.equal(validPin(pin),true);
 for(const pin of ['123','12345','12a4','１２３４']) assert.equal(validPin(pin),false);
});
test('new journal setup and key rotation require a strong passphrase, but old PIN unlock still works',()=>{
 for(const pass of ['a securely memorized phrase','twelvechars!', 'abcdefghijkl'])
  assert.equal(validNewJournalKey(pass),true);
 for(const pass of ['1234','0000','short', '   twelvechars', 'abcdefghijkl ', 'x'.repeat(129)])
  assert.equal(validNewJournalKey(pass),false);
 assert.equal(validPin('1234'),true,'legacy 4-digit PINs must remain readable');
 const ui=new URL('../js/ui/dream-diary.js',import.meta.url);
});
test('private journal encrypts before sync and decrypts only with the correct PIN',async()=>{
 const original={...emptyJournal(),dreams:[{title:'Private dream',body:'secret library'}]};
 const encrypted=await encryptJournal('4831',original);
 assert.equal(encrypted.v,1);
 assert.equal(JSON.stringify(encrypted).includes('secret library'),false);
 assert.deepEqual(await decryptJournal('4831',encrypted),original);
 await assert.rejects(decryptJournal('1111',encrypted),/Incorrect PIN/);
});
test('journal encryption randomizes ciphertext and can rekey',async()=>{
 const first=await encryptJournal('1111',emptyJournal());
 const second=await encryptJournal('1111',emptyJournal());
 assert.notEqual(first.ciphertext,second.ciphertext);
 const changed=await encryptJournal('2222',await decryptJournal('1111',first));
 assert.deepEqual(await decryptJournal('2222',changed),emptyJournal());
 await assert.rejects(decryptJournal('1111',changed));
});
test('large journal illustrations and vault entries encrypt, decrypt and rekey safely',async()=>{
 const image='data:image/png;base64,'+'a'.repeat(137000);
 const original={...emptyJournal(),dreams:[{id:'a',title:'Illustrated dream',art:image,body:'Remember everything'}],
  vault:[{id:'b',title:'Very long note',body:'long'.repeat(25000)}]};
 const first=await encryptJournal('a long private passphrase',original);
 assert.deepEqual(await decryptJournal('a long private passphrase',first),original);
 const rotated=await encryptJournal('another long private passphrase',await decryptJournal('a long private passphrase',first));
 assert.deepEqual(await decryptJournal('another long private passphrase',rotated),original);
 assert.ok(bytesToBase64(new Uint8Array(300000)).length>300000);
});
test('daily language lessons align Hanzi and German word glosses',()=>{
 for(const lesson of LESSONS){
  assert.equal([...lesson.zh].length,lesson.chars.length,lesson.zh);
  assert.equal(lesson.chars.length,lesson.charPy.length,lesson.zh);
  assert.equal(lesson.de.split(' ').length,lesson.words.length,lesson.de);
  assert.ok(lesson.py && lesson.ipa && lesson.en);
 }
 assert.deepEqual(lessonForDate(new Date(2026,10,3)),lessonForDate(new Date(2026,10,3,23,59)));
});
