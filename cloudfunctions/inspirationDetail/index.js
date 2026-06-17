// cloudfunctions/inspirationDetail/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '未获取到用户身份' }
  }

  const { localId } = event
  if (!localId) {
    return { code: -1, message: '缺少 localId 参数' }
  }

  try {
    const res = await db.collection('inspirations')
      .where({ _openid: openid, localId })
      .get()

    if (res.data.length === 0) {
      return { code: -1, message: '灵感不存在' }
    }

    return { code: 0, data: { item: res.data[0] } }
  } catch (err) {
    console.error('inspirationDetail error:', err)
    return { code: -1, message: '查询失败：' + err.message }
  }
}
