// cloudfunctions/checkImage/index.js
// 图片安全检测 — 供前端调用
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { fileID } = event
  if (!fileID) {
    return { code: 0, safe: true }
  }

  try {
    // 方式一：直接传入云文件 ID（推荐）
    await cloud.openapi.security.imgSecCheck({
      fileID: fileID
    })
    return { code: 0, safe: true }
  } catch (e) {
    if (e.errCode === 87014) {
      return { code: 0, safe: false, reason: '图片未通过安全检测' }
    }
    // 非内容违规错误（如权限未开通）不阻断
    console.warn('imgSecCheck 调用失败:', e.message)
    return { code: 0, safe: true, warn: e.message }
  }
}
