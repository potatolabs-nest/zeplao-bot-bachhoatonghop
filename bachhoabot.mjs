// Bách hoá tổng hợp — quầy đầu tiên: ai dán link vào nhóm, bot mở trang ấy ở khổ màn hình máy
// tính, chụp lại, rồi gửi tấm ảnh lên nhóm.
//
//   ZEPLAO_BOT_TOKEN=... node bachhoabot.mjs
//
// Vì sao lại cần, khi ứng dụng đã có xem trước link sẵn: cái xem trước ấy là tiêu đề, một dòng
// mô tả và cái ảnh `og:image` — tức là **thứ trang ấy tự nói về mình**. Ảnh chụp là thứ trang ấy
// thật sự hiện ra, ở bản máy tính, cái bản mà điện thoại trong tay người ta không mở ra được.
// Một bảng giá, một biểu đồ, một trang có bố cục ba cột: xem trước không mang được chúng về, ảnh
// chụp thì có.
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { linksIn, vetUrl } from './web/links.mjs';
import { CHROME_URL, chromePath, open } from './web/shot.mjs';
import { fileName, help, madeRecently, refusal } from './web/message.mjs';

/// Nơi nền tảng bot ở. Tên riêng, không phải `kuku.vn` — bot là mã của bên thứ ba, và giữ nó
/// khỏi cái tên người ta đang dùng là thứ cho phép chặn, đo và dời nó mà không ai phải sửa gì.
export const API = process.env.ZEPLAO_BOT_API ?? 'https://api-bot.kuku.vn';

/// Chỗ nhớ đã đọc tới đâu. Nhỏ, nhưng là thứ ngăn một lần khởi động lại chụp lại cả trăm cái link
/// cũ rồi dội chúng vào phòng — xem `offset` ở dưới.
export const STATE = process.env.BACHHOA_STATE
  ?? fileURLToPath(new URL('./data/state.json', import.meta.url));

/// Lệnh của bot. Ít, và đều là một chữ người ta đoán ra được: đây là con bot phần lớn thời gian
/// không cần ai gõ gì cả.
export const OWN = new Set(['anh', 'ảnh', 'chup', 'chụp', 'xem']);
/// Chữ đứng trước địa chỉ để xin cả trang dài thay vì màn hình đầu.
export const LONG = new Set(['dai', 'dài', 'full', 'ca', 'cả']);

/**
 * Chụp mấy link trong một tin nhắn.
 *
 * **Một.** Không phải vì khó làm nhiều hơn, mà vì mỗi tấm ảnh là một tin nhắn nữa đẩy cuộc trò
 * chuyện trôi lên, và nền tảng chỉ cho một tin mỗi giây mỗi phòng — ai dán năm cái link thì năm
 * giây sau nhóm vẫn đang xem ảnh thay vì nói chuyện. Ai cần cái thứ hai thì gõ `/anh <địa chỉ>`.
 */
export const MOST_LINKS = Number(process.env.BACHHOA_MOST_LINKS ?? 1);

/**
 * Chụp mấy trang một lúc, và xếp hàng dài nhất bao nhiêu.
 *
 * Hai, không phải một: một trang chậm mất tới mười lăm giây, và nối đuôi nhau thì cái link thứ
 * ba trong một nhóm đang nói chuyện rôm rả phải đợi gần một phút. Cũng không phải mười: mỗi
 * trang là một Chrome đang vẽ, và con bot này ở chung máy với những thứ khác.
 *
 * Hàng đợi có trần, và khi đầy thì **bỏ cái cũ nhất** chứ không bỏ cái mới. Một con bot cặm cụi
 * trả nợ hàng đợi là con bot trả lời những câu không ai còn nhớ đã hỏi.
 */
export const ORDERS = Number(process.env.BACHHOA_ORDERS ?? 2);
export const WAITING_MOST = Number(process.env.BACHHOA_WAITING ?? 12);

/// Cắt một lần chụp ở đây, kể cả khi Chrome còn nói là nó đang làm. Trần trong `shot.mjs` lo
/// phần trang chậm; cái trần này lo phần **Chrome treo**, và nó phải ở ngoài Chrome mới lo được.
export const SHOT_MS = Number(process.env.BACHHOA_SHOT_MS ?? 45_000);

/// Cùng một link, cùng một phòng, trong chừng này thì không chụp lại.
export const SAME_MS = Number(process.env.BACHHOA_SAME_MS ?? 10 * 60 * 1000);

