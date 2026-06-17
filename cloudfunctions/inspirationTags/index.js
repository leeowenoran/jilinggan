// cloudfunctions/inspirationTags/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '未获取到用户身份' }
  }

  try {
    const res = await db.collection('inspirations')
      .where({ _openid: openid, isDeleted: false })
      .field({ tags: true })
      .limit(100)
      .get()

    // 聚合所有标签并去重计数
    const tagMap = {}
    res.data.forEach(item => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach(tag => {
          tagMap[tag] = (tagMap[tag] || 0) + 1
        })
      }
    })

    const tags = Object.entries(tagMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return { code: 0, data: { tags } }
  } catch (err) {
    console.error('inspirationTags error:', err)
    return { code: -1, message: '获取标签失败：' + err.message }
  }
}
