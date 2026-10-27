export async function prepareAvatar(path: string): Promise<string> {
  if (!path || /^https?:/i.test(path)) throw new Error("请选择本机头像图片");
  if (typeof wx.compressImage !== "function") throw new Error("当前微信版本不支持头像压缩，请更新后重试");
  const info = await new Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult>((resolve, reject) =>
    wx.getImageInfo({ src: path, success: resolve, fail: () => reject(new Error("头像图片无法读取，请重新选择")) }));
  if (!(info.width > 0 && info.height > 0)) throw new Error("头像尺寸无效");
  const scale = Math.min(1, 512 / Math.max(info.width, info.height));
  const result = await new Promise<WechatMiniprogram.CompressImageSuccessCallbackResult>((resolve, reject) =>
    wx.compressImage({ src: path, quality: 80, compressedWidth: Math.max(1, Math.round(info.width * scale)),
      compressedHeight: Math.max(1, Math.round(info.height * scale)), success: resolve, fail: () => reject(new Error("头像压缩失败，请重新选择")) }));
  const file = await new Promise<WechatMiniprogram.GetFileInfoSuccessCallbackResult>((resolve, reject) =>
    wx.getFileSystemManager().getFileInfo({ filePath: result.tempFilePath, success: resolve, fail: () => reject(new Error("头像文件无法检查，请重试")) }));
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("请选择压缩后不超过 5MB 的头像");
  return result.tempFilePath;
}
