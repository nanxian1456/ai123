// 后端服务地址配置 —— 唯一需要修改的地方
//
// 真机调试 / 手机预览时必须使用【电脑的局域网 IP】，不能使用 127.0.0.1
// （手机上 127.0.0.1 指向手机自己，会连不上电脑的后端）
//
// 查看电脑 IP：命令行执行 ipconfig，取「IPv4 地址」
// 电脑切换 WiFi 或重启路由器后 IP 可能变化，届时只需修改下面的 HOST
//
// 注意：运行时实际执行的是同目录下的 config.js，修改时请保持两者一致
export const HOST = "10.163.181.52:8081";
export const BASE_URL = `http://${HOST}/api`;
export const VIDEO_URL = `http://${HOST}/videos/background.mp4`;
