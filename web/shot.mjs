// Mở một trang bằng Chrome thật, ở khổ màn hình máy tính, rồi chụp lại.
//
// Nói thẳng với Chrome qua CDP — cái giao thức DevTools vẫn dùng — chứ không qua Puppeteer hay
// Playwright. Không phải vì chúng dở, mà vì cả repo này không phụ thuộc gói nào: `npm install`
// không chạy lần nào, không có lockfile để mà lệch, và cái image Docker là Node, Chromium và
// bốn file. Phần CDP cần cho việc chụp một trang vừa đúng chỗ ở dưới đây và đọc hết trong một
// lần ngồi — nhỏ hơn hẳn cái giá của một cây phụ thuộc phải trông cho khỏi cũ.
//
// Node 22 trở lên có sẵn `WebSocket`, nên cả phần nói chuyện cũng không cần gói nào.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { vetUrl } from './links.mjs';

/**
 * Khổ màn hình.
 *
 * 1280×800, và **không** phải chế độ điện thoại — đây là cả yêu cầu của con bot: người ta gửi
 * link trong nhóm rồi muốn thấy trang ấy *như trên máy tính*, chứ bản điện thoại thì điện thoại
 * của họ đã mở được rồi. Nhiều trang chọn bố cục theo chiều ngang và theo user agent, nên phải
 * đặt cả hai, không đặt mỗi cái.
 */
export const WIDTH = Number(process.env.SHOT_WIDTH ?? 1280);
export const HEIGHT = Number(process.env.SHOT_HEIGHT ?? 800);
export const UA = process.env.SHOT_UA
  ?? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/// Trần ảnh của nền tảng: 2 MB sau khi giải base64 (`BotImages.MaxBytes`). Cắt ở 1,9 MB để còn
/// chỗ cho sai số, vì vượt trần là `400 bot_image_size` — mất cả công mở trang.
export const MOST_BYTES = 1_900_000;

/**
 * Bao giờ thì chụp.
 *
 * **Không đợi `load`.** Đo thử trên chính Chrome: `example.com` nổ `load` sau 180ms, còn
 * `github.com` và `vnexpress.net` thì **không nổ trong 25 giây** — một request quảng cáo treo,
 * một cái font không về, và sự kiện ấy không bao giờ tới dù trang đã vẽ xong từ lâu. Bot đợi
 * `load` là bot trả lời sau 15 giây cho những trang người ta hay gửi nhất.
 *
 * Thứ đo được là **mạng có còn động đậy không**: mỗi request mở ra, xong, hoặc hỏng đều là một
 * sự kiện; hết `QUIET_MS` không có sự kiện nào thì trang đứng yên, chụp được. Một request treo
 * không sinh sự kiện, nên nó không giữ bot lại — đúng cái mà `load` không làm được.
 */
export const QUIET_MS = Number(process.env.SHOT_QUIET_MS ?? 700);
/// Đợi ít nhất chừng này kể cả khi mạng lặng ngay: lặng lúc 0ms là chưa bắt đầu, không phải xong.
export const LEAST_MS = Number(process.env.SHOT_LEAST_MS ?? 600);
/**
 * Vẽ xong chữ đầu tiên rồi thì chờ thêm nhiều nhất chừng này, dù mạng còn động.
 *
 * Có trang không bao giờ lặng: `github.com` gọi request đều đặn suốt, nên chỉ đo mạng thì bot
 * ngồi hết trần 15 giây. Tệ hơn cả chậm — chụp ở giây thứ 25 ra một trang **trắng**, vì đúng lúc
 * ấy trang đang thay nội dung; chụp ở giây thứ 8 thì đủ cả. Muộn hơn không phải là chắc hơn.
 *
 * Nên có hai đường về đích: mạng lặng, hoặc đã vẽ ra chữ và chờ thêm ngần này. Cái nào tới
 * trước thì đi tiếp.
 *
 * Ngắn — một giây rưỡi — vì đây không còn là lần chờ cuối. Sau nó còn cả đoạn cuộn qua bốn màn
 * hình và một lần đợi ảnh về ở đáy, nên trang nào chưa kịp xong ở đây vẫn còn mấy giây nữa.
 */
export const PAINTED_MS = Number(process.env.SHOT_PAINTED_MS ?? 1500);
/**
 * Trang vẫn trống mà mạng đã lặng thì đợi tới đây rồi mới chịu chụp một trang trống.
 *
 * Mạng lặng **không** có nghĩa là trang xong, và sự kiện "đã vẽ" của Chrome cũng không. Đo
 * `kuku.vn/bot/doc` — một trang dựng bằng JS: ở giây thứ 1 mạng đã lặng 927ms mà trang có
 * **0 chữ**; chữ chỉ hiện ra ở giây thứ 1,5. Chrome vẫn báo đã vẽ, vì nó có vẽ — nó vẽ cái nền.
 * Tin vào hai tín hiệu ấy là gửi lên nhóm một tấm ảnh trắng và ghi vào log là đã chụp xong.
 *
 * Nên trước khi chụp thì **hỏi thẳng trang xem trên đó đã có gì chưa**. Trừ khi đã đợi ngần này:
 * có trang trống thật, và một file PDF hay một tấm ảnh thì không bao giờ có chữ nào cả.
 */
export const BLANK_MS = Number(process.env.SHOT_BLANK_MS ?? 5000);

/**
 * Hỏi trang xem **trong khung nhìn** có gì.
 *
 * Đếm chữ trong cả trang thì không đủ, và `github.com` là chỗ nó gãy: trang ấy có thanh điều
 * hướng ở trên cùng từ giây đầu, nên `innerText` khác 0 ngay lập tức trong khi cả phần thân còn
 * trắng. Đo mười lượt thì ba lượt bot chụp phải cái khoảng trắng ấy.
 *
 * Nên hỏi đúng thứ sẽ vào ảnh: chín điểm rải khắp khung nhìn, dưới mỗi điểm có gì không. `body`
 * với `html` không tính — đó là "không có gì" đội lốt một phần tử. Đây cũng là cách duy nhất
 * đếm được một trang chỉ có mỗi tấm ảnh, hay một file PDF nhúng, mà không phải kể tên từng loại.
 */
