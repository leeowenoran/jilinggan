// cloudfunctions/inspirationSupplement/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '未获取到用户身份' }
  }

  const { localId, supplement } = event
  if (!localId) {
    return { code: -1, message: '缺少 localId 参数' }
  }
  if (supplement === undefined || supplement === null) {
    return { code: -1, message: '缺少 supplement 参数' }
  }

  try {
    const res = await db.collection('inspirations')
      .where({ _openid: openid, localId })
      .get()

    if (res.data.length === 0) {
      return { code: -1, message: '灵感不存在' }
    }

    const item = res.data[0]
    const newVersion = (item.version || 1) + 1
    const now = new Date().toISOString()

    await db.collection('inspirations')
      .doc(item._id)
      .update({
        data: {
          supplement,
          version: newVersion,
          updatedAt: now
        }
      })

    return {
      code: 0,
      data: {
        ...item,
        supplement,
        version: newVersion,
        updatedAt: now
      }
    }
  } catch (err) {
    console.error('inspirationSupplement error:', err)
    return { code: -1, message: '补充失败：' + err.message }
  }
}
