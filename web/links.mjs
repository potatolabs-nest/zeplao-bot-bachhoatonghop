// Tìm địa chỉ web trong một câu, và xét xem có chụp được nó không.
//
// Hai việc, cố ý để chung một chỗ: cái đầu quyết định bot có mở trang hay không, cái sau quyết
// định trang nào mở được — và chúng phải đọc cùng một chỗ, vì khoảng cách giữa "đã nhận ra là
// link" và "đã xét là an toàn" chính là nơi mọi lỗi SSRF sống.
import { lookup as lookupCb } from 'node:dns';
import { isIP } from 'node:net';
import { promisify } from 'node:util';

const lookup = promisify(lookupCb);

/**
 * Các địa chỉ trong một tin nhắn.
 *
 * Cùng một luật với chính ứng dụng (`client/src/chat-logic.ts`, `linksIn`), không viết lại theo
 * ý mình: người ta gõ một câu, thấy ứng dụng gạch chân chỗ nào thì chờ bot chụp đúng chỗ ấy. Bot
 * nhận ra nhiều hơn ứng dụng là bot chụp thứ trong câu không ai coi là link; nhận ra ít hơn là
 * bot im trước một chữ đang xanh ngay trên màn hình.
 *
 * Hẹp có chủ ý. Có scheme, hoặc rõ tới mức không cần scheme: `www.gì đó`, hoặc một tên miền có
 * đường dẫn theo sau. Một `kuku.vn` trơ trọi thì **không**, vì quá nhiều câu tiếng Việt có hình
 * ấy — `10.000đ`, `v.v.`, `xong rồi.Mai gặp`. Và chỉ http với https: `javascript:` hay `data:`
 * là cách một ô chat thành chỗ chạy mã trong trình duyệt người khác.
 */
