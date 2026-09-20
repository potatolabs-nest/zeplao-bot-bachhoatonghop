// Con bot: đọc một tin nhắn ra thành một việc, và làm việc ấy mà không sập.
//
// Không gọi ra mạng và không mở Chrome. `run()` là phần duy nhất chạm vào cả hai, và mọi quyết
// định bên trong nó đã được kéo ra thành hàm ở đây — vì một quyết định chỉ chạy được khi có
// token thật là một quyết định không ai thử trước khi nó lên nhóm chat của người khác.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { commandsFor, keeper, queue, readState, request, stampFor, withoutName, writeState } from './bachhoabot.mjs';

const ME = { id: 'bot1', username: 'bachhoabot', displayName: 'Bách hoá' };
const said = (text, extra = {}) => ({ conversationId: 'p1', messageId: 'm1', from: { userId: 'u1' }, text, ...extra });

// ---- đọc tin nhắn ra thành việc --------------------------------------------------------------

test('dán một cái link giữa lúc nói chuyện thì chụp, và im nếu hỏng', () => {
  const asked = request(said('ông xem cái này https://kuku.vn/tin/1 đi'), ME);
  assert.equal(asked.kind, 'shot');
  assert.equal(asked.address, 'https://kuku.vn/tin/1');
  // `quiet` — không ai hỏi bot cả, nên lời từ chối đi riêng chứ không đổ ra cả phòng.
  assert.equal(asked.quiet, true);
  assert.equal(asked.onlyFor, null);
});

test('không có link thì im', () => {
  assert.equal(request(said('trưa nay ăn gì'), ME), null);
});

test('gọi tên bot thì hỏng cũng phải nói vì sao', () => {
  const asked = request(said('@bachhoabot https://kuku.vn'), ME);
  assert.equal(asked.kind, 'shot');
  assert.equal(asked.quiet, false, 'có người hỏi thẳng thì im lặng là nói dối');
});

test('gọi tên bot mà không kèm link thì được hướng dẫn', () => {
  assert.equal(request(said('@bachhoabot'), ME).kind, 'help');
  assert.equal(request(said('@Bách hoá làm gì được?'), ME).kind, 'help');
});

test('lệnh /anh chụp cho cả nhóm, !anh chỉ người gõ thấy', () => {
  const all = request(said('/anh https://a.vn', { command: 'anh', commandArgs: 'https://a.vn', commandPrefix: '/' }), ME);
  assert.equal(all.onlyFor, null);

  const mine = request(said('!anh https://a.vn', { command: 'anh', commandArgs: 'https://a.vn', commandPrefix: '!' }), ME);
  assert.equal(mine.onlyFor, 'u1');
});

test('/anh dai xin cả trang', () => {
  const asked = request(said('/anh dai https://a.vn', { command: 'anh', commandArgs: 'dai https://a.vn' }), ME);
  assert.equal(asked.fullPage, true);
  assert.equal(asked.address, 'https://a.vn');
});

test('/anh không kèm gì thì hướng dẫn, không phải im', () => {
  assert.equal(request(said('/anh', { command: 'anh', commandArgs: '' }), ME).kind, 'help');
});

test('lệnh của bot khác trong cùng phòng thì không đụng vào', () => {
  // `/help` tới tay mọi bot trong phòng. Một con bot trả lời mọi gạch chéo là một con bot không
  // ai giữ lại trong nhóm.
  assert.equal(request(said('/help', { command: 'help', commandArgs: '' }), ME), null);
  assert.equal(request(said('/vic', { command: 'vic', commandArgs: '' }), ME), null);
});

test('nhiều link thì chụp cái đầu, và đếm phần còn lại', () => {
  const asked = request(said('https://a.vn và https://b.vn'), ME);
  assert.equal(asked.address, 'https://a.vn');
  assert.equal(asked.more, 1);
});

test('bỏ chỗ gọi tên, cả handle lẫn tên hiển thị có dấu cách', () => {
  assert.equal(withoutName('@bachhoabot https://a.vn', ['bachhoabot', 'Bách hoá']), 'https://a.vn');
  assert.equal(withoutName('@Bách hoá https://a.vn', ['bachhoabot', 'Bách hoá']), 'https://a.vn');
  assert.equal(withoutName('nói @bachhoabot ở giữa', ['bachhoabot']), 'nói @bachhoabot ở giữa');
});

// ---- khai lệnh -----------------------------------------------------------------------------

