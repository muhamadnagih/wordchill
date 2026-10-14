const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateGuess } = require('../server/gameEngine');
const { RoomManager } = require('../server/roomManager');

test('Duplicate-letter evaluation strictly matches Wordle two-pass rules', () => {
  const res1 = evaluateGuess('BABES', 'ABBEY');
  assert.deepEqual(res1.map(r => r.state), ['present', 'present', 'correct', 'correct', 'absent']);

  const res2 = evaluateGuess('LULLS', 'SKILL');
  assert.deepEqual(res2.map(r => r.state), ['present', 'absent', 'absent', 'correct', 'present']);
});

test('Supports dynamic word lengths of 4, 5, 6, and 7 letters', () => {
  const rm = new RoomManager();
  for (const len of [4, 5, 6, 7]) {
    const solo = rm.createSoloGame({ wordLength: len });
    assert.equal(solo.wordLength, len);
    assert.equal(solo.secretWord, null);
  }
});

test('Enforces 2-to-10 player room limits and prevents starting with 1 player', () => {
  const rm = new RoomManager();
  const room = rm.createRoom({
    hostId: 'p1',
    hostName: 'Host',
    socketId: 's1',
    wordLength: 5,
    maxPlayers: 10
  });

  const earlyStart = rm.startGame({ code: room.code, requesterId: 'p1' });
  assert.ok(earlyStart.error);

  for (let i = 2; i <= 10; i++) {
    const res = rm.joinRoom({ code: room.code, playerId: `p${i}`, playerName: `Player ${i}`, socketId: `s${i}` });
    assert.ok(res.room);
  }
  assert.equal(room.players.size, 10);

  const eleventh = rm.joinRoom({ code: room.code, playerId: 'p11', playerName: 'Extra', socketId: 's11' });
  assert.ok(eleventh.error);
  assert.match(eleventh.error, /full/i);
});

test('Secret word is independent per room and never leaked before round finishes', () => {
  const rm = new RoomManager();
  const roomA = rm.createRoom({ hostId: 'h1', hostName: 'H1', socketId: 's1', wordLength: 5 });
  rm.joinRoom({ code: roomA.code, playerId: 'p2', playerName: 'P2', socketId: 's2' });
  rm.startGame({ code: roomA.code, requesterId: 'h1' });

  const clientView = rm.serializeRoomForPlayer(roomA, 'h1');
  assert.equal(clientView.secretWord, null);

  const badGuess = rm.submitMultiplayerGuess({ code: roomA.code, playerId: 'h1', rawGuess: 'ZZZZZ' });
  assert.ok(badGuess.error);
  assert.equal(roomA.players.get('h1').guesses.length, 0);
});
