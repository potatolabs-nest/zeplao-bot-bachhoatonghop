// Chữ bot nói, và trí nhớ ngắn hạn về những gì vừa chụp.
//
// Ít chữ, vì câu trả lời của con bot này là **một tấm ảnh trần, không kèm dòng nào**. Chữ ở đây
// chỉ còn cho hai lúc: lúc không chụp được, và lúc có người hỏi nó làm được gì.
//
// Để riêng khỏi `shot.mjs` vì đây là phần **người đọc**, còn kia là phần trình duyệt: một câu
// sai chính tả và một trang chụp hỏng là hai loại lỗi khác nhau, sửa ở hai chỗ khác nhau.
import { WHY } from './links.mjs';

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
