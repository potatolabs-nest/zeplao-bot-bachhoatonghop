// Chữ đi kèm tấm ảnh, và trí nhớ ngắn hạn về những gì vừa chụp.
//
// Để riêng khỏi `shot.mjs` vì đây là phần **người đọc**, còn kia là phần trình duyệt: một câu
// sai chính tả và một trang chụp hỏng là hai loại lỗi khác nhau, sửa ở hai chỗ khác nhau.
import { WHY } from './links.mjs';

/// Trần chữ của nền tảng là 2000 ký tự; tiêu đề một trang thì không có trần nào cả.
const MOST_TITLE = 120;

/**
 * Một dòng dưới tấm ảnh.
 *
 * Tiêu đề rồi tên miền, vì ảnh đã nói trang trông thế nào rồi — thứ ảnh không nói được là nó
 * **của ai**. Một ảnh chụp không kèm tên miền là thứ dùng để lừa người ta: bất kỳ trang nào cũng
 * vẽ được giao diện của bất kỳ trang nào khác.
 *
 * Và chỗ nào bot **chuyển hướng** tới nơi khác thì nói ra. Link rút gọn là chuyện thường, nhưng
 * "bấm vào đây" dẫn đi đâu là thứ người trong nhóm có quyền biết trước khi bấm.
 */
export function caption({ title, url, asked, truncated } = {}) {
  const parts = [];
  const name = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (name) parts.push(name.length > MOST_TITLE ? `${name.slice(0, MOST_TITLE - 1)}…` : name);

  const here = hostOf(url);
  const there = hostOf(asked);
  if (here) parts.push(here === there || !there ? here : `${there} → ${here}`);

  const line = parts.join(' · ');
  return truncated ? `${line}\n(trang dài, ảnh cắt ở phần đầu)` : line;
}

export function hostOf(address) {
  try {
    return new URL(String(address ?? '')).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Tên file ảnh.
 *
 * Nền tảng không dùng nó vào việc gì ngoài lúc người ta tải về, nhưng `image.png` thì tải mười
 * cái là mười lần `image (3).png` — tên miền và ngày làm cho chúng xếp cạnh nhau có nghĩa.
 */
export function fileName(url, at = new Date()) {
  const host = hostOf(url).replace(/[^a-z0-9.-]/gi, '') || 'trang';
  const day = at.toISOString().slice(0, 10);
  return `${host}-${day}.png`;
}

/// Vì sao không chụp được. Một dòng, vì đây là tin nhắn trong một nhóm chat chứ không phải log.
export function refusal(why, address) {
  const host = hostOf(address);
  const said = WHY[why] ?? why;
  return host ? `Không mở được ${host}: ${said}.` : `Không mở được: ${said}.`;
}

export function greeting(username) {
  const name = username ? `@${username}` : 'Bot';
  return [
    `${name} đây. Ai dán link vào nhóm, tôi mở trang ấy ở khổ màn hình máy tính rồi chụp lại gửi lên.`,
    '',
    `Gõ /anh <địa chỉ> để nhờ chụp một trang cụ thể, /anh dai <địa chỉ> để lấy cả trang dài.`,
    `Gõ !anh thì chỉ mình bạn thấy ảnh.`,
    '',
    // Nói ra, vì chế độ riêng tư nhìn từ trong phòng thì không thấy được: một con bot vừa thêm
    // vào mà im thin thít trông y hệt một con bot hỏng.
    'Muốn tôi tự chụp mọi link ai đó dán mà không phải gõ lệnh, chủ bot tắt chế độ riêng tư ở trang bot — cả nhóm sẽ được báo khi việc đó xảy ra.',
  ].join('\n');
}

export function help(username) {
  const name = username ? `@${username}` : 'bot';
  return [
    `/anh <địa chỉ> — mở trang ở khổ 1280px rồi chụp, gửi cả nhóm`,
    `!anh <địa chỉ> — như trên, chỉ mình bạn thấy`,
    `/anh dai <địa chỉ> — chụp cả trang, không chỉ màn hình đầu`,
    `@${name} <địa chỉ> — gọi tên cũng được`,
    '',
    'Tắt chế độ riêng tư ở trang bot thì khỏi gõ lệnh: dán link vào nhóm là tôi chụp.',
  ].join('\n');
}

/**
 * Cái link này vừa chụp xong chưa.
 *
 * Một link hay được dán lại: người ta trả lời nhau, chuyển tiếp, dán nhầm hai lần. Chụp lại đúng
 * cái trang ấy lần thứ ba trong mười phút không nói thêm được gì, mà lại đẩy ba cái ảnh vào giữa
 * cuộc trò chuyện của người khác.
 *
 * Nhớ theo **từng phòng**, không nhớ chung: cùng một link, nhóm này đã xem rồi không có nghĩa là
 * nhóm kia đã xem.
 */
export function madeRecently(seen, conversationId, url, { within = 10 * 60 * 1000, now = Date.now(), most = 500 } = {}) {
  const key = `${conversationId}|${url}`;
  const at = seen.get(key);
  // `at !== undefined`, không phải `at`: một mốc thời gian **bằng 0** là một mốc thật, và viết
  // `if (at && …)` thì nó biến mất. Chỉ lộ ra ở mốc 0 — tức là chỉ trong test, và chỉ lần này.
  if (at !== undefined && now - at < within) return true;
  seen.set(key, now);
  // Bỏ cái cũ nhất khi đầy. `Map` giữ đúng thứ tự thêm vào, nên cái đầu hàng chính là cái cũ nhất.
  while (seen.size > most) seen.delete(seen.keys().next().value);
  return false;
}