export const LOOK = `(() => {
  if (!document.body) return -1;
  const w = innerWidth, h = innerHeight;
  let hits = 0;
  for (const x of [0.2, 0.5, 0.8]) {
    for (const y of [0.2, 0.45, 0.7]) {
      const stack = document.elementsFromPoint(x * w, y * h) || [];
      if (stack.some((one) => one !== document.body && one !== document.documentElement)) hits += 1;
    }
  }
  if (hits > 0) return hits;
  // Không thấy gì, và bây giờ mới hỏi vì sao: trang đọc xong rồi mà trống là **trống thật** (số
  // 0), còn đang đọc dở thì là **chưa tới** (số âm). Hai cái ấy phải đi hai đường: \`github.com\`
  // có lúc còn 'loading' ở giây thứ 5 với mạng im lìm, và bắn cửa thoát 'trang trống' ở đó là
  // gửi lên nhóm một tấm ảnh trắng của một trang hoàn toàn bình thường.
  //
  // Hỏi sau khi đếm chứ không hỏi trước: một trang đang đọc dở mà đã vẽ ra nội dung thì chụp
  // được rồi. Hỏi trước là mọi trang chậm đều phải ngồi hết trần mười lăm giây.
  return document.readyState === 'loading' ? -1 : 0;
})()`;

/**
 * Phải thấy có gì đó mấy nhịp liền rồi mới chụp.
 *
 * Một lần là chưa đủ: trang dựng bằng JS thay cả phần thân trong một nhịp vẽ, và nhìn trúng đúng
 * lúc ấy thì thấy trắng — hoặc tệ hơn, thấy có rồi chụp ngay lúc nó vừa trống đi.
 */
export const SURE = 3;
/// Trần trên. Trang nào động đậy mãi mà cũng chẳng vẽ được gì thì tới đây chụp cái đang có. Một
/// ảnh trang vẽ gần hết vẫn là câu trả lời; không chụp gì thì không.
export const LOAD_MS = Number(process.env.SHOT_LOAD_MS ?? 15_000);
/// Mạng lặng rồi vẫn đợi thêm chừng này cho chữ nhảy vào chỗ sau khi font về, và cho mấy khung
/// dựng bằng JS kịp vẽ. Ngắn, vì phần chờ thật đã nằm ở `QUIET_MS` bên trên.
export const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 400);

/**
 * Cuộn xong thì đợi thêm nhiều nhất chừng này cho ảnh vừa gọi kịp về.
 *
 * Cuộn **là** một lần tải nữa, không phải một cú di chuyển. Bốn màn hình của `theguardian.com`
 * chụp ngay sau khi cuộn ra một trang bố cục đầy đủ mà **mọi ô ảnh đều trắng**: cuộn qua 3200px
 * chỉ kịp đánh thức chừng ấy ảnh, còn chúng về tới nơi thì đã muộn nửa giây. Nhìn từ log thì đó
 * là một lần chụp thành công, nhẹ bất thường.
 */
export const SCROLLED_MS = Number(process.env.SHOT_SCROLLED_MS ?? 4500);
/// Dừng lại ở mỗi nấc cuộn chừng này. Xem `scrollDown` — đây là con số quyết định bao nhiêu ảnh
/// trên trang kịp được đánh thức.
export const DWELL_MS = Number(process.env.SHOT_DWELL_MS ?? 400);

/**
 * Chụp mấy màn hình.
 *
 * Hai, không phải một. Một màn hình đầu của gần như mọi trang bây giờ là logo, thanh điều hướng,
 * một cái banner nhận cookie và đúng một cái tiêu đề — tức là ảnh chụp ra thứ ai cũng đoán được,
 * còn cái người ta dán link để khoe thì nằm ngay dưới mép. Hai màn hình là qua khỏi phần trang
 * trí và tới được phần nội dung.
 *
 * Không nhiều hơn, vì đây là ảnh trong khung chat: cao gấp ba là chữ nhỏ tới mức không đọc được
 * trên điện thoại, và là một tấm ảnh chiếm cả màn hình người khác. Ai cần cả trang thì gõ
 * `/anh dai`.
 */
export const PAGES = Number(process.env.SHOT_PAGES ?? 6);

/// Chụp cả trang dài thì cắt ở đây. Một bài báo dài 20.000px thành một cái ảnh không ai đọc nổi
/// trong khung chat.
export const MOST_FULL_HEIGHT = Number(process.env.SHOT_FULL_HEIGHT ?? 8000);

/**
 * Cỡ ảnh nhắm tới, và trần cứng.
 *
 * Trần của nền tảng là 2 MB, nhưng 2 MB là **quá nặng cho một tin nhắn**: người ta đang ngồi 4G
 * trong quán, và một tấm ảnh bot tự gửi vào giữa cuộc nói chuyện thì không ai chọn tải nó cả.
 *
 * Không có đường nén nào khác ngoài giảm điểm ảnh: nền tảng chỉ nhận PNG với SVG — không JPEG —
 * và SVG bọc một tấm JPEG cũng bị chặn có chủ ý (`href="data:"` nằm trong regex `UnsafeSvg` của
 * `BotApi.cs`). Nên "nén" ở đây là thu nhỏ, và thu bao nhiêu thì đo mà ra, xem `fit`.
 */
export const AIM_BYTES = Number(process.env.SHOT_AIM_BYTES ?? 900_000);
/// Thu nhỏ tới đây là hết: dưới nữa thì chữ trên ảnh không còn đọc được, mà một tấm ảnh nhẹ
/// không đọc được thì nhẹ để làm gì. Trừ một chỗ — xem `SAFE_BYTES`.
export const LEAST_SCALE = Number(process.env.SHOT_LEAST_SCALE ?? 0.5);

