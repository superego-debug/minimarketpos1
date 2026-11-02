# Chợ Nhỏ POS

Ứng dụng quản lý siêu thị mini và hóa đơn bán lẻ. Giao diện chạy trên GitHub Pages; các thao tác nghiệp vụ (sản phẩm, tồn kho, giỏ hàng, tính tiền, thuế và thanh toán) được viết bằng C và biên dịch thành WebAssembly khi deploy.

## Deploy lên GitHub Pages

1. Tải toàn bộ thư mục `mini-market-pos` và đẩy nội dung của nó lên một repository GitHub.
2. Trong repository, mở **Settings → Pages** và chọn **GitHub Actions** làm nguồn triển khai.
3. Vào tab **Actions**, chạy workflow **Deploy POS to GitHub Pages** (hoặc đẩy commit mới). Workflow sẽ cài Emscripten, biên dịch `src/pos.c` sang WebAssembly và triển khai ứng dụng.
4. Mở URL Pages được GitHub cấp sau khi workflow chạy thành công.

Workflow `.github/workflows/pages.yml` tự build và deploy khi có push lên nhánh `main` hoặc chạy thủ công. Dữ liệu sản phẩm và hóa đơn được lưu trong trình duyệt bằng `localStorage`; bản demo không cần máy chủ hoặc cơ sở dữ liệu.

## Chạy và kiểm tra trên máy

- Mở `web/index.html` qua một web server tĩnh sau khi đã tạo `web/pos.js` và `web/pos.wasm`.
- Cài Emscripten, sau đó chạy lệnh build trong workflow (workflow tạo `dist/`; khi chạy tại máy, đổi thư mục đầu ra sang `web/`).
- Kiểm tra logic C độc lập bằng `clang -std=c11 -Wall -Wextra -Werror -DPOS_TEST src/pos.c -o /tmp/pos-test && /tmp/pos-test`.

## Cấu trúc

- `src/pos.c` — lõi quản lý hàng hóa, tồn kho, giỏ hàng, VAT và checkout.
- `web/` — giao diện HTML/CSS/JS và dữ liệu lưu cục bộ.
- `.github/workflows/pages.yml` — tự động biên dịch C → WebAssembly và deploy GitHub Pages.

## Lưu ý

Đây là ứng dụng demo một máy/một trình duyệt, phù hợp học tập và trình diễn. Dữ liệu nằm trên thiết bị hiện tại; xóa dữ liệu trình duyệt sẽ xóa danh mục và hóa đơn đã lưu. Không dùng cho thanh toán thực tế hoặc nhiều quầy đồng bộ khi chưa có backend, xác thực người dùng, sao lưu và kiểm soát giao dịch phía máy chủ.
