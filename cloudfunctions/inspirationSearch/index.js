// cloudfunctions/inspirationSearch/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const MAX_LIMIT = 100

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '未获取到用户身份' }
  }

  const { keyword, tag, page = 1, pageSize = 20 } = event

  try {
    let condition = { _openid: openid, isDeleted: false }

    if (keyword) {
      // 微信云数据库不支持全文检索，使用正则匹配
      condition.content = db.RegExp({
        regexp: keyword,
        options: 'i'
      })
    }

    if (tag) {
      condition.tags = _.in([tag])
    }

    const countRes = await db.collection('inspirations').where(condition).count()

    const res = await db.collection('inspirations')
      .where(condition)
      .orderBy('updatedAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(Math.min(pageSize, MAX_LIMIT))
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
    // 正则查询可能因索引问题失败，降级为全量拉取后本地过滤
    if (keyword && err.errCode === -501001) {
      try {
        const allRes = await db.collection('inspirations')
          .where({ _openid: openid, isDeleted: false })
          .orderBy('updatedAt', 'desc')
          .limit(MAX_LIMIT)
          .get()

        const kw = keyword.toLowerCase()
        let filtered = allRes.data.filter(item =>
          item.content && item.content.toLowerCase().includes(kw)
        )
        if (tag) {
          filtered = filtered.filter(item =>
            item.tags && item.tags.includes(tag)
          )
        }

        const total = filtered.length
        const start = (page - 1) * pageSize
        const list = filtered.slice(start, start + pageSize)

        return {
          code: 0,
          data: {
            list,
            total,
            page,
            pageSize,
            hasMore: start + pageSize < total
          }
        }
      } catch (fallbackErr) {
        console.error('inspirationSearch fallback error:', fallbackErr)
        return { code: -1, message: '搜索失败：' + fallbackErr.message }
      }
    }

    console.error('inspirationSearch error:', err)
    return { code: -1, message: '搜索失败：' + err.message }
  }
}