/**
 * Trần cho **một gói CDP**, và nó là một cái trần vật lý chứ không phải một lựa chọn.
 *
 * `WebSocket` có sẵn của Node có giới hạn kích thước gói. Đo được: base64 3,88 MB qua lọt, cỡ
 * gấp đôi thì **đứt kết nối** — không lỗi, không mã đóng, chỉ là cái socket chết và mọi lệnh
 * đang chờ hỏng theo. Ảnh sáu màn hình của một trang báo chụp ở tỉ lệ 1 nằm đúng vùng ấy, nên
 * nâng từ bốn lên sáu màn hình làm chết Chrome ngay ở trang thứ nhất.
 *
 * Đây là lý do `fit` **đo trước rồi mới chụp** thay vì chụp to rồi thu: tấm ảnh quá khổ ấy
 * không bao giờ được phép tồn tại, chứ không phải tồn tại rồi bị bỏ đi. Và cũng vì nó mà tỉ lệ
 * được phép xuống dưới `LEAST_SCALE` — chữ nhỏ khó đọc còn hơn không có ảnh nào.
 */
export const SAFE_BYTES = Number(process.env.SHOT_SAFE_BYTES ?? 2_600_000);

/// Những chỗ Chrome hay nằm, xếp theo thứ tự thử. `CHROME_PATH` đặt trước tất cả.
const PLACES = [
  process.env.CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

/**
 * Chrome ở sẵn một chỗ khác, thay vì bật một cái ở đây.
 *
 * `http://chrome:9222` (hỏi `/json/version` để lấy địa chỉ ws) hoặc thẳng `ws://…`. Đặt biến này
 * thì image của bot không cần chứa trình duyệt nào cả — và trình duyệt là **709 MiB** trong số
 * 828 MiB của image trước đó, tức là gần như toàn bộ. Máy dựng image hết chỗ chính vì con số ấy.
 */
export const CHROME_URL = process.env.CHROME_URL ?? null;

export function chromePath() {
  for (const place of PLACES) {
    if (place && existsSync(place)) return place;
  }
  return null;
}

/**
 * Một cuộc nói chuyện với Chrome.
 *
 * CDP là JSON hai chiều trên một WebSocket: mỗi lệnh mang một `id` và câu trả lời mang lại đúng
 * số ấy, còn sự kiện thì không có `id`. `sessionId` là cách một kết nối duy nhất điều khiển nhiều
 * tab — "flatten" — nên cả con bot chỉ mở một socket dù đang chụp mấy trang.
 */
function talk(socket) {
  const waiting = new Map();
  const listeners = new Map();
  let nextId = 1;
  let dead = null;

  socket.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message ?? 'CDP lỗi'} (${message.error.code ?? '?'})`));
      else resolve(message.result ?? {});
      return;
    }
    if (!message.method) return;
    for (const listener of listeners.get(message.method) ?? []) {
      try {
        listener(message.params ?? {}, message.sessionId);
      } catch (problem) {
        console.error(`nghe ${message.method}: ${problem}`);
      }
    }
  };

  const stop = (why) => {
    dead ??= new Error(why);
    for (const { reject } of waiting.values()) reject(dead);
    waiting.clear();
  };
  // Mã đóng và lý do, không phải một câu chung chung. 1009 là "gói quá to" — và đó đúng là cái
  // đã xảy ra với ảnh sáu màn hình, mà một dòng "kết nối hỏng" thì không đời nào chỉ ra được.
  socket.onclose = (event) => stop(
    `Chrome đã đóng kết nối (mã ${event?.code ?? '?'}${event?.reason ? `: ${event.reason}` : ''})`,
  );
  socket.onerror = (event) => stop(`kết nối tới Chrome hỏng (${event?.message ?? 'không rõ'})`);

  return {
    send(method, params = {}, sessionId) {
      if (dead) return Promise.reject(dead);
      const id = nextId++;
      const body = { id, method, params };
      if (sessionId) body.sessionId = sessionId;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        try {
          socket.send(JSON.stringify(body));
        } catch (problem) {
          waiting.delete(id);
          reject(problem);
        }
      });
    },
    on(method, listener) {
      const list = listeners.get(method) ?? [];
      list.push(listener);
      listeners.set(method, list);
      return () => listeners.set(method, (listeners.get(method) ?? []).filter((one) => one !== listener));
    },
    close() {
      stop('đã đóng');
      try { socket.close(); } catch { /* đóng rồi thì thôi */ }
    },
  };
}

/// Cờ khởi động. Mỗi dòng là một thứ không cần cho việc chụp một trang, và mỗi thứ không cần là
/// một thứ có thể hỏng hoặc gọi ra ngoài.
function flags(dir, extra = []) {
  return [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${dir}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    `--user-agent=${UA}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-sync',
    '--disable-default-apps',
    '--disable-background-networking',
    '--disable-client-side-phishing-detection',
    '--disable-popup-blocking',
    '--no-service-autorun',
    '--password-store=basic',
    '--use-mock-keychain',
    '--force-color-profile=srgb',
    '--disable-features=Translate,MediaRouter,OptimizationHints,BackForwardCache,AcceptCHFrame',
    '--lang=vi-VN',
    // Trong container Chrome không dựng được sandbox của nó nếu không có quyền; chỗ gọi bật cờ
    // này qua `CHROME_NO_SANDBOX`. Không bật mặc định: tắt sandbox trên máy thường là bỏ đi lớp
    // duy nhất đứng giữa một trang lạ và cái máy đang chạy bot.
    ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    ...extra,
    'about:blank',
  ];
}

/**
 * Lấy một trình duyệt: nối vào cái có sẵn nếu được chỉ chỗ, không thì tự bật một cái.
 *
 * Chỗ gọi không cần biết là cái nào. Khác nhau đúng hai điều, và cả hai nằm gọn ở đây: cái tự
 * bật thì đóng là **giết**, cái nối vào thì đóng chỉ là cúp máy — nó không phải của mình; và cờ
 * khởi động chỉ đặt được cho cái tự bật, nên mọi thứ thật sự quan trọng (khổ màn hình, user
 * agent, thanh cuộn) đều đặt lại cho **từng trang** trong `shot`, không đặt bằng cờ.
 */
export async function open({ url = CHROME_URL, bin, args } = {}) {
  return url ? connect(url) : launch({ bin, args });
}

