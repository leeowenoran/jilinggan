// utils/sync.js
// 云端同步工具
const storage = require('./storage')

/**
 * 用户登录 - 调用云函数 userLogin
 */
function login() {
  return new Promise((resolve) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      resolve({ success: false, error: '云环境未初始化' })
      return
    }
    wx.cloud.callFunction({
      name: 'userLogin',
      success: (res) => {
        if (res && res.result && res.result.code === 0) {
          const userData = res.result.data || {}
          const userInfo = {
            isLoggedIn: true,
            nickName: userData.nickName || '',
            avatarUrl: userData.avatarUrl || '',
            openid: userData._openid || '',
            cloudId: userData._id || ''
          }
          storage.saveUserInfo(userInfo)
          const app = getApp()
          app.globalData.isLoggedIn = true
          app.globalData.userInfo = userInfo
          resolve({ success: true, ...userInfo })
        } else {
          const errMsg = (res.result && res.result.message) || '登录失败'
          resolve({ success: false, error: errMsg })
        }
      },
      fail: (err) => {
        resolve({ success: false, error: err.errMsg || '调用失败' })
      }
    })
  })
}

/**
 * 更新用户资料
 */
function updateProfile(data) {
  return new Promise((resolve) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      // 离线时本地保存
      const userInfo = storage.getUserInfo() || {}
      Object.assign(userInfo, data)
      storage.saveUserInfo(userInfo)
      const app = getApp()
      if (app) { app.globalData.userInfo = userInfo }
      resolve({ success: true, localOnly: true })
      return
    }
    wx.cloud.callFunction({
      name: 'userUpdateProfile',
      data,
      success: (res) => {
        if (res && res.result && res.result.code === 0) {
          const userInfo = storage.getUserInfo()
          if (userInfo) {
            Object.assign(userInfo, data)
            storage.saveUserInfo(userInfo)
            const app = getApp()
            app.globalData.userInfo = userInfo
          }
          resolve({ success: true })
        } else {
          resolve({ success: false, error: (res.result && res.result.message) || '更新失败' })
        }
      },
      fail: (err) => {
        resolve({ success: false, error: err.errMsg || '调用失败' })
      }
    })
  })
}

/**
 * 上传灵感到云端
 */
function syncUpload() {
  const queue = storage.getSyncQueue()
  if (queue.length === 0) return
  if (!wx.cloud || !wx.cloud.callFunction) return

  const inspirations = storage.getInspirations()
  const items = inspirations.filter(i => queue.includes(i.localId) && !i.isDeleted)

  if (items.length === 0) {
    storage.clearSyncQueue()
    return
  }

  wx.cloud.callFunction({
    name: 'syncUpload',
    data: { items },
    success: (res) => {
      if (res.result && res.result.code === 0) {
        storage.clearSyncQueue()
        console.log('同步上传成功')
      }
    },
    fail: (err) => {
      console.error('同步上传失败:', err)
    }
  })
}

/**
 * 从云端下载灵感
 */
function syncDownload() {
  return new Promise((resolve) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      resolve({ success: false, error: '云环境未初始化' })
      return
    }
    wx.cloud.callFunction({
      name: 'syncDownload',
      success: (res) => {
        if (res.result && res.result.code === 0 && res.result.data) {
          const cloudItems = res.result.data.list || []

          // 合并到本地
          const localItems = storage.getInspirations()
          const localMap = {}
          localItems.forEach(item => {
            localMap[item.localId] = item
          })

          cloudItems.forEach(cloudItem => {
            const local = localMap[cloudItem.localId]
            if (local) {
              // 已存在：用云端的 updatedAt 判断覆盖
              if (!local.updatedAt || new Date(cloudItem.updatedAt) > new Date(local.updatedAt)) {
                Object.assign(local, cloudItem)
              }
            } else {
              // 新数据：加入本地
              localItems.unshift(cloudItem)
            }
          })

          wx.setStorageSync('inspirations', localItems)
          resolve({ success: true, count: cloudItems.length })
        } else {
          resolve({ success: false, error: '下载失败' })
        }
      },
      fail: (err) => {
        resolve({ success: false, error: err.errMsg || '调用失败' })
      }
    })
  })
}

/**
 * 检查云环境是否可用
 */
function checkCloudAvailable() {
  try {
    return !!(wx.cloud && wx.cloud.callFunction)
  } catch (e) {
    return false
  }
}

module.exports = {
  login,
  updateProfile,
  syncUpload,
  syncDownload,
  checkCloudAvailable
}
