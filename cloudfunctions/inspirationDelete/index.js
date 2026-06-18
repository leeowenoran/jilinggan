// cloudfunctions/inspirationDelete/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '未获取到用户身份' }
  }

  const { localId, hardDelete } = event
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

    if (hardDelete) {
      // 硬删除
      await db.collection('inspirations').doc(res.data[0]._id).remove()
      return { code: 0, data: { deleted: true, hardDelete: true } }
    } else {
      // 软删除
      await db.collection('inspirations')
        .doc(res.data[0]._id)
        .update({
          data: {
            isDeleted: true,
            updatedAt: new Date().toISOString()
          }
        })
      return { code: 0, data: { deleted: true, hardDelete: false } }
    }
  } catch (err) {
    console.error('inspirationDelete error:', err)
    return { code: -1, message: '删除失败：' + err.message }
  }
}
