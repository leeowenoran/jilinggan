// cloudfunctions/userLogin/index.js
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '获取 openid 失败' }
  }

  try {
    // 查找用户是否已存在
    const userRes = await db.collection('users')
      .where({ _openid: openid })
      .get()

    let userInfo
    let isNewUser = false

    if (userRes.data.length === 0) {
      // 新用户，创建记录
      const now = new Date()
      const newUser = {
        _openid: openid,
        nickName: '',
        avatarUrl: '',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        lastSyncAt: null
      }
      const addRes = await db.collection('users').add({ data: newUser })
      userInfo = { ...newUser, _id: addRes._id }
      isNewUser = true
    } else {
      userInfo = userRes.data[0]
    }

    return {
      code: 0,
      data: {
        userInfo: {
          _id: userInfo._id,
          openid: openid,
          nickName: userInfo.nickName || '',
          avatarUrl: userInfo.avatarUrl || '',
          lastSyncAt: userInfo.lastSyncAt || null
        },
        isNewUser
      }
    }
  } catch (err) {
    console.error('userLogin error:', err)
    return { code: -1, message: '登录失败：' + err.message }
  }
}
