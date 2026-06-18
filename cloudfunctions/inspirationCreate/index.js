// cloudfunctions/inspirationCreate/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '未获取到用户身份' }
  }

  const { localId, content, tags, timeSlot, source, voiceFileId, projectId } = event
  if (!localId || !content) {
    return { code: -1, message: '缺少必要参数' }
  }

  // 内容安全检测
  try {
    if (content && content.trim()) {
      await cloud.openapi.security.msgSecCheck({ content: content.trim().slice(0, 2000) })
    }
  } catch (e) {
    if (e.errCode === 87014) {
      return { code: -1, message: '内容未通过安全检测，请修改后重试' }
    }
    console.warn('msgSecCheck 调用失败:', e.message)
  }

  try {
    const now = new Date().toISOString()
    const item = {
      _openid: openid,
      localId,
      content,
      tags: tags || [],
      timeSlot: timeSlot || '',
      supplement: '',
      source: source || 'text',
      voiceFileId: voiceFileId || '',
      dateTag: now.split('T')[0],
      version: 1,
      isDeleted: false,
      projectId: projectId || '',
      createdAt: now,
      updatedAt: now
    }

    const addRes = await db.collection('inspirations').add({ data: item })
    return { code: 0, data: { ...item, _id: addRes._id } }
  } catch (err) {
    console.error('inspirationCreate error:', err)
    return { code: -1, message: '创建失败：' + err.message }
  }
}