export function commandsFor(me) {
  const name = String(me?.username ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  const commands = [
    { command: 'anh', description: 'Chụp hai màn hình đầu của một trang: /anh https://… — !anh thì chỉ bạn thấy' },
    { command: 'chup', description: 'Tên khác của /anh' },
    { command: 'xem', description: 'Tên khác của /anh' },
  ];
  if (name) commands.push({ command: name, description: 'Hướng dẫn dùng bot' });
  return commands;
}

/**
 * Bỏ chỗ gọi tên bot ở đầu câu.
 *
 * Nền tảng viết **handle** của bot vào `text`, nên câu tới nơi là `@bachhoabot https://…`. Trước
 * tháng 8/2026 nó viết tên hiển thị, mà tên hiển thị có dấu cách — nên bỏ cả hai, và bỏ theo thứ
 * tự dài trước để `@Bách hoá` không bị cắt còn `@Bách`.
 */
export function withoutName(text, names = []) {
  let left = String(text ?? '');
  for (const name of [...names].filter(Boolean).sort((a, b) => b.length - a.length)) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // `\b` không dùng được ở đây: nó là ranh giới giữa `\w` và không-`\w`, mà `\w` không tính
    // chữ có dấu — nên `@Bách hoá ` không có ranh giới nào sau chữ `á`, và tên hiển thị tiếng
    // Việt không bao giờ bị bóc ra. Hỏi thẳng: sau tên không được là chữ hay số.
    const found = new RegExp(`^\\s*@${escaped}(?![\\p{L}\\p{N}_])[\\s,:]*`, 'iu');
    if (found.test(left)) {
      left = left.replace(found, '');
      break;
    }
  }
  return left.trim();
}

/**
 * Tin nhắn này đang nhờ gì.
 *
 * Ba đường vào, và chúng khác nhau ở chỗ **im lặng có phải câu trả lời không**:
 *
 * - Gõ lệnh, hoặc gọi tên bot: có người hỏi thẳng, nên hỏng cũng phải nói vì sao.
 * - Dán một cái link giữa lúc nói chuyện: không ai hỏi bot cả. Chụp được thì gửi, không chụp
 *   được thì **nói riêng với người dán** — báo cả phòng rằng một cái link nào đó không mở được
 *   là bot chen vào một cuộc trò chuyện để kể một thứ không liên quan đến nó.
 * - Không có link, không ai gọi: im.
 */
export function request(message, me = {}) {
  const text = String(message?.text ?? '');
  const command = String(message?.command ?? '').toLowerCase();
  const onlyMe = message?.commandPrefix === '!' ? (message?.from?.userId ?? null) : null;

  if (command && OWN.has(command)) {
    const words = String(message.commandArgs ?? '').trim().split(/\s+/).filter(Boolean);
    const long = words.length > 1 && LONG.has(words[0].toLowerCase());
    const rest = (long ? words.slice(1) : words).join(' ');
    const [address] = linksIn(rest);
    if (!address) return { kind: 'help', onlyFor: onlyMe };
    return { kind: 'shot', address, fullPage: long, onlyFor: onlyMe, quiet: false };
  }
  // Một lệnh của bot khác trong cùng phòng. Nền tảng đã lọc phần lớn, nhưng `/help` thì tới tay
  // mọi bot — và một con bot trả lời mọi gạch chéo là một con bot không ai giữ lại trong nhóm.
  if (command) return null;

  const named = withoutName(text, [me.username, me.displayName]);
  const called = named !== text.trim();
  const links = linksIn(named);
  if (!links.length) return called ? { kind: 'help', onlyFor: onlyMe } : null;

  return {
    kind: 'shot',
    address: links[0],
    fullPage: false,
    onlyFor: onlyMe,
    quiet: !called,
    more: links.length - MOST_LINKS,
  };
}