/**
 * Địa chỉ WebSocket của một Chrome ở sẵn.
 *
 * `ws://…` thì đã là nó rồi. `http://chrome:9222` thì phải hỏi `/json/version` — cổng gỡ lỗi cho
 * mỗi lần chạy một đường dẫn có chuỗi ngẫu nhiên, nên không đoán được và không viết cứng được.
 *
 * Tách ra khỏi `connect` để thử được mà không cần một Chrome thật đứng đó.
 */
export async function endpointFor(where, { ask = fetch } = {}) {
  const given = String(where ?? '').trim();
  if (!given) throw new Error('CHROME_URL rỗng');
  if (/^wss?:\/\//i.test(given)) return given;

  const answer = await ask(new URL('/json/version', given));
  if (!answer.ok) throw new Error(`${given} trả lời ${answer.status}`);
  const found = (await answer.json())?.webSocketDebuggerUrl;
  if (!found) throw new Error(`${given} không nói địa chỉ WebSocket`);
  return found;
}

/** Nối vào một Chrome đang chạy sẵn ở đâu đó. */
export async function connect(where) {
  const chrome = talk(await socketTo(await endpointFor(where)));
  // Không giết, chỉ cúp máy: Chrome ấy là của người khác, và có thể đang vẽ trang cho ai đó.
  return { chrome, close: () => chrome.close(), shot: (url, options) => shot(chrome, url, options) };
}

async function socketTo(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error(`không nối được vào Chrome ở ${endpoint}`));
  });
  return socket;
}

/**
 * Bật Chrome lên và giữ nó chạy.
 *
 * Một tiến trình cho cả đời con bot, nhưng **mỗi lần chụp một hồ sơ riêng** (`createBrowserContext`):
 * hai người lạ gửi hai link không được dùng chung cookie, localStorage hay cache. Bật lại Chrome
 * mỗi lần cũng cho như vậy nhưng tốn thêm nửa giây mỗi câu trả lời, mà nửa giây ấy nằm đúng chỗ
 * người ta đang chờ.
 */
export async function launch({ bin = chromePath(), args = [] } = {}) {
  if (!bin) throw new Error('Không tìm thấy Chrome. Cài chromium, hoặc đặt CHROME_PATH.');

  const dir = mkdtempSync(join(tmpdir(), 'bachhoa-chrome-'));
  const child = spawn(bin, flags(dir, args), { stdio: ['ignore', 'ignore', 'pipe'] });

  // Chrome nói địa chỉ cổng gỡ lỗi ra stderr rồi nói tiếp đủ thứ khác suốt đời nó. Giữ lại
  // **mấy dòng cuối** thôi: lần đầu viết là `log += chunk` không bao giờ dừng, tức là một chuỗi
  // lớn lên mãi trong một tiến trình chạy hàng tuần — và đúng những dòng cuối ấy mới là thứ cần,
  // vì chúng là lời trăng trối của Chrome lúc nó chết.
  const said = [];
  const remember = (chunk) => {
    said.push(String(chunk));
    while (said.length > 20) said.shift();
  };
  const lastWords = () => said.join('').slice(-600).trim();

  const endpoint = await new Promise((resolve, reject) => {
    const giveUp = setTimeout(() => reject(new Error(`Chrome không nói gì sau 30 giây:\n${lastWords()}`)), 30_000);
    const listen = (chunk) => {
      remember(chunk);
      const found = said.join('').match(/ws:\/\/\S+/);
      if (!found) return;
      clearTimeout(giveUp);
      child.stderr.off('data', listen);
      child.stderr.on('data', remember);
      resolve(found[0]);
    };
    child.stderr.on('data', listen);
    child.once('error', (problem) => { clearTimeout(giveUp); reject(problem); });
    child.once('exit', (code) => { clearTimeout(giveUp); reject(new Error(`Chrome tắt ngay, mã ${code}:\n${lastWords()}`)); });
  });

  const chrome = talk(await socketTo(endpoint));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    chrome.close();
    try { child.kill('SIGTERM'); } catch { /* chết rồi thì thôi */ }
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* xong */ } }, 3000).unref?.();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* thư mục tạm, kệ */ }
  };
  // Chrome chết giữa chừng là chuyện có thật — hết bộ nhớ, bị OOM killer dọn. Nói ra lời trăng
  // trối của nó, vì không có dòng này thì chỗ gọi chỉ thấy "kết nối tới Chrome hỏng" và không
  // bao giờ biết vì sao.
  child.once('exit', (code, signal) => {
    if (!closed) console.error(`Chrome tắt (mã ${code}, tín hiệu ${signal}):\n${lastWords()}`);
    closed = true;
    chrome.close();
  });

  return { chrome, close, shot: (url, options) => shot(chrome, url, options) };
}

/**
 * Chụp một trang.
 *
 * Trả về `{ png, title, url, truncated }`, hoặc ném với một câu tiếng Việt nói vì sao không chụp
 * được. `png` là Buffer, đã vừa trần 2 MB của nền tảng.
 */
