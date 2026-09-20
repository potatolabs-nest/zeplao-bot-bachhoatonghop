// Thư mục `web/`: tìm link, xét link, đợi trang, và soạn chữ đi kèm ảnh.
//
// Không có Chrome trong này. Mọi luật đáng sai đều đã được kéo ra thành hàm nhận vào số và trả
// ra số — `untilReady` nhận một cái đồng hồ giả, `vetHost` nhận một cái DNS giả — vì một luật chỉ
// thử được khi có cả trình duyệt lẫn internet là một luật không ai thử.
import test from 'node:test';
import assert from 'node:assert/strict';

import { hextetsOf, isPrivateAddress, linksIn, vetHost, vetUrl } from './web/links.mjs';
import { endpointFor, untilReady, untilStill } from './web/shot.mjs';
import { fileName, hostOf, madeRecently, refusal } from './web/message.mjs';

// ---- tìm link ------------------------------------------------------------------------------

test('một địa chỉ đầy đủ thì tìm ra', () => {
  assert.deepEqual(linksIn('xem cái này https://kuku.vn/tin/1 nhé'), ['https://kuku.vn/tin/1']);
});

test('dấu chấm cuối câu thuộc về câu', () => {
  assert.deepEqual(linksIn('ở https://kuku.vn.'), ['https://kuku.vn']);
  assert.deepEqual(linksIn('ở https://kuku.vn?'), ['https://kuku.vn']);
});

test('ngoặc do chính link mở thì giữ lại', () => {
  assert.deepEqual(
    linksIn('https://vi.wikipedia.org/wiki/Sao_(định_hướng)'),
    ['https://vi.wikipedia.org/wiki/Sao_(định_hướng)'],
  );
});

test('ngoặc do câu mở thì không', () => {
  assert.deepEqual(linksIn('(xem https://kuku.vn)'), ['https://kuku.vn']);
});

test('www và tên miền có đường dẫn cũng là địa chỉ', () => {
  assert.deepEqual(linksIn('xem www.kuku.vn nhé'), ['https://www.kuku.vn']);
  assert.deepEqual(linksIn('ở kuku.vn/bot/doc'), ['https://kuku.vn/bot/doc']);
});

test('một tên miền trơ trọi thì không — quá nhiều câu tiếng Việt có hình ấy', () => {
  assert.deepEqual(linksIn('mua ở kuku.vn'), []);
  assert.deepEqual(linksIn('giá 10.000đ'), []);
  assert.deepEqual(linksIn('cà phê, bánh, v.v.'), []);
  assert.deepEqual(linksIn('xong rồi.Mai gặp'), []);
});

test('scheme không phải web thì không phải link', () => {
  // Đây là chỗ một ô chat thành cách chạy mã trong trình duyệt người khác.
  assert.deepEqual(linksIn('javascript:alert(1)'), []);
  assert.deepEqual(linksIn('data:text/html,<script>x</script>'), []);
  assert.deepEqual(linksIn('file:///etc/passwd'), []);
});

test('cùng một link hai lần là một link', () => {
  assert.deepEqual(linksIn('https://a.vn và https://a.vn'), ['https://a.vn']);
});

// ---- xét link ------------------------------------------------------------------------------

test('địa chỉ trong nhà thì nhận ra', () => {
  for (const one of [
    '127.0.0.1', '0.0.0.0', '10.1.2.3', '192.168.1.1', '172.16.0.1', '172.31.255.255',
    '169.254.169.254', '100.64.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fd00::1', 'fc00::1', 'ff02::1', '::ffff:127.0.0.1',
    '::ffff:192.168.0.1', '2002:7f00:1::', '64:ff9b::1',
  ]) {
    assert.equal(isPrivateAddress(one), true, `${one} phải bị chặn`);
  }
});

test('địa chỉ ngoài đường thì cho qua', () => {
  for (const one of ['1.1.1.1', '8.8.8.8', '203.113.1.1', '2606:4700:4700::1111', '2a03:2880:f10c::']) {
    assert.equal(isPrivateAddress(one), false, `${one} phải qua được`);
  }
});

test('cái gì không phải địa chỉ thì coi như trong nhà', () => {
  // Nghiêng về từ chối. Đoán sai theo chiều kia là bot mở một trang trong mạng nội bộ rồi chụp
  // nó lên nhóm chat.
  for (const one of ['', null, 'chịu', '999.1.1.1', '1.2.3', 'fe80::zz']) {
    assert.equal(isPrivateAddress(one), true, `${one} phải bị chặn`);
  }
});