export function readState(file = STATE) {
  try {
    const value = Number(JSON.parse(readFileSync(file, 'utf8'))?.offset);
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function writeState(offset, file = STATE) {
  if (!Number.isSafeInteger(offset) || offset < 0) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ offset })}\n`);
  } catch (problem) {
    // Không ghi được thì vẫn chạy tiếp: mất chỗ đánh dấu chỉ đau lúc khởi động lại, còn dừng
    // hẳn vì một ổ đĩa đầy thì đau ngay bây giờ.
    console.error(`không ghi được ${file}: ${problem}`);
  }
}

/**
 * Giữ một Chrome sống, và dựng lại khi nó chết.
 *
 * Một tiến trình cho cả đời con bot — nhưng đời con bot dài hơn đời một Chrome bị OOM killer dọn
 * đi lúc ba giờ sáng. Không có chỗ này thì cái chết ấy im lặng và vĩnh viễn: mọi câu trả lời sau
 * đó đều là "không mở được trang", và log chỉ nói đúng một câu ấy.
 */
export function keeper(start = open, { ms = SHOT_MS } = {}) {
  let browser = null;
  return {
    async shot(address, options) {
      for (let attempt = 0; attempt < 2; attempt++) {
        browser ??= await start();
        // Đồng hồ đếm ngược phải **huỷ được**. Một `setTimeout` 45 giây bỏ lại sau mỗi lần chụp
        // là 45 giây tiến trình không chịu thoát khi có người gõ Ctrl-C — và trong bộ test thì
        // nó là một lần chạy treo cứng không rõ vì sao.
        const stop = new AbortController();
        const late = wait(ms, 'quá lâu', { signal: stop.signal }).catch(() => null);
        try {
          const made = await Promise.race([browser.shot(address, options), late]);
          if (made === 'quá lâu') throw new Error('quá lâu, bỏ');
          return made;
        } catch (problem) {
          const gone = /Chrome|kết nối|quá lâu/.test(String(problem));
          // Treo cũng tính là chết: một tab không chịu đóng giữ luôn cả tiến trình, và lần chụp
          // sau sẽ treo y như vậy. Dựng lại rẻ hơn là hỏng mãi.
          if (gone) {
            try { browser.close(); } catch { /* chết rồi thì thôi */ }
            browser = null;
          }
          if (attempt === 1 || !gone) throw problem;
        } finally {
          stop.abort();
        }
      }
      throw new Error('không chụp được');
    },
    close() {
      try { browser?.close(); } catch { /* xong */ }
      browser = null;
    },
  };
}

/**
 * Hàng đợi có trần, chạy nhiều nhất `most` việc một lúc.
 *
 * Đầy thì bỏ cái **cũ nhất**, và nói ra. Xem `WAITING_MOST`.
 */
export function queue(most = ORDERS, waiting = WAITING_MOST) {
  const jobs = [];
  let running = 0;

  function pump() {
    while (running < most && jobs.length) {
      const job = jobs.shift();
      running += 1;
      Promise.resolve()
        .then(job)
        .catch((problem) => console.error(`việc hỏng: ${problem}`))
        .finally(() => { running -= 1; pump(); });
    }
  }

  return {
    add(job) {
      if (jobs.length >= waiting) {
        jobs.shift();
        console.error(`hàng đợi đầy (${waiting}), bỏ việc cũ nhất`);
      }
      jobs.push(job);
      pump();
    },
    get size() { return jobs.length + running; },
  };
}

/// Cùng một tin nhắn, cùng một địa chỉ thì cùng một `clientMessageId` — nên gửi lại sau một cú
/// 429 hay một lần mạng đứt không làm ra tấm ảnh thứ hai trong phòng.
export function stampFor(messageId, address) {
  const short = createHash('sha256').update(String(address)).digest('base64url').slice(0, 10);
  return `${messageId}:${short}`;
}

async function run(token) {
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function call(method, body) {
    const answer = await fetch(`${API}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: auth,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!answer.ok) throw new Error(`${method} trả lời ${answer.status}: ${await answer.text()}`);
    return answer.json();
  }

  const me = await call('getMe');
  console.log(`@${me.username} đang nghe · Chrome ở ${CHROME_URL ?? chromePath()}`);

  await call('setCommands', { commands: commandsFor(me) }).catch((problem) => {
    // Khai lệnh hỏng thì bot vẫn nghe được `@tên` và — nếu chủ bot đã tắt chế độ riêng tư — vẫn
    // thấy mọi link trong phòng. Mất một đường vào, không mất cả con bot.
    console.error(`setCommands hỏng, chạy tiếp: ${problem}`);
  });

  const chrome = keeper();
  const jobs = queue();
  const seen = new Map();

  let offset = readState();
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => { stopping = true; chrome.close(); process.exit(0); });
  }

  for (;;) {
    if (stopping) return;
    let updates;
    try {
      // Giữ mở ở đầu kia cho tới khi có việc, nên vòng lặp này không phải là hỏi mỗi giây — nó
      // là một câu hỏi biết đợi.
      updates = await call(`getUpdates?offset=${offset}&timeout=30`);
    } catch (problem) {
      console.error(String(problem));
      await wait(2000);
      continue;
    }

    for (const update of updates) {
      // Dời **trước** khi làm, không phải sau: một update làm bot ném lỗi mà chưa dời thì lần
      // hỏi sau nó lại về, và lại, mãi mãi.
      offset = update.id;
      writeState(offset);

      // `bot_added` đi qua đây mà không nói gì. Nhiều bot chào một câu lúc vào phòng, vì chế độ
      // riêng tư nhìn từ trong phòng thì không thấy được — nhưng con bot này được thêm vào để
      // làm một việc im lặng, và một lời chào là tin nhắn đầu tiên nó gửi lại chẳng phải việc
      // ấy. Ai cần biết nó làm gì thì gõ tên nó.
      if (update.kind !== 'message') continue;

      const message = update.message;
      if (message?.from?.userId && message.from.userId === me.id) continue;

      const asked = request(message, me);
      if (!asked) continue;
      if (asked.kind === 'help') {
        jobs.add(() => say(message.conversationId, {
          text: help(me.username), replyToMessageId: message.messageId, onlyForUserId: asked.onlyFor,
        }));
        continue;
      }
      if (madeRecently(seen, message.conversationId, asked.address, { within: SAME_MS })) {
        console.log(`bỏ qua ${asked.address} — vừa chụp trong phòng này`);
        continue;
      }
      jobs.add(() => serve(message, asked));
    }
  }

  /** Mở trang, chụp, gửi. Một việc trong hàng đợi. */
  async function serve(message, asked) {
    const began = Date.now();
    const vetted = await vetUrl(asked.address);
    if (!vetted.ok) {
      console.log(`từ chối ${asked.address}: ${vetted.why}`);
      return sorry(message, asked, refusal(vetted.why, asked.address));
    }

    let made;
    try {
      made = await chrome.shot(vetted.url, { fullPage: asked.fullPage });
    } catch (problem) {
      console.error(`chụp ${vetted.url} hỏng: ${problem}`);
      return sorry(message, asked, `Không chụp được ${new URL(vetted.url).hostname}: ${problem.message}.`);
    }

    console.log(`${vetted.url} -> ${Math.round(made.png.byteLength / 1024)}KB, ${made.height}px, tỉ lệ ${made.scale.toFixed(2)}, ${Date.now() - began}ms · ${made.title}`);
    // **Không có `text`.** Câu trả lời là tấm ảnh, và một dòng chữ dưới nó chỉ nói lại thứ trong
    // ảnh đã có. Máy chủ không bắt buộc `text` khi có ảnh (`RefusedAsWritten` chỉ xét độ dài và
    // bàn phím), dù tài liệu viết "required unless stickerId" — dòng ấy nói về tin nhắn chữ.
    //
    // Cái mất: một ảnh chụp không kèm tên miền thì link rút gọn dẫn đi đâu không ai thấy. Chỗ
    // duy nhất còn giữ tên miền là tên file ảnh, và chỉ hiện ra lúc có người tải nó về.
    await say(message.conversationId, {
      replyToMessageId: message.messageId,
      clientMessageId: stampFor(message.messageId, vetted.url),
      onlyForUserId: asked.onlyFor,
      image: {
        fileName: fileName(vetted.url),
        contentType: 'image/png',
        dataBase64: made.png.toString('base64'),
      },
    });
  }

  /**
   * Nói là không chụp được.
   *
   * Người gõ lệnh thì cả phòng nghe — họ hỏi trước mặt mọi người. Người chỉ dán một cái link thì
   * chỉ mình họ nghe (`onlyForUserId`): họ đang nói chuyện với nhau, không ai hỏi bot cả, và một
   * dòng "không mở được" giữa câu chuyện là bot chen ngang để kể chuyện của nó.
   */
  function sorry(message, asked, text) {
    const onlyFor = asked.quiet ? (message?.from?.userId ?? null) : asked.onlyFor;
    if (asked.quiet && !onlyFor) return null;
    return say(message.conversationId, { text, replyToMessageId: message.messageId, onlyForUserId: onlyFor });
  }

  /**
   * Gửi, và đợi tới lượt nếu đang nói nhanh quá.
   *
   * Một phòng cho bot một tin mỗi giây. Gặp 429 thì đợi rồi gửi lại — bỏ câu trả lời đi nghĩa là
   * có người hỏi mà không được gì, mà từ phía họ thì đó là một con bot hỏng.
   *
   * Ba lần rồi thôi. Một con bot tự nuôi hàng đợi của mình mãi mãi là con bot trả lời những câu
   * không ai còn nhớ đã hỏi.
   */
  async function say(conversationId, body) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await call('sendMessage', { conversationId, ...body });
      } catch (problem) {
        const busy = String(problem).includes('429');
        if (!busy || attempt === 2) {
          console.error(String(problem));
          return null;
        }
        await wait(1100 * (attempt + 1));
      }
    }
    return null;
  }
}

// Chỉ khi chính file này được chạy. Người khác `import` nó — một bộ test, hay ai đó dựng tiếp
// trên nó — thì đây là mấy hàm ở trên và không có gì khác.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.ZEPLAO_BOT_TOKEN;
  if (!token) {
    console.error('Chưa có ZEPLAO_BOT_TOKEN. Tạo bot ở https://kuku.vn/bot rồi đặt biến này.');
    process.exit(2);
  }
  if (!CHROME_URL && !chromePath()) {
    // Ngã ở đây, không ngã ở cái link đầu tiên có người dán. Một con bot khởi động được rồi mới
    // hỏng là một con bot trông như đang chạy.
    console.error('Không tìm thấy Chrome. Cài chromium, đặt CHROME_PATH, hoặc trỏ CHROME_URL vào một Chrome có sẵn.');
    process.exit(2);
  }
  await run(token);
}