export async function shot(chrome, address, {
  width = WIDTH, height = HEIGHT, fullPage = false, pages = PAGES,
  loadMs = LOAD_MS, settleMs = SETTLE_MS,
  quietMs = QUIET_MS, leastMs = LEAST_MS, paintedMs = PAINTED_MS, blankMs = BLANK_MS,
  scrolledMs = SCROLLED_MS, aimBytes = AIM_BYTES, mostBytes = MOST_BYTES, vet = vetUrl,
} = {}) {
  const contextId = (await chrome.send('Target.createBrowserContext', { disposeOnDetach: false })).browserContextId;
  let targetId = null;
  const undo = [];

  try {
    targetId = (await chrome.send('Target.createTarget', {
      url: 'about:blank', browserContextId: contextId, width, height,
    })).targetId;
    const sessionId = (await chrome.send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
    const at = (method, params) => chrome.send(method, params, sessionId);

    /**
     * Cái cửa.
     *
     * Địa chỉ người ta gõ đã được xét trước khi tới đây — nhưng một trang công khai có thể
     * chuyển hướng về `127.0.0.1`, và một `<img src="http://192.168.1.1/admin">` thì không
     * chuyển hướng gì cả, nó chỉ vẽ trang quản trị của router vào đúng cái ảnh bot sắp gửi lên
     * nhóm. Nên xét **mọi request**, không phải mỗi request đầu: chuyển hướng cũng là một
     * request mới, và ảnh trong trang cũng vậy.
     *
     * Nhớ theo tên máy trong suốt một lần chụp, nên một trang trăm ảnh cùng CDN chỉ hỏi DNS một lần.
     */
    undo.push(chrome.on('Fetch.requestPaused', (params, from) => {
      if (from !== sessionId) return;
      const { requestId, request } = params;
      const deny = () => at('Fetch.failRequest', { requestId, errorReason: 'AccessDenied' }).catch(() => {});
      const allow = () => at('Fetch.continueRequest', { requestId }).catch(() => {});
      let key;
      try {
        const url = new URL(request.url);
        // `data:` và `blob:` không ra khỏi tiến trình, nên không có gì để chặn.
        if (url.protocol === 'data:' || url.protocol === 'blob:') return allow();
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return deny();
        key = `${url.protocol}//${url.host}`;
      } catch {
        return deny();
      }
      // Đã biết rồi thì trả lời **ngay trong lượt này**, không `await` gì cả. Đây là chỗ nóng
      // nhất trong cả file: một trang là hàng trăm request, và mỗi lần nhường lượt cho vòng lặp
      // sự kiện là một lần trang ấy đứng chờ. Đo được: để nó `await` một cách vô ích đẩy lượt
      // vẽ của `github.com` từ giây thứ 2 sang giây thứ 6.
      const known = verdicts.get(key);
      if (known === true) return allow();
      if (known === false) return deny();
      return asked(key, vet).then((ok) => (ok ? allow() : deny()));
    }));

    // `alert()` trong một trang lạ giữ cả tab lại cho tới khi có người bấm — mà ở đây không có ai.
    undo.push(chrome.on('Page.javascriptDialogOpening', (params, from) => {
      if (from === sessionId) at('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
    }));

    // Nhịp mạng: mỗi request mở ra, xong hoặc hỏng đều chạm vào đây. `untilQuiet` ở dưới chỉ đọc
    // một con số — lần cuối có gì đó xảy ra — nên nó không phải đếm request đang treo, và một
    // request không bao giờ về cũng không giữ được nó lại.
    const marks = { beat: 0, painted: 0 };
    for (const event of ['Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFinished', 'Network.loadingFailed', 'Network.webSocketCreated']) {
      undo.push(chrome.on(event, (params, from) => { if (from === sessionId) marks.beat = Date.now(); }));
    }
    undo.push(chrome.on('Page.lifecycleEvent', (params, from) => {
      if (from !== sessionId || marks.painted) return;
      if (params.name === 'firstContentfulPaint' || params.name === 'firstMeaningfulPaintCandidate') marks.painted = Date.now();
    }));

    await at('Page.enable');
    await at('Page.setLifecycleEventsEnabled', { enabled: true });
    await at('Runtime.enable');
    await at('Network.enable');
    await at('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    // Một link tới file .zip là một cú tải về, không phải một trang. Từ chối, để tab không treo.
    await at('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    await at('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height,
    });
    await at('Emulation.setUserAgentOverride', { userAgent: UA, acceptLanguage: 'vi-VN,vi;q=0.9,en;q=0.8' });
    // Đặt ở đây chứ không bằng cờ `--hide-scrollbars`, vì cờ chỉ đặt được cho Chrome do mình bật
    // — nối vào Chrome của người khác thì mọi ảnh dính một thanh cuộn xám bên phải.
    await at('Emulation.setScrollbarsHidden', { hidden: true }).catch(() => {});

    marks.beat = Date.now();
    const went = await at('Page.navigate', { url: address });
    if (went.errorText) throw new Error(reasonFor(went.errorText));

    const how = await untilReady(marks, {
      quietMs, leastMs, paintedMs, blankMs, loadMs,
      look: async () => {
        try {
          const answer = await at('Runtime.evaluate', { expression: LOOK, returnByValue: true, timeout: 1000 });
          return Number(answer?.result?.value ?? 0);
        } catch {
          // Không hỏi được thì coi như có: trang đang chuyển hướng, hoặc context vừa bị thay.
          // Nghiêng về chụp, vì đứng đợi mãi một câu trả lời không bao giờ tới là không trả lời.
          return 1;
        }
      },
    });
    if (how === 'trang-trong') console.warn(`${address}: trang vẫn trống sau ${blankMs}ms, chụp thế`);
    await wait(settleMs);

    const { title, url } = await whatItIs(at, address);

    // Cuộn xuống hết phần sắp chụp rồi mới chụp. Không cuộn thì nửa dưới tấm ảnh là một dãy ô
    // xám: ảnh trên gần như mọi trang bây giờ chỉ tải khi trôi vào tầm mắt, và "tầm mắt" của
    // trang là chỗ nó tưởng người ta đang nhìn — không phải vùng mình sắp chụp.
    const want = fullPage ? MOST_FULL_HEIGHT : height * pages;
    /**
     * Cuộn, rồi hỏi lại trang xem nó đã cao lên chưa.
     *
     * Trang **mọc ra sau khi mình tưởng nó xong**. Đo `theguardian.com`: ở giây thứ 7 cả tài
     * liệu vẫn cao đúng 800px — một khung — nên cuộn xuống 4800 là cuộn vào chỗ không có gì, và
     * ảnh chụp ra đúng một khung, lại còn là khung dở dang ở giữa trang. Tới quãng giây thứ 10
     * nó mới thành 9230px.
     *
     * Nên cuộn xong thì đo lại, và nếu trang đã cao lên thì đi thêm **một** lượt nữa. Một, chứ
     * không phải tới khi nào thôi: trang tự nạp bài khi cuộn thì lượt nào cũng thấy nó cao lên,
     * và bot sẽ cuộn theo nó tới hết đời.
     *
     * Dọn lớp che ở đầu mỗi lượt: lượt đầu để mở khoá cuộn trước khi cuộn, các lượt sau vì rất
     * nhiều banner chỉ hiện ra **sau khi** người ta cuộn được một đoạn.
     */
    let swept = 0;
    // Đo **trước** khi cuộn, không bắt đầu từ 0: bắt đầu từ 0 thì trang một khung cũng tính là
    // "đã cao lên", và mọi trang ngắn đều phải đi thừa cả một lượt cuộn nữa cho một chỗ không
    // có gì. `example.com` mất 4,9 giây cho đúng chuyện ấy.
    let reached = await docHeight(at);
    for (let pass = 0; pass < 2; pass += 1) {
      swept += await sweep(at);
      // Chỉ cuộn tới đáy trang **hiện có**. Cuộn xuống 4800 của một trang cao 800 là mười nấc
      // đi qua chỗ trống, mỗi nấc một vòng hỏi đáp qua socket.
      await scrollDown(at, marks, height, Math.min(want, Math.max(height, reached)));
      // Đợi ở **đáy**, không phải sau khi đã lên lại đầu trang: ảnh vừa được đánh thức thì phải
      // đứng đó cho chúng về.
      await untilStill(marks, { quietMs, mostMs: pass ? Math.round(scrolledMs / 2) : scrolledMs });
      const now = await docHeight(at);
      const grew = now > reached + height / 2;
      reached = Math.max(reached, now);
      if (!grew || reached >= want) break;
    }
    swept += await sweep(at);
    await scrollHome(at);
    await wait(settleMs);
    if (swept) console.log(`${address}: ẩn ${swept} lớp che`);

    const metrics = await at('Page.getLayoutMetrics');
    const size = metrics.cssContentSize ?? metrics.contentSize ?? { width, height };
    const tall = Math.max(height, Math.ceil(size.height), reached);
    // Trang ngắn hơn phần muốn chụp thì chụp đúng nó, không đệm thêm một khoảng trắng. Một tấm
    // ảnh có nửa dưới trắng trơn trông y như trang bị lỗi.
    const clip = { x: 0, y: 0, width, height: Math.min(tall, want), scale: 1 };
    // Chỉ nói "cắt" cho `/anh dai`: ai xin cả trang mà không được cả trang thì cần biết. Còn ảnh
    // hai màn hình thì vốn là xem trước, và ghi "còn nữa" dưới mỗi tấm là một dòng thừa mỗi lần.
    const truncated = fullPage && tall > MOST_FULL_HEIGHT;

    const { png, scale } = await fit(at, clip, {
      aim: aimBytes, most: mostBytes, beyond: clip.height > height,
    });
    return { png, title, url, truncated, scale, height: clip.height };
  } finally {
    for (const off of undo) off();
    if (targetId) await chrome.send('Target.closeTarget', { targetId }).catch(() => {});
    await chrome.send('Target.disposeBrowserContext', { browserContextId: contextId }).catch(() => {});
  }
}

/**
 * Phán quyết cho từng tên máy, dùng chung cho mọi lần chụp.
 *
 * Một CDN phục vụ trăm cái ảnh trong một trang, và mười trang sau vẫn cái CDN ấy — hỏi DNS lại
 * từ đầu mỗi lần là trả tiền cho một câu trả lời mình đã có. Nhớ có hạn, vì một cái tên đổi
 * được chỗ trỏ: sau `VERDICT_MS` thì hỏi lại.
 */
const VERDICT_MS = 5 * 60 * 1000;
const verdicts = new Map();
const asking = new Map();

function asked(key, vet) {
  if (asking.has(key)) return asking.get(key);
  const answer = vet(`${key}/`)
    .then((one) => Boolean(one.ok))
    .catch(() => false)
    .then((ok) => {
      verdicts.set(key, ok);
      asking.delete(key);
      setTimeout(() => verdicts.delete(key), VERDICT_MS).unref?.();
      return ok;
    });
  asking.set(key, answer);
  return answer;
}

/**
 * Đợi tới lúc chụp được: mạng lặng, hoặc đã vẽ ra chữ và chờ đủ, hoặc hết giờ.
 *
 * Nhìn đồng hồ mỗi 100ms chứ không cài hẹn giờ theo từng sự kiện: một trang gọi ba trăm request
 * là ba trăm lần huỷ và đặt lại một cái timer, để rồi cũng chỉ đọc ra đúng hai con số này.
 *
 * Tách khỏi `shot` và nhận vào một cái hộp hai con số, nên nó chạy được trong test mà không cần
 * Chrome — đây là chỗ hay sai nhất trong cả file, và một luật không gọi được là một luật không
 * thử được.
 */
export async function untilReady(marks, {
  quietMs = QUIET_MS, leastMs = LEAST_MS, paintedMs = PAINTED_MS, blankMs = BLANK_MS,
  loadMs = LOAD_MS, tick = 150, now = () => Date.now(), pause = wait, look = async () => 1,
} = {}) {
  const began = now();
  let sure = 0;
  for (;;) {
    const at = now();
    const waited = at - began;
    if (waited >= loadMs) return 'het-gio';
    // Âm là "trang chưa đọc xong", không là "đọc xong rồi mà chẳng có gì", dương là có nội dung.
    const seen = await look();
    sure = seen > 0 ? sure + 1 : 0;
    const full = sure >= SURE;
    const quiet = waited >= leastMs && at - marks.beat >= quietMs;
    if (full && marks.painted && at - marks.painted >= paintedMs) return 've-xong';
    if (full && quiet) return 'lang';
    // Chỉ chịu chụp một trang trống khi nó **đã đọc xong** và vẫn trống. Còn đang đọc thì đợi
    // tới trần: chậm không phải là trống, và chụp cái chậm ra đúng một tấm ảnh trắng.
    if (!full && seen === 0 && quiet && waited >= blankMs) return 'trang-trong';
    await pause(tick);
  }
}

/**
 * Đợi mạng lặng lại sau khi cuộn.
 *
 * Giống `untilReady` nhưng không hỏi gì trang cả: tới đây thì đã biết trang có nội dung, thứ
 * duy nhất còn chờ là mấy tấm ảnh vừa bị đánh thức. Trần ngắn hơn hẳn, vì một trang tự làm mình
 * bận mãi thì cũng không vì thế mà có thêm tấm ảnh nào.
 */
export async function untilStill(marks, {
  quietMs = QUIET_MS, mostMs = SCROLLED_MS, tick = 100, now = () => Date.now(), pause = wait,
} = {}) {
  const began = now();
  for (;;) {
    const at = now();
    if (at - began >= mostMs) return 'het-gio';
    if (at - marks.beat >= quietMs) return 'lang';
    await pause(tick);
  }
}

/**
 * Dọn những lớp nổi che mất nội dung.
 *
 * Banner "chấp nhận cookie" dính đáy màn hình là thứ hỏng nặng nhất với một tấm ảnh bốn màn
 * hình: nó nằm nguyên ở đáy khung chụp và ăn mất cả một dải ngang, và với trang khoá cuộn sau
 * cái banner ấy thì ảnh chỉ còn mỗi nó.
 *
 * Cách hiển nhiên là chụp 80% mỗi màn hình rồi ghép — nhưng thế là bỏ đi 640px nội dung **thật**
 * trên bốn màn hình, mỗi lần chụp, kể cả những trang chẳng có banner nào; mà banner cao hơn 20%
 * thì vẫn lọt vào. Chữa cái nhìn thấy chứ không chữa cái gây ra.
 *
 * Nên dọn thẳng: mọi thứ `fixed` hay `sticky` mà **dính đáy** hoặc **phủ hơn một phần ba khung**
 * đều bị ẩn. Hai luật ấy bắt đúng banner cookie, lớp phủ mờ, hộp thoại đăng ký nhận tin, nút
 * chat góc phải và nút "lên đầu trang" — còn thanh điều hướng dính đỉnh thì giữ, vì nó là một
 * phần của trang và trong ảnh nó chỉ hiện một lần ở trên cùng.
 *
 * **Ẩn chứ không bấm "Đồng ý".** Bấm hộ người khác một nút đồng ý là quyết định thay họ một
 * chuyện không phải của mình — mà nút ấy mỗi trang một chữ, mỗi nước một luật.
 *
 * Và mở lại cuộn: trang có hộp thoại thường khoá `overflow` của `body`, nên không mở lại thì
 * phần dưới không bao giờ cuộn tới được, ảnh bốn màn hình thành bốn lần màn hình đầu.
 */
const SWEEP = `(() => {
  const w = innerWidth, h = innerHeight;
  let gone = 0;
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    // Chỉ \`fixed\`. \`sticky\` từng nằm trong đây và nó dọn nhầm ngay: theguardian.com gói nội
    // dung trong những khối \`sticky\` rộng cả trang, nên luật "phủ hơn một phần ba khung" ăn
    // luôn cả khối ảnh — ảnh chụp ra bố cục đầy đủ mà mọi ô ảnh đều trắng, 286 KB thay vì 880.
    // Một banner dính đáy sót lại thì chỉ xấu; xoá nhầm nội dung thì là nói dối về trang ấy.
    if (style.position !== 'fixed') continue;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    const box = el.getBoundingClientRect();
    if (box.width < 40 || box.height < 24) continue;
    // Một dải ngang dính đáy: banner cookie, thanh "tải app", khay quảng cáo.
    const bar = box.bottom >= h - 4 && box.top > h * 0.35 && box.width > w * 0.5;
    // Một lớp phủ gần kín khung: hộp thoại cookie, tường đăng ký, nền mờ sau nó.
    const overlay = box.width >= w * 0.6 && box.height >= h * 0.5;
    if (!bar && !overlay) continue;
    el.style.setProperty('display', 'none', 'important');
    gone += 1;
  }
  for (const el of [document.documentElement, document.body]) {
    if (el && getComputedStyle(el).overflow === 'hidden') el.style.setProperty('overflow', 'visible', 'important');
  }
  return gone;
})()`;

async function sweep(at) {
  const answer = await at('Runtime.evaluate', { expression: SWEEP, returnByValue: true, timeout: 3000 })
    .catch(() => null);
  return Number(answer?.result?.value ?? 0);
}

/**
 * Cuộn xuống hết phần sắp chụp.
 *
 * Nửa khung một nấc, dừng lại ở mỗi nấc — không phải một khung một nấc, và không phải nhảy
 * thẳng xuống đáy. Trang quyết định tải ảnh nào bằng cách xem cái gì đang trôi qua tầm mắt, nên
 * nấc càng thưa và càng vội thì càng nhiều thứ không bao giờ đi qua đó. Đo trên bốn màn hình
 * `theguardian.com`: một khung một nấc, dừng 150ms — **8 trên 112 ảnh** tải xong; nửa khung một
 * nấc, dừng lâu hơn — **22**.
 *
 * Dừng bao lâu thì **nghe mạng mà dừng**, không đếm giây: mỗi nấc chờ tới khi mạng im được một
 * nhịp ngắn, nhiều nhất `dwellMs`. Trang nhẹ đi hết mười hai nấc trong hơn một giây, trang nặng
 * được đúng chừng nó cần. Đếm giây cố định thì trang nào cũng trả cùng một cái giá, mà cái giá
 * ấy phải đặt theo trang chậm nhất.
 *
 * Không tự về đầu trang ở cuối: chỗ gọi còn phải đứng ở đáy đợi mấy tấm ảnh vừa đánh thức về
 * đã, rồi mới lên. Về sớm là hỏi xong rồi bỏ đi trước khi nghe trả lời.
 */
async function scrollDown(at, marks, step, want, { dwellMs = DWELL_MS } = {}) {
  const nudge = Math.max(200, Math.round(step / 2));
  for (let y = nudge; y <= want; y += nudge) {
    await at('Runtime.evaluate', { expression: `window.scrollTo(0, ${y})`, timeout: 2000 }).catch(() => {});
    await untilStill(marks, { quietMs: 120, mostMs: dwellMs, tick: 60 });
  }
}

/// Chiều cao thật của trang **lúc này**. Hỏi lại được, vì nó đổi — xem chỗ gọi trong `shot`.
async function docHeight(at) {
  const answer = await at('Runtime.evaluate', {
    expression: 'Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)',
    returnByValue: true,
    timeout: 2000,
  }).catch(() => null);
  return Number(answer?.result?.value ?? 0);
}

/// Về đầu trang, vì đó là chỗ tấm ảnh bắt đầu.
async function scrollHome(at) {
  await at('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)', timeout: 2000 }).catch(() => {});
}

/**
 * Đo một khung, rồi chụp đúng một lần ở tỉ lệ tính ra.
 *
 * Không chụp ở tỉ lệ 1 rồi xem có nặng quá không: với sáu màn hình thì chính tấm ảnh thử ấy là
 * thứ làm đứt kết nối (xem `SAFE_BYTES`). Nên đo trên một khung — nhỏ, chắc chắn qua lọt — để
 * biết trang này tốn bao nhiêu byte mỗi điểm ảnh, rồi nhân lên cho cả vùng sắp chụp.
 *
 * Số byte của PNG đi gần như tuyến tính theo số điểm ảnh, mà số điểm ảnh đi theo bình phương tỉ
 * lệ — nên tỉ lệ cần là căn bậc hai của tỉ lệ byte. Một trang chữ ra tỉ lệ 1 và không bị đụng
 * tới; một trang đầy ảnh ra 0,5, và đó cũng đúng là loại trang mà thu nhỏ ít mất mát nhất.
 *
 * Đo rồi vẫn kiểm: ước lượng từ khung đầu có thể trật, vì khung đầu là banner với thanh điều
 * hướng chứ chưa phải phần ảnh ở dưới. Trật thì sửa một lần nữa bằng chính số thật.
 */
export async function fit(at, clip, {
  aim = AIM_BYTES, most = MOST_BYTES, safe = SAFE_BYTES, beyond = false, least = LEAST_SCALE,
} = {}) {
  const snap = async (height, scale) => {
    const answer = await at('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: Boolean(beyond),
      clip: { ...clip, height, scale },
      optimizeForSpeed: false,
    });
    return Buffer.from(answer.data, 'base64');
  };

  // Một khung là 1,02 triệu điểm ảnh — kể cả trang nhiễu nhất cũng chỉ ra chừng 3 MB, còn trong
  // tầm cái socket chịu được.
  const probeHeight = Math.min(clip.height, HEIGHT);
  const probe = await snap(probeHeight, 1);
  if (probeHeight === clip.height && probe.byteLength <= aim) return { png: probe, scale: 1 };

  const perPixel = probe.byteLength / (clip.width * probeHeight);
  const whole = Math.max(1, perPixel * clip.width * clip.height);
  let scale = Math.min(1, Math.sqrt(aim / whole));
  // Sàn cho dễ đọc, rồi trần cho an toàn — theo thứ tự ấy, vì an toàn thắng dễ đọc.
  scale = Math.max(least, scale);
  scale = Math.min(scale, Math.sqrt(safe / whole));

  let made = { png: await snap(clip.height, scale), scale };
  if (made.png.byteLength <= most) {
    if (made.png.byteLength <= aim) return made;
    // Ước lượng trật về phía nặng. Sửa bằng số thật, đúng một lần nữa.
    const next = Math.max(least * 0.7, scale * Math.sqrt(aim / made.png.byteLength));
    if (next < scale - 0.04) made = { png: await snap(clip.height, next), scale: next };
    if (made.png.byteLength <= most) return made;
  }

  const rescue = Math.max(0.25, made.scale * Math.sqrt(most / made.png.byteLength) * 0.9);
  made = { png: await snap(clip.height, rescue), scale: rescue };
  if (made.png.byteLength <= most) return made;
  throw new Error(`ảnh quá nặng (${Math.round(made.png.byteLength / 1024)} KB) dù đã thu nhỏ hết cỡ`);
}