test('khai lệnh có tên chính bot, và không viết cứng tên ấy', () => {
  const words = commandsFor(ME).map((one) => one.command);
  assert.deepEqual(words, ['anh', 'chup', 'xem', 'bachhoabot']);
  assert.ok(commandsFor({}).every((one) => /^[a-z0-9_]{1,32}$/.test(one.command)));
});

// ---- chỗ nhớ đã đọc tới đâu -------------------------------------------------------------------

test('nhớ và đọc lại được chỗ đã đọc tới', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'bachhoa-')), 'state.json');
  assert.equal(readState(file), 0, 'chưa có file thì bắt đầu từ đầu');
  writeState(41, file);
  assert.equal(readState(file), 41);
});

test('file hỏng thì bắt đầu lại, không sập', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'bachhoa-')), 'state.json');
  writeFileSync(file, 'không phải json');
  assert.equal(readState(file), 0);
});

// ---- hàng đợi ------------------------------------------------------------------------------

test('chạy nhiều nhất hai việc một lúc', async () => {
  const jobs = queue(2, 10);
  let running = 0;
  let most = 0;
  const done = [];
  for (let i = 0; i < 6; i++) {
    jobs.add(async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((go) => setTimeout(go, 5));
      running -= 1;
      done.push(i);
    });
  }
  while (jobs.size) await new Promise((go) => setTimeout(go, 5));
  assert.equal(most, 2);
  assert.equal(done.length, 6);
});

test('hàng đầy thì bỏ việc cũ nhất, không bỏ việc mới', async () => {
  const jobs = queue(1, 2);
  const done = [];
  const held = new Promise((go) => setTimeout(go, 20));
  jobs.add(async () => { await held; done.push('đang chạy'); });
  jobs.add(async () => done.push('cũ'));
  jobs.add(async () => done.push('giữa'));
  jobs.add(async () => done.push('mới'));
  while (jobs.size) await new Promise((go) => setTimeout(go, 5));
  assert.deepEqual(done, ['đang chạy', 'giữa', 'mới'], '"cũ" bị bỏ, không phải "mới"');
});

test('một việc ném lỗi không kéo theo cả hàng đợi', async () => {
  const jobs = queue(1, 10);
  const done = [];
  jobs.add(async () => { throw new Error('hỏng'); });
  jobs.add(async () => done.push('vẫn chạy'));
  while (jobs.size) await new Promise((go) => setTimeout(go, 5));
  assert.deepEqual(done, ['vẫn chạy']);
});

// ---- giữ Chrome sống -------------------------------------------------------------------------

test('Chrome chết thì dựng lại rồi chụp tiếp', async () => {
  let opened = 0;
  const chrome = keeper(async () => {
    opened += 1;
    const first = opened === 1;
    return {
      shot: async () => { if (first) throw new Error('Chrome đã đóng kết nối'); return { png: Buffer.from('x') }; },
      close: () => {},
    };
  });
  const made = await chrome.shot('https://a.vn');
  assert.equal(made.png.toString(), 'x');
  assert.equal(opened, 2, 'phải mở lại Chrome đúng một lần');
});

test('trang hỏng thì báo hỏng, không dựng lại Chrome', async () => {
  let opened = 0;
  const chrome = keeper(async () => {
    opened += 1;
    return { shot: async () => { throw new Error('không tìm thấy máy chủ'); }, close: () => {} };
  });
  await assert.rejects(chrome.shot('https://a.vn'), /không tìm thấy máy chủ/);
  assert.equal(opened, 1);
});

test('Chrome treo thì cắt, và lần sau là một Chrome mới', async () => {
  let opened = 0;
  const chrome = keeper(async () => {
    opened += 1;
    return { shot: () => new Promise(() => {}), close: () => {} };
  }, { ms: 20 });
  await assert.rejects(chrome.shot('https://a.vn'), /quá lâu/);
  assert.equal(opened, 2, 'thử lại một lần với Chrome mới rồi mới chịu thua');
});

// ---- gửi lại cho an toàn -----------------------------------------------------------------------

test('cùng tin nhắn cùng địa chỉ thì cùng một dấu, nên gửi lại không ra hai ảnh', () => {
  assert.equal(stampFor('m1', 'https://a.vn'), stampFor('m1', 'https://a.vn'));
  assert.notEqual(stampFor('m1', 'https://a.vn'), stampFor('m1', 'https://b.vn'));
  assert.notEqual(stampFor('m1', 'https://a.vn'), stampFor('m2', 'https://a.vn'));
});