export function linksIn(body) {
  const found = [];
  const pattern = /(?:https?:\/\/|www\.|[a-z0-9][a-z0-9-]*\.[a-z]{2,}\/)[^\s<>"']*/gi;
  for (const match of String(body ?? '').matchAll(pattern)) {
    // Dấu câu ở cuối thuộc về câu, không thuộc về địa chỉ. Riêng ngoặc đóng thì giữ lại khi
    // chính link đã mở một ngoặc — khối URL thật có một cặp trong đó, cắt đi là link 404.
    let url = match[0].replace(/[.,;:!?"']+$/, '');
    while (url.endsWith(')') && (url.match(/\(/g) ?? []).length < (url.match(/\)/g) ?? []).length) {
      url = url.slice(0, -1);
    }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (url.length > 8 && !found.includes(url)) found.push(url);
  }
  return found;
}

/// Cổng mở được. Không phải để chặn một trang web lạ — mà để bot không thành máy quét cổng của
/// người khác: `http://nội-bộ:22` trả lời khác `http://nội-bộ:23`, và chỉ cần hai câu trả lời
/// khác nhau là đủ để dò cả mạng qua một ô chat.
const PORTS = new Set(['', '80', '443']);

/// Chụp được thì thôi, không chụp được thì phải nói vì sao — những chữ này đi thẳng vào câu trả
/// lời, nên chúng là tiếng Việt chứ không phải mã lỗi.
export const WHY = {
  not_a_url: 'địa chỉ không đọc được',
  not_the_web: 'chỉ mở được http và https',
  has_credentials: 'địa chỉ có kèm mật khẩu — không mở',
  odd_port: 'cổng lạ — chỉ mở 80 và 443',
  no_such_host: 'không tìm thấy máy chủ',
  private_address: 'địa chỉ trong mạng nội bộ — không mở',
};

/**
 * Địa chỉ IP này có nằm trong nhà không.
 *
 * Đây là cái chặn thật, và nó đứng ở IP chứ không ở tên miền, vì một cái tên ai cũng đặt được:
 * `trang-cua-toi.com` trỏ về `127.0.0.1` là hợp lệ với mọi DNS trên đời. Nền tảng xét webhook
 * đúng như vậy — "checked after DNS resolution" — và một con bot mở trang hộ người lạ thì còn
 * cần hơn, vì cái nó mang về không phải mã trạng thái mà là **ảnh chụp** của thứ nó thấy.
 */
export function isPrivateAddress(address) {
  const ip = String(address ?? '').trim().toLowerCase();
  if (!ip) return true;
  if (isIP(ip) === 6) return isPrivateV6(ip);
  if (isIP(ip) === 4) return isPrivateV4(ip);
  return true;
}

function isPrivateV4(ip) {
  const parts = ip.split('.').map((one) => Number.parseInt(one, 10));
  if (parts.length !== 4 || parts.some((one) => !Number.isInteger(one) || one < 0 || one > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;                                 // 0.0.0.0/8 — "máy này"
  if (a === 10) return true;                                // 10/8
  if (a === 127) return true;                               // vòng lặp nội bộ
  if (a === 100 && b >= 64 && b <= 127) return true;         // 100.64/10 — CGNAT
  if (a === 169 && b === 254) return true;                   // link-local, và 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;          // 172.16/12
  if (a === 192 && b === 168) return true;                   // 192.168/16
  if (a === 192 && b === 0) return true;                      // 192.0.0/24 và 192.0.2/24
  if (a === 192 && b === 88) return true;                     // 192.88.99/24 — 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return true;        // đo đạc
  if (a === 198 && b === 51) return true;                      // 198.51.100/24 — tài liệu
  if (a === 203 && b === 0) return true;                       // 203.0.113/24 — tài liệu
  if (a >= 224) return true;                                   // multicast, dành riêng, quảng bá
  return false;
}

/// Tám cụm của một địa chỉ v6, đã giãn `::` ra. Viết tay vì Node không có sẵn, và vì luật ở dưới
/// đọc theo cụm chứ không theo chữ: `fe80::1` với `fe80:0:0:0:0:0:0:1` phải ra cùng một câu trả lời.
export function hextetsOf(ip) {
  const text = String(ip ?? '').toLowerCase().replace(/%.*$/, '');
  const [head, tail = null] = text.split('::');
  const left = head ? head.split(':').filter(Boolean) : [];
  const right = tail ? tail.split(':').filter(Boolean) : [];
  // Đuôi viết kiểu v4 — `::ffff:192.168.1.1` — thành hai cụm, để luật dưới soi được phần v4.
  const last = right.at(-1) ?? left.at(-1);
  if (last && last.includes('.')) {
    const octets = last.split('.').map((one) => Number.parseInt(one, 10));
    if (octets.length !== 4 || octets.some((one) => !Number.isInteger(one))) return null;
    const pair = [
      ((octets[0] << 8) | octets[1]).toString(16),
      ((octets[2] << 8) | octets[3]).toString(16),
    ];
    if (right.length) right.splice(-1, 1, ...pair); else left.splice(-1, 1, ...pair);
  }
  const gap = 8 - left.length - right.length;
  if (tail === null) return left.length === 8 ? left.map(toHextet) : null;
  if (gap < 0) return null;
  return [...left, ...Array(gap).fill('0'), ...right].map(toHextet);
}

const toHextet = (one) => Number.parseInt(one, 16) || 0;

function isPrivateV6(ip) {
  const hextets = hextetsOf(ip);
  if (!hextets) return true;
  const [first, second] = hextets;
  const zeros = hextets.slice(0, 5).every((one) => one === 0);
  if (zeros && hextets[5] === 0) return true;                   // :: và ::1
  if (zeros && hextets[5] === 0xffff) {                          // ::ffff:a.b.c.d — v4 đội mũ v6
    return isPrivateV4([hextets[6] >> 8, hextets[6] & 255, hextets[7] >> 8, hextets[7] & 255].join('.'));
  }
  if ((first & 0xfe00) === 0xfc00) return true;                  // fc00::/7 — nội bộ
  if ((first & 0xffc0) === 0xfe80) return true;                  // fe80::/10 — link-local
  if ((first & 0xffc0) === 0xfec0) return true;                  // fec0::/10 — site-local, đã bỏ
  if ((first & 0xff00) === 0xff00) return true;                  // ff00::/8 — multicast
  if (first === 0x2002) {                                         // 2002::/16 — 6to4, gói v4 bên trong
    return isPrivateV4([second >> 8, second & 255, hextets[2] >> 8, hextets[2] & 255].join('.'));
  }
  if (first === 0x64 && second === 0xff9b) return true;           // 64:ff9b::/96 — NAT64
  if (first === 0x100 && second === 0) return true;               // 100::/64 — hố đen
  return false;
}

/**
 * Tên máy này mở được không — hỏi DNS rồi xét từng địa chỉ nó trả về.
 *
 * **Từng địa chỉ, không phải địa chỉ đầu.** Một cái tên trả về `1.2.3.4` và `127.0.0.1` thì chỉ
 * cần trình duyệt thử cái thứ hai là xong; xét mỗi cái đầu là để lại đúng cái cửa mình vừa đóng.
 */
export async function vetHost(host, { resolve = lookup } = {}) {
  const name = String(host ?? '').replace(/\.$/, '').toLowerCase();
  if (!name) return { ok: false, why: 'no_such_host' };
  if (isIP(name)) {
    return isPrivateAddress(name) ? { ok: false, why: 'private_address' } : { ok: true, addresses: [name] };
  }
  let answers;
  try {
    answers = await resolve(name, { all: true, verbatim: true });
  } catch {
    return { ok: false, why: 'no_such_host' };
  }
  const addresses = (answers ?? []).map((one) => one.address).filter(Boolean);
  if (!addresses.length) return { ok: false, why: 'no_such_host' };
  if (addresses.some((one) => isPrivateAddress(one))) return { ok: false, why: 'private_address' };
  return { ok: true, addresses };
}

/**
 * Cả một địa chỉ: đọc được, là web, không kèm mật khẩu, cổng thường, và máy chủ ở ngoài nhà.
 *
 * Trả về `{ ok, why, url }` chứ không ném: một link hỏng trong nhóm chat là chuyện thường ngày,
 * không phải sự cố, và chỗ gọi cần chữ để nói lại chứ không cần stack trace.
 */
export async function vetUrl(raw, options = {}) {
  let url;
  try {
    url = new URL(String(raw ?? ''));
  } catch {
    return { ok: false, why: 'not_a_url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, why: 'not_the_web' };
  // Mật khẩu nằm trong link thì nó cũng nằm trong ảnh, trong log, và trong cái nhóm chat này mãi
  // mãi. Không mở, kể cả khi mở được.
  if (url.username || url.password) return { ok: false, why: 'has_credentials' };
  if (!PORTS.has(url.port)) return { ok: false, why: 'odd_port' };

  const vetted = await vetHost(url.hostname.replace(/^\[|\]$/g, ''), options);
  if (!vetted.ok) return { ok: false, why: vetted.why };
  return { ok: true, url: url.href, host: url.hostname };
}
