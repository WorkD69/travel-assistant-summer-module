const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('frontend invitations use the public token page and server dates', () => {
  const membersSync = fs.readFileSync('assets/js/members-sync.js', 'utf8');
  const members = fs.readFileSync('features/trip-members.js', 'utf8');
  const invitation = fs.readFileSync('assets/js/invitation.js', 'utf8');
  const html = fs.readFileSync('invitation.html', 'utf8');

  assert.equal(membersSync.includes('travel.local'), false);
  assert.equal(members.includes('travel.local'), false);
  assert.equal(members.includes('Date.UTC(2026'), false);
  assert.match(members, /expiresInDays:\s*membersDays/);
  assert.match(members, /membersServerInvite\.createdAt/);
  assert.match(members, /membersServerInvite\.expiresAt/);
  assert.match(invitation, /resolveInvitation\(token\)/);
  assert.match(invitation, /acceptInvitation\(token\)/);
  assert.match(invitation, /trip-overview\.html\?tripId=/);
  assert.match(html, /assets\/js\/invitation\.js/);
});

