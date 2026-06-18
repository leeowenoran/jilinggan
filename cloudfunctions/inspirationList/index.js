// cloudfunctions/inspirationList/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_LIMIT = 100

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '未获取到用户身份' }
  }

  const page = event.page || 1
  const pageSize = Math.min(event.pageSize || 20, MAX_LIMIT)

  try {
    const countRes = await db.collection('inspirations')
      .where({ _openid: openid, isDeleted: false })
      .count()

    const res = await db.collection('inspirations')
      .where({ _openid: openid, isDeleted: false })
      .orderBy('updatedAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    return {
      code: 0,
      data: {
        list: res.data,
        total: countRes.total,
        page,
        pageSize,
        hasMore: page * pageSize < countRes.total
      }
    }
  } catch (err) {
    console.error('inspirationList error:', err)
    return { code: -1, message: '查询失败：' + err.message }
  }
}
