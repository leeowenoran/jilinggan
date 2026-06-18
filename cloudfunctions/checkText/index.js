// cloudfunctions/checkText/index.js
// 文本安全检测 — 供前端实时调用
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { content } = event
  if (!content || !content.trim()) {
    return { code: 0, safe: true }
  }

  try {
    await cloud.openapi.security.msgSecCheck({
      content: content.trim().slice(0, 2000)
    })
    return { code: 0, safe: true }
  } catch (e) {
    if (e.errCode === 87014) {
      return { code: 0, safe: false, reason: '内容未通过安全检测' }
    }
    // 非内容违规错误（如权限未开通）不阻断
    console.warn('msgSecCheck 调用失败:', e.message)
    return { code: 0, safe: true, warn: e.message }
  }
}