/// Tiêu đề và địa chỉ cuối, trong **một** lượt hỏi. Hai lượt là hai vòng qua socket để lấy hai
/// chuỗi mà trang nào cũng có sẵn cả hai.
async function whatItIs(at, fallback) {
  try {
    const answer = await at('Runtime.evaluate', {
      expression: 'JSON.stringify({ title: document.title || location.host, url: location.href })',
      returnByValue: true,
      timeout: 2000,
    });
    const found = JSON.parse(String(answer?.result?.value ?? '{}'));
    return {
      title: String(found.title ?? '').trim().slice(0, 160),
      url: String(found.url || fallback),
    };
  } catch {
    return { title: '', url: fallback };
  }
}

/// Mã lỗi mạng của Chrome, dịch sang câu người đọc được. Cái còn lại thì đưa nguyên, vì đoán sai
/// nguyên nhân còn tệ hơn là nói ra đúng chữ Chrome đã nói.
export function reasonFor(errorText) {
  const table = {
    'net::ERR_NAME_NOT_RESOLVED': 'không tìm thấy máy chủ',
    'net::ERR_CONNECTION_REFUSED': 'máy chủ từ chối kết nối',
    'net::ERR_CONNECTION_TIMED_OUT': 'máy chủ không trả lời',
    'net::ERR_CONNECTION_CLOSED': 'kết nối bị ngắt giữa chừng',
    'net::ERR_CERT_AUTHORITY_INVALID': 'chứng chỉ HTTPS không hợp lệ',
    'net::ERR_CERT_COMMON_NAME_INVALID': 'chứng chỉ HTTPS không khớp tên miền',
    'net::ERR_CERT_DATE_INVALID': 'chứng chỉ HTTPS đã hết hạn',
    'net::ERR_SSL_PROTOCOL_ERROR': 'lỗi HTTPS',
    'net::ERR_TOO_MANY_REDIRECTS': 'trang chuyển hướng vòng quanh',
    'net::ERR_BLOCKED_BY_CLIENT': 'địa chỉ bị chặn',
    'net::ERR_ABORTED': 'trang không mở được',
    'net::ERR_ADDRESS_UNREACHABLE': 'không tới được địa chỉ',
  };
  return table[errorText] ?? `không mở được trang (${errorText})`;
}
