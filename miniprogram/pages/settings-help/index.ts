import { diagnostics } from "../../utils/support";
import { showError } from "../../utils/api";

Page({
  data: {
    info: diagnostics(),
    faqs: [
      {
        q: "哪些功能可以离线使用？",
        a: "已登录并完成迁移的账号，可在本机管理联系人、关系、分类和统计。首次登录、AI 整理、同步公开资料、获取或重置导入码需要后端。",
      },
      {
        q: "换手机后怎么找回资料？",
        a: "先在原手机导出加密备份并另存，再用同一微信账号在新手机恢复。服务器不保存新录入的联系人，忘记备份密码无法恢复。",
      },
      {
        q: "无法连接后端怎么办？",
        a: "开发真机需与电脑网络互通，手机不能连接电脑的 127.0.0.1。确认后端已启动且开发版地址正确。体验版和正式版需配置实际 HTTPS 地址。",
      },
      {
        q: "关闭公开资料后，别人导入的副本会删除吗？",
        a: "不会。关闭公开昵称会撤销后续导入；已经被他人保存的副本需由对方处理。重置导入码也不会删除已有副本。",
      },
      {
        q: "退出和注销有什么不同？",
        a: "退出保留本机资料。退出所有设备仅撤销服务器登录令牌，其他手机离线资料仍在。注销会删除服务器账号资料，并在确认后清理当前手机该账号数据。",
      },
      {
        q: "头像或地图权限被拒绝怎么办？",
        a: "可打开微信权限管理查看已申请的权限。部分隐私授权需在下次实际操作时重新确认，权限管理不会替你配置后端密钥。",
      },
    ],
  },
  onShow() {
    this.setData({ info: diagnostics() });
  },
  copyDiagnostics() {
    wx.setClipboardData({
      data: diagnostics().text,
      success: () => wx.showToast({ title: "诊断信息已复制", icon: "success" }),
      fail: () => showError(new Error("复制失败，请重试")),
    });
  },
  openPermissions() {
    wx.openSetting({
      fail: () => showError(new Error("无法打开微信权限管理，请稍后重试")),
    });
  },
});
