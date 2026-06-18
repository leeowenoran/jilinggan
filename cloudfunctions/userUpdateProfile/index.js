// cloudfunctions/userUpdateProfile/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '获取 openid 失败' }
  }

  const { nickName, avatarUrl } = event
  if (!nickName && !avatarUrl) {
    return { code: -1, message: '没有需要更新的字段' }
  }

  try {
    const updateData = { updatedAt: new Date().toISOString() }
    if (nickName !== undefined) updateData.nickName = nickName
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl

    await db.collection('users').where({ _openid: openid }).update({ data: updateData })

    const userRes = await db.collection('users').where({ _openid: openid }).get()
    return { code: 0, data: { userInfo: userRes.data[0] } }
  } catch (err) {
    console.error('userUpdateProfile error:', err)
    return { code: -1, message: '更新失败：' + err.message }
  }
}
