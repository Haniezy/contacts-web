import assert from 'node:assert/strict';
import test from 'node:test';
import { emailSuggestion } from '../../src/server/auth/email-typo';

test('misspelt popular domains get the intended address', () => {
  for (const [typed, intended] of [
    ['sara@gmial.com', 'sara@gmail.com'],
    ['sara@gmail.co', 'sara@gmail.com'],
    ['sara@gamil.con', 'sara@gmail.com'],
    ['sara@yaho.com', 'sara@yahoo.com'],
    ['sara@hotmial.com', 'sara@hotmail.com'],
    ['sara@outlok.com', 'sara@outlook.com'],
  ])
    assert.equal(emailSuggestion(typed), intended);
});

test('real domains are left alone', () => {
  for (const email of [
    'sara@gmail.com',
    'sara@yahoo.fr',
    'sara@yahoo.co.uk',
    'sara@email.com',
    'sara@live.com',
    'sara@company.ir',
    'sara@ut.ac.ir',
  ])
    assert.equal(emailSuggestion(email), null);
});
