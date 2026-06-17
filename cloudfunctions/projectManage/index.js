// cloudfunctions/projectManage/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '未获取到用户身份' }
  }

  const { action } = event

  try {
    switch (action) {
      case 'list': {
        const res = await db.collection('projects')
          .where({ _openid: openid })
          .orderBy('updatedAt', 'desc')
          .get()
        return { code: 0, data: { projects: res.data } }
      }

      case 'create': {
        const { localId, name, color } = event
        if (!localId || !name) {
          return { code: -1, message: '缺少必要参数' }
        }
        const now = new Date().toISOString()
        const item = {
          _openid: openid,
          localId,
          name,
          color: color || {},
          createdAt: now,
          updatedAt: now
        }
        const addRes = await db.collection('projects').add({ data: item })
        return { code: 0, data: { ...item, _id: addRes._id } }
      }

      case 'update': {
        const { localId, name } = event
        if (!localId) {
          return { code: -1, message: '缺少 localId' }
        }
        const updateData = { updatedAt: new Date().toISOString() }
        if (name !== undefined) updateData.name = name
        await db.collection('projects')
          .where({ _openid: openid, localId })
          .update({ data: updateData })
        return { code: 0, data: {} }
      }

      case 'delete': {
        const { localId } = event
        if (!localId) {
          return { code: -1, message: '缺少 localId' }
        }
        await db.collection('projects')
          .where({ _openid: openid, localId })
          .remove()
        return { code: 0, data: {} }
      }

      default:
        return { code: -1, message: '不支持的操作: ' + action }
    }
  } catch (err) {
    console.error('projectManage error:', err)
    return { code: -1, message: '操作失败：' + err.message }
  }
}
