// cloudfunctions/syncUpload/index.js
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, message: '未获取到用户身份' }
  }

  const inspirations = event.inspirations
  if (!Array.isArray(inspirations) || inspirations.length === 0) {
    return { code: 0, data: { mapping: [], conflicts: [] } }
  }

  const mapping = []
  const conflicts = []

  try {
    for (const item of inspirations) {
      const { localId, content, tags, timeSlot, supplement, source, voiceFileId, dateTag, version, isDeleted, createdAt, updatedAt } = item

      // 内容安全检测（微信内置 API，不合规会抛 87014）
      try {
        if (content && content.trim()) {
          await cloud.openapi.security.msgSecCheck({ content: content.trim().slice(0, 2000) })
        }
      } catch (e) {
        if (e.errCode === 87014) {
          console.warn('内容不合规，跳过:', localId)
          conflicts.push({ localId, reason: '内容未通过安全检测' })
          continue
        }
        // 其他错误（如权限未开通）不阻断上传
        console.warn('msgSecCheck 调用失败:', e.message)
      }

      if (!localId) {
        conflicts.push({ localId: '', reason: '缺少 localId' })
        continue
      }

      // 查重：同一个 openid 下是否已有相同 localId 的记录
      let existItem = null
      try {
        const existRes = await db.collection('inspirations')
          .where({
            _openid: openid,
            localId: localId
          })
          .get()
        if (existRes.data.length > 0) {
          existItem = existRes.data[0]
        }
      } catch (e) {
        // 集合不存在时忽略，视为无记录
        if (e.errCode !== -502005) throw e
      }

      if (existItem) {
        // 已存在，版本号更高则更新
        if (version > (existItem.version || 1)) {
          await db.collection('inspirations')
            .doc(existItem._id)
            .update({
              data: {
                content,
                tags: tags || [],
                timeSlot: timeSlot || '',
                supplement: supplement || '',
                source: source || 'text',
                voiceFileId: voiceFileId || '',
                dateTag: dateTag || '',
                version: version,
                isDeleted: !!isDeleted,
                updatedAt: updatedAt || new Date().toISOString()
              }
            })
          mapping.push({ localId, cloudId: existItem._id })
        } else {
          // 服务端版本更新或相同，不覆盖，返回冲突
          mapping.push({ localId, cloudId: existItem._id })
          if (version < (existItem.version || 1)) {
            conflicts.push({ localId, reason: '服务端版本更新' })
          }
        }
      } else {
        // 新记录，插入
        const addRes = await db.collection('inspirations').add({
          data: {
            _openid: openid,
            localId,
            content: content || '',
            tags: tags || [],
            timeSlot: timeSlot || '',
            supplement: supplement || '',
            source: source || 'text',
            voiceFileId: voiceFileId || '',
            dateTag: dateTag || '',
            version: version || 1,
            isDeleted: !!isDeleted,
            createdAt: createdAt || new Date().toISOString(),
            updatedAt: updatedAt || new Date().toISOString()
          }
        })
        mapping.push({ localId, cloudId: addRes._id })
      }
    }

    // 更新用户最后同步时间（静默失败，不影响主流程）
    try {
      await db.collection('users')
        .where({ _openid: openid })
        .update({
          data: { lastSyncAt: new Date().toISOString() }
        })
    } catch (e) {
      console.warn('更新用户同步时间失败:', e.message)
    }

    return {
      code: 0,
      data: {
        mapping,
        conflicts
      }
    }
  } catch (err) {
    console.error('syncUpload error:', err)
    return { code: -1, message: '同步上传失败：' + err.message }
  }
}
