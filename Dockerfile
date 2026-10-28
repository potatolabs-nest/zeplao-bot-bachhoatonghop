# Con bot, đóng gói. **Không có trình duyệt trong này** — xem bên dưới.
#
#   docker compose up -d          (bot + Chrome, xem compose.yaml)
#
# hoặc tự dựng hai container:
#
#   docker run -d --name chrome --network bot zenika/alpine-chrome \
#     --no-sandbox --remote-debugging-address=0.0.0.0 --remote-debugging-port=9222
#   docker run -d --name bachhoabot --network bot --restart unless-stopped \
#     -e ZEPLAO_BOT_TOKEN=<token> -e CHROME_URL=http://chrome:9222 \
#     -v bachhoabot-data:/app/data \
#     git.potatolabs.uk/zeplao/zeplao-bot-bachhoatonghop
#
# Vì sao Chrome không nằm trong image này, dù một container là gọn hơn hai:
#
# Đo trên Alpine — `apk add chromium` một mình là **709,5 MiB**, cả image với font là 828 MiB. Máy
# dựng image hết chỗ đúng ở dòng cuối cùng của `apk add`, sau khi đã tải về và cài xong hết, nên
# nó tốn trọn năm mươi giây rồi mới hỏng. Cắt font xuống bộ tối thiểu chỉ tiết kiệm 94 MiB: cái
# sàn 709 MiB là chính Chromium, và không có cách nào làm một trình duyệt nhỏ đi.
#
# Tách ra thì image này về lại đúng cỡ của một con bot — Node và năm file — và dựng trong vài
# giây. Chrome thành một container ai cũng có sẵn, dùng chung được cho nhiều bot, và nâng cấp
# riêng khỏi bot. Cái giá là home-ops phải biết tới hai container thay vì một.
FROM node:26-alpine

WORKDIR /app

# Chỉ những thứ chạy. Bộ test không lên image — nó chạy ở CI, nơi hỏng thì người ta đọc được.
COPY package.json bachhoabot.mjs ./
COPY web ./web

ENV BACHHOA_STATE=/app/data/state.json

# Chỗ ghi trạng thái, và là thứ duy nhất bot ghi. Tạo sẵn và trao cho `node` ở đây, vì một tiến
# trình không phải root thì không tự tạo được thư mục dưới `/app` do root sở hữu — và cái hỏng ấy
# chỉ lộ ra ở dòng log đầu tiên sau khi container đã chạy được vài giây.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME /app/data

# Chạy dưới người dùng `node` có sẵn trong image, không phải root. Một con bot là mã nói chuyện
# với internet suốt ngày; nó không có việc gì cần tới root, và ngày nó bị lợi dụng thì cái không
# cần ấy là thứ duy nhất đứng giữa.
USER node

# Không có `npm start` ở giữa. `npm` là một tiến trình nữa đứng chắn giữa systemd và bot: nó nhận
# SIGTERM rồi quyết định làm gì với nó, mà thứ bot cần là tín hiệu ấy đến thẳng chỗ có người đợi.
CMD ["node", "bachhoabot.mjs"]
