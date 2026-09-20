# Con bot, đóng gói.
#
#   docker run -d --name bachhoabot --restart unless-stopped \
#     -e ZEPLAO_BOT_TOKEN=<token> \
#     -v bachhoabot-data:/app/data \
#     git.potatolabs.uk/zeplao/zeplao-bot-bachhoatonghop
#
# Không có bước cài đặt nào, vì repo này không phụ thuộc gói npm nào cả: không `npm install`,
# không `node_modules`, không lockfile để mà lệch. Cả image là Node, Chromium và năm file.
FROM node:22-alpine

# Chromium từ kho của Alpine, không tải Chrome về lúc cài gói. Hai thứ khác nhau ở chỗ ai vá nó:
# một cái đi theo bản vá bảo mật của distro, cái kia đi theo phiên bản ghim trong một lockfile.
# Con bot này mở trang của người lạ suốt ngày, nên nó cần cái thứ nhất.
#
# Font **không phải** thứ thêm cho đẹp. Thiếu chúng thì mọi trang tiếng Việt chụp ra một rừng ô
# vuông, và bot vẫn báo là chụp thành công — kiểu hỏng tệ nhất, vì nhìn từ log thì không thấy gì.
RUN apk add --no-cache \
      chromium \
      font-noto \
      font-noto-cjk \
      font-noto-emoji \
      ttf-freefont \
      ca-certificates

WORKDIR /app

# Chỉ những thứ chạy. Bộ test không lên image — nó chạy ở CI, nơi hỏng thì người ta đọc được.
COPY package.json bachhoabot.mjs ./
COPY web ./web

ENV CHROME_PATH=/usr/bin/chromium
# Trong container Chromium không dựng được sandbox của nó nếu không có `SYS_ADMIN`, và /dev/shm
# mặc định 64 MB thì không đủ cho một trang nặng. Đây là chỗ **duy nhất** bật hai cờ ấy: trên máy
# thường chúng là bỏ đi lớp cuối cùng đứng giữa một trang lạ và cái máy đang chạy bot.
ENV CHROME_NO_SANDBOX=1
ENV BACHHOA_STATE=/app/data/state.json
# Chromium ghi vào `$HOME` dù đã có `--user-data-dir`. Không đặt thì nó thử ghi vào `/` và chết
# với một dòng lỗi không nhắc gì tới `HOME`.
ENV HOME=/tmp

# Chỗ ghi trạng thái, và là thứ duy nhất bot ghi dưới `/app`. Tạo sẵn và trao cho `node` ở đây,
# vì một tiến trình không phải root thì không tự tạo được thư mục dưới `/app` do root sở hữu — và
# cái hỏng ấy chỉ lộ ra ở dòng log đầu tiên sau khi container đã chạy được vài giây.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME /app/data

# Chạy dưới người dùng `node` có sẵn trong image, không phải root. Một con bot là mã nói chuyện
# với internet suốt ngày — và con bot này còn **chạy mã của trang lạ** trong một Chromium ngay
# cạnh đó. Ngày nó bị lợi dụng thì cái quyền không cần ấy là thứ duy nhất đứng giữa.
USER node

# Không có `npm start` ở giữa. `npm` là một tiến trình nữa đứng chắn giữa systemd và bot: nó nhận
# SIGTERM rồi quyết định làm gì với nó, mà thứ bot cần là tín hiệu ấy đến thẳng chỗ có người đợi
# nó — chỗ đóng Chromium lại trước khi tiến trình biến mất.
CMD ["node", "bachhoabot.mjs"]