test('v6 viết tắt kiểu gì cũng giãn ra được', () => {
  assert.deepEqual(hextetsOf('::1'), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(hextetsOf('fe80::1'), [0xfe80, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(hextetsOf('::ffff:192.168.1.1'), [0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101]);
  assert.equal(hextetsOf('1:2:3'), null);
});

test('tên miền trỏ về nhà thì chặn, dù chỉ một trong mấy địa chỉ', async () => {
  // Đây là cả lý do phải xét **từng** địa chỉ: chỉ cần trình duyệt thử cái thứ hai là xong.
  const resolve = async () => [{ address: '1.2.3.4' }, { address: '127.0.0.1' }];
  assert.deepEqual(await vetHost('chỗ-nào-đó.vn', { resolve }), { ok: false, why: 'private_address' });
});

test('tên miền không tra được thì không mở', async () => {
  const resolve = async () => { throw new Error('NXDOMAIN'); };
  assert.deepEqual(await vetHost('khong-co.vn', { resolve }), { ok: false, why: 'no_such_host' });
});

test('địa chỉ IP viết thẳng thì không cần hỏi DNS', async () => {
  const resolve = async () => assert.fail('không được hỏi DNS cho một IP');
  assert.deepEqual(await vetHost('1.1.1.1', { resolve }), { ok: true, addresses: ['1.1.1.1'] });
});

test('chỉ http và https', async () => {
  const resolve = async () => [{ address: '1.1.1.1' }];
  assert.equal((await vetUrl('ftp://kuku.vn/x', { resolve })).why, 'not_the_web');
  assert.equal((await vetUrl('không phải url', { resolve })).why, 'not_a_url');
});

test('link kèm mật khẩu thì không mở', async () => {
  // Mật khẩu nằm trong link thì nó nằm cả trong ảnh và trong nhóm chat này mãi mãi.
  const resolve = async () => [{ address: '1.1.1.1' }];
  assert.equal((await vetUrl('https://an:mat@kuku.vn/', { resolve })).why, 'has_credentials');
});

test('cổng lạ thì không mở — bot không phải máy quét cổng', async () => {
  const resolve = async () => [{ address: '1.1.1.1' }];
  assert.equal((await vetUrl('https://kuku.vn:22/', { resolve })).why, 'odd_port');
  assert.equal((await vetUrl('https://kuku.vn:443/', { resolve })).ok, true);
});

// ---- đợi trang -----------------------------------------------------------------------------

/// Một cái đồng hồ chạy bằng tay: `pause` không ngủ, nó nhảy. Nên cả nhóm test dưới đây chạy
/// xong trong vài mili giây thật, và không có cái nào chập chờn theo tốc độ máy.
function clock(onTick = () => {}) {
  let at = 0;
  return {
    now: () => at,
    pause: async (ms) => { at += ms; onTick(at); },
    get at() { return at; },
  };
}

test('mạng lặng và trang đã vẽ thì chụp', async () => {
  const marks = { beat: 0, painted: 200 };
  const tick = clock();
  assert.equal(await untilReady(marks, { ...tick, paintedMs: 9999 }), 'lang');
  assert.ok(tick.at >= 700, 'phải đợi đủ khoảng lặng');
});

test('trang còn trống thì chưa chụp, dù mạng đã lặng và Chrome bảo đã vẽ', async () => {
  // Cái bẫy đã làm bot gửi lên nhóm một tấm ảnh trắng của kuku.vn/bot/doc: ở giây thứ 1 mạng đã
  // lặng và Chrome đã báo vẽ xong, nhưng trên trang chưa có chữ nào. Chữ hiện ra ở giây 1,5.
  const marks = { beat: 0, painted: 100 };
  const tick = clock();
  const look = async () => (tick.at >= 1500 ? 104875 : 0);
  assert.equal(await untilReady(marks, { ...tick, look, paintedMs: 9999 }), 'lang');
  assert.ok(tick.at >= 1500, `chụp lúc trang còn trống, ở ${tick.at}ms`);
  assert.ok(tick.at < 3000, `đợi quá lâu sau khi trang đã có chữ, tới ${tick.at}ms`);
});

test('trang trống thật thì cũng có lúc phải chụp một trang trống', async () => {
  // Một file PDF, một tấm ảnh, một trang trắng thật: bắt nó phải có chữ là đợi hết trần rồi mới
  // chụp đúng cái đã thấy từ giây đầu.
  const marks = { beat: 0, painted: 100 };
  const tick = clock();
  assert.equal(await untilReady(marks, { ...tick, look: async () => 0, blankMs: 5000 }), 'trang-trong');
  assert.ok(tick.at >= 5000 && tick.at < 15000, `ở ${tick.at}ms`);
});

test('trang chưa đọc xong thì không phải trang trống — đợi tới trần', async () => {
  // `github.com` có lúc còn `readyState: loading` ở giây thứ 5 với mạng im lìm. Bắn cửa thoát
  // "trang trống" ở đó là gửi lên nhóm một tấm ảnh trắng của một trang hoàn toàn bình thường.
  const marks = { beat: 0, painted: 0 };
  const tick = clock();
  const look = async () => (tick.at < 8000 ? -1 : 9);
  assert.equal(await untilReady(marks, { ...tick, look, blankMs: 5000, paintedMs: 9999 }), 'lang');
  assert.ok(tick.at >= 8000, `bỏ cuộc lúc trang mới đang đọc, ở ${tick.at}ms`);
});

test('trang không chữ nhưng có ảnh thì tính là có', async () => {
  const marks = { beat: 0, painted: 100 };
  const tick = clock();
  assert.equal(await untilReady(marks, { ...tick, look: async () => 1, paintedMs: 9999 }), 'lang');
  assert.ok(tick.at < 5000, 'không phải đợi hết BLANK_MS');
});

test('trang có chữ rồi thì chụp, kể cả khi mạng không bao giờ lặng', async () => {
  // github.com: request đều đặn suốt, đợi mạng lặng là đợi hết trần 15 giây rồi chụp phải một
  // khung đang thay nội dung.
  const marks = { beat: 0, painted: 0 };
  const tick = clock((at) => {
    marks.beat = at;                      // mạng động đậy mãi
    if (at >= 1000 && !marks.painted) marks.painted = at;
  });
  assert.equal(await untilReady(marks, { ...tick, paintedMs: 3000, loadMs: 15000 }), 've-xong');
  assert.ok(tick.at >= 4000 && tick.at < 15000, `chụp ở ${tick.at}ms`);
});

test('trang không bao giờ xong và không bao giờ vẽ thì cũng có lúc phải chụp', async () => {
  const marks = { beat: 0, painted: 0 };
  const tick = clock((at) => { marks.beat = at; });
  assert.equal(await untilReady(marks, { ...tick, loadMs: 15000 }), 'het-gio');
  assert.equal(tick.at, 15000);
});

test('cuộn xong thì đợi ảnh vừa gọi kịp về', async () => {
  // Chụp ngay sau khi cuộn ra một trang bố cục đầy đủ mà mọi ô ảnh đều trắng.
  const marks = { beat: 0 };
  const tick = clock((at) => { if (at < 2000) marks.beat = at; });
  assert.equal(await untilStill(marks, { ...tick, mostMs: 6000 }), 'lang');
  assert.ok(tick.at >= 2000, `chụp lúc ảnh chưa về, ở ${tick.at}ms`);
});

test('trang bận mãi thì cũng thôi, không đợi hết đời', async () => {
  const marks = { beat: 0 };
  const tick = clock((at) => { marks.beat = at; });
  assert.equal(await untilStill(marks, { ...tick, mostMs: 6000 }), 'het-gio');
  assert.equal(tick.at, 6000);
});

// ---- nối vào Chrome có sẵn -------------------------------------------------------------------

test('ws:// thì đã là địa chỉ rồi, không hỏi thêm ai', async () => {
  const ask = async () => assert.fail('không được hỏi');
  assert.equal(await endpointFor('ws://chrome:9222/devtools/browser/abc', { ask }), 'ws://chrome:9222/devtools/browser/abc');
});

test('http:// thì phải hỏi /json/version', async () => {
  // Đường dẫn ấy có một chuỗi ngẫu nhiên mỗi lần Chrome chạy, nên không viết cứng được.
  let asked = null;
  const ask = async (url) => {
    asked = String(url);
    return { ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://chrome:9222/devtools/browser/xyz' }) };
  };
  assert.equal(await endpointFor('http://chrome:9222', { ask }), 'ws://chrome:9222/devtools/browser/xyz');
  assert.equal(asked, 'http://chrome:9222/json/version');
});

test('Chrome không có ở đó thì nói ra, không im', async () => {
  const ask = async () => ({ ok: false, status: 502 });
  await assert.rejects(endpointFor('http://chrome:9222', { ask }), /502/);

  const empty = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(endpointFor('http://chrome:9222', { ask: empty }), /không nói địa chỉ/);
  await assert.rejects(endpointFor('', { ask }), /rỗng/);
});

// ---- chữ đi kèm ----------------------------------------------------------------------------

test('tên file mang theo tên miền và ngày', () => {
  assert.equal(fileName('https://www.kuku.vn/bot', new Date('2026-09-20T03:00:00Z')), 'kuku.vn-2026-09-20.png');
});

test('hostOf chịu được thứ không phải địa chỉ', () => {
  assert.equal(hostOf('chịu'), '');
});

test('lời từ chối nói ra tên miền và lý do', () => {
  assert.equal(refusal('private_address', 'https://noi-bo.vn/x'), 'Không mở được noi-bo.vn: địa chỉ trong mạng nội bộ — không mở.');
});

test('cùng link cùng phòng thì không chụp lại, khác phòng thì có', () => {
  const seen = new Map();
  assert.equal(madeRecently(seen, 'p1', 'https://a.vn', { now: 0 }), false);
  assert.equal(madeRecently(seen, 'p1', 'https://a.vn', { now: 1000 }), true);
  assert.equal(madeRecently(seen, 'p2', 'https://a.vn', { now: 1000 }), false, 'nhóm kia chưa xem');
  assert.equal(madeRecently(seen, 'p1', 'https://a.vn', { now: 11 * 60 * 1000 }), false, 'mười phút sau thì chụp lại');
});

test('trí nhớ có trần, và bỏ cái cũ nhất', () => {
  const seen = new Map();
  for (let i = 0; i < 10; i++) madeRecently(seen, 'p', `https://a.vn/${i}`, { now: i, most: 3 });
  assert.equal(seen.size, 3);
  assert.ok(seen.has('p|https://a.vn/9'));
  assert.ok(!seen.has('p|https://a.vn/0'));
});
