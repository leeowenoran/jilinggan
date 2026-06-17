// cloudfunctions/syncDownload/index.js
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

  const lastSyncAt = event.lastSyncAt || ''

  try {
    let inspirations = []

    // 尝试查询灵感集合（集合首次使用前可能不存在）
    let collectionExists = true
    try {
      await db.collection('inspirations').limit(1).get()
    } catch (e) {
      if (e.errCode === -502005) {
        // 集合不存在，返回空
        collectionExists = false
      } else {
        throw e
      }
    }

    if (collectionExists) {
      if (lastSyncAt) {
        // 增量同步：查询 lastSyncAt 之后更新的记录
        const res = await db.collection('inspirations')
          .where({
            _openid: openid,
            updatedAt: _.gt(lastSyncAt)
          })
          .orderBy('updatedAt', 'asc')
          .limit(MAX_LIMIT)
          .get()
        inspirations = res.data
      } else {
        // 首次同步：拉取全部记录
        const countRes = await db.collection('inspirations')
          .where({ _openid: openid })
          .count()

        const total = countRes.total
        if (total > 0) {
          // 分批拉取
          const batchTimes = Math.ceil(total / MAX_LIMIT)
          const tasks = []
          for (let i = 0; i < batchTimes; i++) {
            tasks.push(
              db.collection('inspirations')
                .where({ _openid: openid })
                .orderBy('updatedAt', 'asc')
                .skip(i * MAX_LIMIT)
                .limit(MAX_LIMIT)
                .get()
            )
          }
          const results = await Promise.all(tasks)
          results.forEach(res => {
            inspirations = inspirations.concat(res.data)
          })
        }
      }
    }

    const serverTime = new Date().toISOString()

    // 更新用户最后同步时间（静默失败，不影响主流程）
    try {
      await db.collection('users')
        .where({ _openid: openid })
        .update({
          data: { lastSyncAt: serverTime }
        })
    } catch (e) {
      console.warn('更新用户同步时间失败:', e.message)
    }

    return {
      code: 0,
      data: {
        inspirations,
        serverTime
      }
    }
  } catch (err) {
    console.error('syncDownload error:', err)
    return { code: -1, message: '同步下载失败：' + err.message }
  }
}
